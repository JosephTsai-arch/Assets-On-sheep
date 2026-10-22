import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db, cleanForFirestore, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { PendingBatch, BatchTransactionItem } from '../types';

const LOCAL_DRAFT_KEY_PREFIX = 'aos_batch_draft_';

/**
 * [前端] 儲存批次草稿至 LocalStorage
 */
export function saveLocalDraft(draft: PendingBatch, userId?: string): void {
  try {
    const key = `${LOCAL_DRAFT_KEY_PREFIX}${userId || draft.userId || 'current'}`;
    localStorage.setItem(key, JSON.stringify(draft));
    // 同時記錄最近一份草稿 key
    localStorage.setItem('aos_latest_batch_draft_key', key);
  } catch (e) {
    console.warn('[saveLocalDraft] 本地儲存失敗:', e);
  }
}

/**
 * [前端] 從 LocalStorage 讀取批次草稿
 */
export function getLocalDraft(userId?: string): PendingBatch | null {
  try {
    const targetKey = userId ? `${LOCAL_DRAFT_KEY_PREFIX}${userId}` : localStorage.getItem('aos_latest_batch_draft_key');
    if (!targetKey) return null;
    const raw = localStorage.getItem(targetKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBatch;
    if (parsed && parsed.status === 'PENDING') {
      return parsed;
    }
  } catch (e) {
    console.warn('[getLocalDraft] 本地讀取失敗:', e);
  }
  return null;
}

/**
 * [前端] 清除 LocalStorage 批次草稿
 */
export function clearLocalDraft(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(`${LOCAL_DRAFT_KEY_PREFIX}${userId}`);
    }
    const latestKey = localStorage.getItem('aos_latest_batch_draft_key');
    if (latestKey) {
      localStorage.removeItem(latestKey);
      localStorage.removeItem('aos_latest_batch_draft_key');
    }
  } catch (e) {
    console.warn('[clearLocalDraft] 本地清除失敗:', e);
  }
}

/**
 * [後端] 儲存/同步批量記帳草稿至 Firestore
 */
export async function saveBatchDraftBackend(
  batchId: string,
  items: BatchTransactionItem[]
): Promise<PendingBatch | null> {
  try {
    const batchRef = doc(db, 'pending_batches', batchId);
    const snap = await getDoc(batchRef);
    if (!snap.exists()) return null;

    const batch = snap.data() as PendingBatch;
    batch.items = items;
    const validItems = items.filter((i) => !i.isIgnored && i.amount > 0);
    batch.totalExpense = validItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + i.amount, 0);
    batch.totalIncome = validItems
      .filter((i) => i.type === 'income')
      .reduce((sum, i) => sum + i.amount, 0);
    batch.validCount = validItems.length;
    batch.zeroCount = items.length - validItems.length;
    batch.isDraft = true;
    batch.updatedAt = new Date().toISOString();

    await setDoc(batchRef, cleanForFirestore(batch));
    return batch;
  } catch (e: any) {
    console.warn('[saveBatchDraftBackend Error]:', e?.message);
    return null;
  }
}

/**
 * [後端] 取得使用者目前有效的批量記帳草稿 (30分鐘內有效，逾期自動清除)
 */
export async function getUserActiveBatchDraft(userId: string): Promise<PendingBatch | null> {
  const DRAFT_EXPIRY_MS = 30 * 60 * 1000;
  const now = Date.now();

  try {
    const { getUserState, getPendingBatch, removePendingBatch, setUserState } = await import('./lineStateManager');
    const userState = await getUserState(userId);

    // 優先快取查詢
    if (userState.tempBatchId) {
      const batch = await getPendingBatch(userState.tempBatchId);
      if (batch && batch.status === 'PENDING') {
        const createdTime = batch.createdAt ? new Date(batch.createdAt).getTime() : userState.updatedAt;
        if (now - createdTime > DRAFT_EXPIRY_MS) {
          // 放太久自動清除
          await removePendingBatch(userState.tempBatchId);
          await setUserState(userId, { state: 'IDLE', updatedAt: now });
        } else {
          return batch;
        }
      }
    }

    if (isFirestoreQuotaExceeded()) {
      return null;
    }

    // 使用精準過濾條件查詢，絕不全表掃描
    let snap = await getDocs(
      query(collection(db, 'pending_batches'), where('userId', '==', userId), where('status', '==', 'PENDING'), limit(5))
    ).catch((err) => {
      if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
        markQuotaExceeded();
      }
      return null;
    });

    if ((!snap || snap.empty) && (userId.startsWith('line_') || userId.startsWith('U'))) {
      const cleanLineId = userId.replace(/^line_/, '');
      snap = await getDocs(
        query(collection(db, 'pending_batches'), where('lineUserId', '==', cleanLineId), where('status', '==', 'PENDING'), limit(5))
      ).catch((err) => {
        if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
          markQuotaExceeded();
        }
        return null;
      });
    }

    const matches: PendingBatch[] = [];
    if (snap && snap.docs) {
      for (const d of snap.docs) {
        const data = d.data() as PendingBatch;
        if (data && data.status === 'PENDING') {
          const createdTime = data.createdAt ? new Date(data.createdAt).getTime() : 0;
          if (now - createdTime > DRAFT_EXPIRY_MS) {
            await deleteDoc(d.ref).catch(() => {});
          } else {
            matches.push(data);
          }
        }
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return matches[0];
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }
  return null;
}

/**
 * [後端] 捨棄並徹底清除特定批量草稿
 */
export async function discardBatchDraft(batchId: string): Promise<boolean> {
  try {
    const batchRef = doc(db, 'pending_batches', batchId);
    await deleteDoc(batchRef);
    return true;
  } catch (e: any) {
    console.warn('[discardBatchDraft Error]:', e?.message);
    return false;
  }
}
