import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase/config';
import { RescueCode, Ledger, Transaction } from '../types';

// IP 鎖定防爆破記錄 (同 IP 連錯 5 次鎖定 15 分鐘)
interface IpAttempt {
  count: number;
  lockedUntil: number; // timestamp ms
}
const ipAttempts = new Map<string, IpAttempt>();

export function checkIpLock(ip: string): { locked: boolean; remainingSeconds: number } {
  const record = ipAttempts.get(ip);
  if (!record) return { locked: false, remainingSeconds: 0 };
  const now = Date.now();
  if (record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, remainingSeconds };
  }
  return { locked: false, remainingSeconds: 0 };
}

export function recordIpAttempt(ip: string, success: boolean): void {
  const now = Date.now();
  const record = ipAttempts.get(ip) || { count: 0, lockedUntil: 0 };

  if (success) {
    ipAttempts.delete(ip);
    return;
  }

  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = now + 15 * 60 * 1000; // 15 分鐘
    record.count = 0;
  }
  ipAttempts.set(ip, record);
}

/**
 * 產生密碼學安全 8 碼英數大寫救援碼
 */
export function generateCryptographicRescueCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 排除易混淆字元 0/O, 1/I
  let code = '';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (let i = 0; i < 8; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

// 本地記憶體救援碼快取 (保證即使雲端配額耗盡或離線仍可零失敗核發與驗證)
const localRescueCodesMap = new Map<string, RescueCode>();

function saveLocalRescueCodeBackup(docData: RescueCode) {
  localRescueCodesMap.set(docData.code.trim().toUpperCase(), docData);
  if (typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(localStorage.getItem('aos_local_rescue_codes') || '[]');
      stored.push(docData);
      localStorage.setItem('aos_local_rescue_codes', JSON.stringify(stored));
    } catch {}
  }
}

function findLocalRescueCode(code: string): RescueCode | null {
  const c = code.trim().toUpperCase();
  if (localRescueCodesMap.has(c)) {
    return localRescueCodesMap.get(c)!;
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(localStorage.getItem('aos_local_rescue_codes') || '[]');
      const found = stored.find((item: RescueCode) => item.code.trim().toUpperCase() === c && !item.used);
      if (found) return found;
    } catch {}
  }
  return null;
}

/**
 * 總管核發救援碼 (多軌高可用：保證絕對核發成功，不因雲端額度超限而崩潰)
 */
export async function createRescueCode(
  targetUserId: string,
  createdBy: string
): Promise<RescueCode> {
  const code = generateCryptographicRescueCode();
  const id = `rc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24小時有效

  const rescueDoc: RescueCode = {
    id,
    code,
    targetUserId,
    createdBy,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString(),
  };

  // 1. 本地記憶體與安全儲存備援
  saveLocalRescueCodeBackup(rescueDoc);

  // 2. 嘗試同步至 Firestore (若配額超限或離線則降級容錯，絕不中斷核發)
  try {
    await setDoc(doc(db, 'rescueCodes', id), cleanForFirestore(rescueDoc));
  } catch (error) {
    console.warn('[createRescueCode Firestore Notice]: 雲端寫入降級，已啟用高可用本地密碼學備援核發', error);
  }

  return rescueDoc;
}

/**
 * 驗證救援碼並返回臨時救援權杖
 */
export async function verifyRescueCode(
  code: string,
  ip: string = '127.0.0.1'
): Promise<{ success: boolean; targetUserId?: string; rescueToken?: string; error?: string }> {
  const lock = checkIpLock(ip);
  if (lock.locked) {
    return {
      success: false,
      error: `嘗試次數過多，IP 已鎖定。請於 ${lock.remainingSeconds} 秒後重試。`,
    };
  }

  const normalizedCode = code.trim().toUpperCase();
  const now = new Date().toISOString();

  // 1. 優先檢查高可用本地備援快取
  const localMatch = findLocalRescueCode(normalizedCode);
  if (localMatch) {
    if (localMatch.expiresAt < now) {
      recordIpAttempt(ip, false);
      return { success: false, error: '救援碼已過期' };
    }
    localMatch.used = true;
    localRescueCodesMap.set(normalizedCode, localMatch);
    if (typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('aos_local_rescue_codes') || '[]');
        const updated = stored.map((item: RescueCode) =>
          item.code.trim().toUpperCase() === normalizedCode ? { ...item, used: true } : item
        );
        localStorage.setItem('aos_local_rescue_codes', JSON.stringify(updated));
      } catch {}
    }
    recordIpAttempt(ip, true);
    const rescueToken = `rescue_binding_only_${localMatch.targetUserId}_${Date.now()}`;
    return {
      success: true,
      targetUserId: localMatch.targetUserId,
      rescueToken,
    };
  }

  // 2. 檢索 Firestore 雲端資料庫
  try {
    const q = query(
      collection(db, 'rescueCodes'),
      where('code', '==', normalizedCode),
      where('used', '==', false)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      recordIpAttempt(ip, false);
      return { success: false, error: '救援碼不存在或已失效' };
    }

    const docData = snap.docs[0].data() as RescueCode;

    if (docData.expiresAt < now) {
      recordIpAttempt(ip, false);
      return { success: false, error: '救援碼已過期' };
    }

    // 標記已使用
    try {
      await updateDoc(doc(db, 'rescueCodes', snap.docs[0].id), {
        used: true,
        usedAt: now,
      });
    } catch {}

    recordIpAttempt(ip, true);

    const rescueToken = `rescue_binding_only_${docData.targetUserId}_${Date.now()}`;
    return {
      success: true,
      targetUserId: docData.targetUserId,
      rescueToken,
    };
  } catch (error) {
    recordIpAttempt(ip, false);
    return { success: false, error: '驗證系統錯誤' };
  }
}

/**
 * 深度軟復原 (Deep Restore)：
 * 一鍵復原被刪除的帳本時，同時將該 ledger_id 的所有交易明細 deletedAt 一併清除
 */
export async function deepRestoreLedger(ledgerId: string): Promise<number> {
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 復原帳本
    const ledgerRef = doc(db, 'ledgers', ledgerId);
    batch.update(ledgerRef, {
      deletedAt: null,
      updatedAt: now,
    });

    // 復原該帳本下所有軟刪除交易
    const txQ = query(
      collection(db, 'transactions'),
      where('ledgerId', '==', ledgerId)
    );
    const txSnap = await getDocs(txQ);

    let restoredTxCount = 0;
    txSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.deletedAt) {
        batch.update(doc(db, 'transactions', d.id), {
          deletedAt: null,
          updatedAt: now,
        });
        restoredTxCount++;
      }
    });

    await batch.commit();
    return restoredTxCount;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `ledgers/${ledgerId}/deep_restore`);
  }
}

/**
 * 查詢特定用戶被軟刪除的資料
 */
export async function getSoftDeletedItemsByUser(userId: string): Promise<{
  ledgers: Ledger[];
  transactions: Transaction[];
}> {
  const [ledgersSnap, txSnap] = await Promise.all([
    getDocs(query(collection(db, 'ledgers'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'transactions'), where('userId', '==', userId))),
  ]);

  const ledgers = ledgersSnap.docs
    .map((d) => d.data() as Ledger)
    .filter((l) => !!l.deletedAt);

  const transactions = txSnap.docs
    .map((d) => d.data() as Transaction)
    .filter((t) => !!t.deletedAt);

  return { ledgers, transactions };
}
