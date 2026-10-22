import { doc, setDoc, getDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db, cleanForFirestore, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { Ledger, Friend, SplitDetail, PendingBatch } from '../types';
import { FlexPendingTransactionData } from './lineFlexTemplates';

export interface LineUserState {
  state:
    | 'IDLE'
    | 'WAITING_AMOUNT'
    | 'WAITING_CATEGORY'
    | 'WAITING_ACCOUNT'
    | 'WAITING_SPLIT'
    | 'WAITING_SPLIT_LEDGER'
    | 'WAITING_SPLIT_MEMBERS'
    | 'WAITING_LEDGER'
    | 'WAITING_ALARM_INPUT'
    | 'WAITING_ALARM_TIME'
    | 'WAITING_ALARM_FREQ'
    | 'WAITING_BATCH_CONFIRM'
    | 'WAITING_DRAFT_RESOLUTION'
    | 'CONFIRM_CREATE_ACCOUNT'
    | 'CONFIRM_CREATE_CATEGORY'
    | 'CONFIRM_CREATE_LEDGER'
    | 'CONFIRM_CREATE_FRIEND';
  tempTxId?: string;
  tempBatchId?: string;
  targetLedgerId?: string;
  incomingNewText?: string;
  incomingImageMsgId?: string;
  isTourActive?: boolean;
  tourStep?: number;
  newTargetName?: string;
  updatedAt: number;
}

// 記憶體快取加速暫存狀態與交易
const memoryPendingTx = new Map<string, FlexPendingTransactionData>();
const memoryUserState = new Map<string, LineUserState>();

/**
 * 取得使用者目前的對話狀態 (狀態機核心)
 */
export async function getUserState(lineUserId: string): Promise<LineUserState> {
  const cached = memoryUserState.get(lineUserId);
  if (cached && Date.now() - cached.updatedAt < 30 * 60 * 1000) {
    return cached;
  }

  if (!isFirestoreQuotaExceeded()) {
    try {
      const snap = await getDoc(doc(db, 'line_user_states', lineUserId));
      if (snap.exists()) {
        const st = snap.data() as LineUserState;
        memoryUserState.set(lineUserId, st);
        return st;
      }
    } catch (e: any) {
      if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
        markQuotaExceeded();
      }
    }
  }

  const defaultState: LineUserState = cached || { state: 'IDLE', updatedAt: Date.now() };
  memoryUserState.set(lineUserId, defaultState);
  return defaultState;
}

/**
 * 更新使用者對話狀態
 */
export async function setUserState(lineUserId: string, state: LineUserState): Promise<void> {
  memoryUserState.set(lineUserId, state);
  if (isFirestoreQuotaExceeded()) return;
  try {
    await setDoc(doc(db, 'line_user_states', lineUserId), cleanForFirestore(state));
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }
}

/**
 * 取得待確認暫存交易
 */
export async function getPendingTx(tempTxId: string): Promise<FlexPendingTransactionData | null> {
  const cached = memoryPendingTx.get(tempTxId);
  if (cached) return cached;
  if (isFirestoreQuotaExceeded()) return null;

  try {
    const snap = await getDoc(doc(db, 'pending_transactions', tempTxId));
    if (snap.exists()) {
      const data = snap.data() as FlexPendingTransactionData;
      memoryPendingTx.set(tempTxId, data);
      return data;
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }

  return null;
}

/**
 * 儲存待確認暫存交易
 */
export async function savePendingTx(data: FlexPendingTransactionData): Promise<void> {
  memoryPendingTx.set(data.tempTxId, data);
  if (isFirestoreQuotaExceeded()) return;
  try {
    await setDoc(doc(db, 'pending_transactions', data.tempTxId), cleanForFirestore(data));
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }
}

/**
 * 移除已入帳或放棄的暫存交易
 */
export async function removePendingTx(tempTxId: string): Promise<void> {
  memoryPendingTx.delete(tempTxId);
  if (isFirestoreQuotaExceeded()) return;
  try {
    await deleteDoc(doc(db, 'pending_transactions', tempTxId));
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }
}

// 記憶體快取加速批量記帳暫存
const memoryPendingBatch = new Map<string, PendingBatch>();

/**
 * 取得待確認批量暫存交易
 */
export async function getPendingBatch(batchId: string): Promise<PendingBatch | null> {
  const cached = memoryPendingBatch.get(batchId);
  if (cached) return cached;
  if (isFirestoreQuotaExceeded()) return null;

  try {
    const snap = await getDoc(doc(db, 'pending_batches', batchId));
    if (snap.exists()) {
      const data = snap.data() as PendingBatch;
      memoryPendingBatch.set(batchId, data);
      return data;
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }

  return null;
}

/**
 * 儲存待確認批量暫存交易
 */
export async function savePendingBatch(data: PendingBatch): Promise<void> {
  memoryPendingBatch.set(data.id, data);
  if (isFirestoreQuotaExceeded()) return;
  try {
    await setDoc(doc(db, 'pending_batches', data.id), cleanForFirestore(data));
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }
}

/**
 * 移除已入帳或放棄的批量暫存
 */
export async function removePendingBatch(batchId: string): Promise<void> {
  memoryPendingBatch.delete(batchId);
  if (isFirestoreQuotaExceeded()) return;
  try {
    await deleteDoc(doc(db, 'pending_batches', batchId));
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }
}

/**
 * 查詢使用者在資料庫中「現有的」帳本清單 (嚴格禁止建立新帳本)
 */
export async function getUserExistingLedgers(userId: string): Promise<Ledger[]> {
  try {
    const { getUserLedgers } = await import('./ledgerService');
    const userLedgers = await getUserLedgers(userId);
    if (userLedgers && userLedgers.length > 0) {
      return userLedgers;
    }

    const ledgersRef = collection(db, 'ledgers');
    const snapLedgers = await getDocs(ledgersRef);
    const fallbackLedgers: Ledger[] = [];

    snapLedgers.forEach((d) => {
      const l = d.data() as Ledger;
      if (
        !l.deletedAt &&
        (
          (!l.isShared && (l.userId === userId || l.creatorId === userId)) ||
          (l.isShared && (l.memberIds || []).some((m) => m === userId || m.includes(userId) || userId.includes(m))) ||
          l.id === 'ledger_default_main'
        )
      ) {
        fallbackLedgers.push(l);
      }
    });

    if (fallbackLedgers.length === 0 && userId) {
      try {
        const { initializeUserDefaultLedgers } = await import('./ledgerService');
        const initialized = await initializeUserDefaultLedgers(userId);
        if (initialized && initialized.length > 0) {
          return initialized;
        }
      } catch (initErr) {
        console.warn('[Auto Init Ledgers Warn]:', initErr);
      }
    }

    return fallbackLedgers;
  } catch (e: any) {
    console.warn('[getUserExistingLedgers Error]:', e?.message);
    return [];
  }
}

/**
 * 智慧帳本與均分核心 (嚴禁建立新共管帳本，僅限使用者現有帳本間選擇)
 */
export async function resolveLedgerAndSplit(
  userId: string,
  userName: string,
  amount: number,
  currency: string,
  isSplit: boolean,
  splitNames: string[]
): Promise<{
  ledgerId: string;
  ledgerName: string;
  isSharedLedger: boolean;
  splitDetails?: SplitDetail[];
  splitNote?: string;
  noSharedLedgerWarning?: string;
}> {
  try {
    // 1. 僅撈取現有帳本
    const userLedgers = await getUserExistingLedgers(userId);

    // 分流現有共管帳本與個人帳本
    const sharedLedgers = userLedgers.filter((l) => l.isShared);
    const personalLedgers = userLedgers.filter((l) => !l.isShared);
    const defaultPersonal = personalLedgers[0] || userLedgers[0] || {
      id: 'ledger_default_main',
      name: '日常個人帳本',
      isShared: false,
    };

    // 2. 撈取使用者好友清單
    const { getUserFriends } = await import('./friendService');
    let existingFriends = (await getUserFriends(userId)) || [];

    if (existingFriends.length === 0 && userId) {
      try {
        const { ensureUserDummyFriends } = await import('./friendService');
        const dummies = await ensureUserDummyFriends(userId);
        if (dummies && dummies.length > 0) {
          existingFriends = [...dummies];
        }
      } catch (err) {
        console.warn('[Auto Dummy Friends Warn]:', err);
      }
    }

    // 若需要分帳 (isSplit 為 true 或有指定分帳成員)
    if (isSplit || splitNames.length > 0) {
      const resolvedMembers: { id: string; name: string }[] = [];

      for (const name of splitNames) {
        const cleanName = name.trim().toLowerCase();
        let friend = existingFriends.find(
          (f) =>
            f.name.toLowerCase() === cleanName ||
            f.name.toLowerCase().includes(cleanName) ||
            cleanName.includes(f.name.toLowerCase().split(' ')[0])
        );

        if (!friend) {
          const newFriend: Friend = {
            id: `friend_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            userId,
            ownerId: userId,
            friendUserId: undefined,
            name: name.trim(),
            isDummy: true,
            avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          try {
            await setDoc(doc(db, 'friends', newFriend.id), cleanForFirestore(newFriend));
            existingFriends.push(newFriend);
          } catch (e: any) {
            console.warn('[Auto Friend Create Error]:', e?.message);
          }
          friend = newFriend;
        }
        resolvedMembers.push({ id: friend.friendUserId || friend.id, name: friend.name });
      }

      // 均分計算 (Equal Split)
      const totalParticipants = 1 + resolvedMembers.length;
      const perPersonAmount = Math.round((amount / totalParticipants) * 100) / 100;

      const splitDetails: SplitDetail[] = [
        {
          memberId: userId,
          memberName: userName || '本人',
          amount: perPersonAmount,
          isSettled: true,
        },
        ...resolvedMembers.map((m) => ({
          memberId: m.id,
          memberName: m.name,
          amount: perPersonAmount,
          isSettled: false,
        })),
      ];

      const splitNote = `${totalParticipants}人均分 (每人 ${currency} ${perPersonAmount.toLocaleString()} 元) - 本人、${resolvedMembers.map((m) => m.name).join('、')}`;

      // 嚴格規則：僅在使用者「現有的」共管帳本間選擇，禁止建立新帳本
      if (sharedLedgers.length > 0) {
        let matchedSharedLedger: Ledger | undefined = undefined;

        if (resolvedMembers.length > 0) {
          const targetMemberIds = resolvedMembers.flatMap((m) => [
            m.id,
            `line_${m.id}`,
            m.id.replace(/^line_/, ''),
          ]);
          matchedSharedLedger = sharedLedgers.find((l) =>
            targetMemberIds.some(
              (mid) =>
                l.memberIds &&
                l.memberIds.some((lm) => lm === mid || lm.includes(mid) || mid.includes(lm))
            )
          );
        }

        if (!matchedSharedLedger) {
          matchedSharedLedger = sharedLedgers[0];
        }

        return {
          ledgerId: matchedSharedLedger.id,
          ledgerName: matchedSharedLedger.name,
          isSharedLedger: true,
          splitDetails,
          splitNote,
        };
      } else {
        // 使用者目前無任何共管帳本：禁止自動建立！
        // 歸入其現有個人帳本，但完整保留均分明細，並附帶提示
        const fallbackLedger = defaultPersonal;
        return {
          ledgerId: fallbackLedger.id,
          ledgerName: fallbackLedger.name,
          isSharedLedger: false,
          splitDetails,
          splitNote,
          noSharedLedgerWarning: `⚠️ 提示：您尚未在前台建立共管帳本，已為您記錄分帳明細並暫歸入【${fallbackLedger.name}】。您可於建立共管帳本後點擊下方按鈕切換。`,
        };
      }
    }

    // 非分帳情境：歸入現有個人帳本
    return {
      ledgerId: defaultPersonal.id,
      ledgerName: defaultPersonal.name,
      isSharedLedger: false,
    };
  } catch (err: any) {
    console.warn('[resolveLedgerAndSplit Fallback]:', err?.message);
    return {
      ledgerId: 'ledger_default_main',
      ledgerName: '日常個人帳本',
      isSharedLedger: false,
    };
  }
}
