import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, cleanForFirestore, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { FlexPendingTransactionData } from './lineFlexTemplates';
import { PendingBatch, LedgerCurrency } from '../types';
import { getPendingTx, removePendingTx, getUserState, setUserState, getPendingBatch, removePendingBatch } from './lineStateManager';
import { createTransaction } from './transactionService';
import { getUserAssetAccounts } from './walletService';
import { getUserCategories } from './categoryService';
import { commitBatchTransactions } from './batchTransactionService';

// 短時間內有效互動視窗：30 分鐘 (毫秒) - 在此時間內繼續輸入，提供使用者「完成上一筆」或「放棄上一筆」
export const DRAFT_INTERACTIVE_WINDOW_MS = 30 * 60 * 1000;
// 過期閾值：30 分鐘 (毫秒) - 超過此時間視為「放太久」，自動安靜徹底清除，不再打擾使用者記新帳
export const DRAFT_EXPIRY_MS = 30 * 60 * 1000;

export interface DraftCheckResult {
  hasActiveDraft: boolean;
  draftType?: 'single' | 'batch';
  draftId?: string;
  summaryTitle?: string;
  summaryAmount?: number;
  summaryCurrency?: string;
  summaryCategory?: string;
  summaryLedger?: string;
  createdAt?: string;
  ageMinutes?: number;
}

/**
 * 檢查使用者是否留有未確認之草稿 (單筆或批量)
 * 若草稿已逾期 (放太久 > 30分鐘)，則自動徹底清除；若在短時間內 (<= 30分鐘)，則回傳草稿摘要
 */
export async function checkAndCleanUserDraft(
  targetUserId: string,
  lineUserId: string
): Promise<DraftCheckResult> {
  const userState = await getUserState(lineUserId);

  // 1. 檢查單筆交易草稿 (tempTxId)
  if (userState.tempTxId) {
    const pendingTx = await getPendingTx(userState.tempTxId);
    if (pendingTx && !pendingTx.existingTxId) {
      const parsedTime = pendingTx.createdAt ? new Date(pendingTx.createdAt).getTime() : NaN;
      const createdTime = !isNaN(parsedTime) && parsedTime > 0 ? parsedTime : userState.updatedAt || Date.now();
      const ageMs = Math.max(0, Date.now() - createdTime);

      // 若超過 30 分鐘，視為「放太久」，自動執行靜默徹底清除
      if (ageMs > DRAFT_EXPIRY_MS) {
        console.log(`[DraftManager] 單筆草稿 ${userState.tempTxId} 放太久 (${Math.round(ageMs / 60000)}分鐘)，自動徹底清除`);
        await removePendingTx(userState.tempTxId);
        await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
      } else {
        return {
          hasActiveDraft: true,
          draftType: 'single',
          draftId: pendingTx.tempTxId,
          summaryTitle: pendingTx.title,
          summaryAmount: pendingTx.amount,
          summaryCurrency: pendingTx.currency || 'TWD',
          summaryCategory: pendingTx.categoryName || '一般支出',
          summaryLedger: pendingTx.ledgerName || '個人帳本',
          createdAt: pendingTx.createdAt,
          ageMinutes: Math.max(1, Math.round(ageMs / 60000)),
        };
      }
    } else if (!pendingTx) {
      // 找不到暫存交易物件，清理孤立的狀態
      await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
    }
  }

  // 2. 檢查批量交易草稿 (tempBatchId)
  if (userState.tempBatchId) {
    const batch = await getPendingBatch(userState.tempBatchId);
    if (batch && batch.status === 'PENDING') {
      const parsedTime = batch.createdAt ? new Date(batch.createdAt).getTime() : NaN;
      const createdTime = !isNaN(parsedTime) && parsedTime > 0 ? parsedTime : userState.updatedAt || Date.now();
      const ageMs = Math.max(0, Date.now() - createdTime);

      // 若超過 30 分鐘，視為「放太久」，自動徹底清除
      if (ageMs > DRAFT_EXPIRY_MS) {
        console.log(`[DraftManager] 批量草稿 ${userState.tempBatchId} 放太久，自動徹底清除`);
        await removePendingBatch(userState.tempBatchId);
        await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
      } else {
        return {
          hasActiveDraft: true,
          draftType: 'batch',
          draftId: batch.id,
          summaryTitle: `批量記帳 (${batch.validCount} 筆明細)`,
          summaryAmount: batch.totalExpense,
          summaryCurrency: 'TWD',
          summaryCategory: '批量交易',
          summaryLedger: '待入帳帳本',
          createdAt: batch.createdAt,
          ageMinutes: Math.max(1, Math.round(ageMs / 60000)),
        };
      }
    } else if (!batch || batch.status !== 'PENDING') {
      // 批量草稿已非 PENDING，清理孤立狀態
      await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
    }
  }

  return { hasActiveDraft: false };
}

/**
 * 取得特定使用者在 30 分鐘內的活躍單筆草稿 (支援 Web 與 LINE)
 */
export async function getUserActiveSingleDraft(userId: string): Promise<FlexPendingTransactionData | null> {
  try {
    const userState = await getUserState(userId);
    if (userState.tempTxId) {
      const tx = await getPendingTx(userState.tempTxId);
      if (tx) {
        const createdTime = tx.createdAt ? new Date(tx.createdAt).getTime() : userState.updatedAt;
        if (Date.now() - createdTime <= DRAFT_EXPIRY_MS) {
          return tx;
        }
      }
    }
  } catch (e: any) {
    console.warn('[getUserActiveSingleDraft Error]:', e?.message);
  }
  return null;
}

/**
 * 執行完成/入帳單筆未確認草稿
 */
export async function commitSingleDraft(
  tempTxId: string,
  targetUserId: string,
  lineUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const pendingTx = await getPendingTx(tempTxId);
    if (!pendingTx) {
      return { success: false, message: '該草稿已入帳或已逾期' };
    }

    const userAssetAccounts = await getUserAssetAccounts(targetUserId);
    const firstAcc = userAssetAccounts && userAssetAccounts.length > 0 ? userAssetAccounts[0] : null;
    const firstSubId = firstAcc?.subAccounts && firstAcc.subAccounts.length > 0 ? firstAcc.subAccounts[0].id : null;

    const finalAccountId = pendingTx.accountId || firstAcc?.id || 'acc_default';
    const finalSubAccountId = pendingTx.subAccountId || firstSubId || undefined;

    const userCats = await getUserCategories(targetUserId);
    const matchedCat = userCats.find(
      (c) =>
        (pendingTx.type ? c.type === pendingTx.type : true) &&
        (c.name === pendingTx.categoryName ||
          c.name.includes(pendingTx.categoryName) ||
          pendingTx.categoryName.includes(c.name))
    );
    const finalCategoryId =
      matchedCat?.id ||
      pendingTx.categoryId ||
      (pendingTx.type === 'income'
        ? `cat_inc_${targetUserId}_其他收入`
        : `cat_exp_${targetUserId}_其他雜支`);
    const finalCategoryName = matchedCat?.name || pendingTx.categoryName;

    await createTransaction(targetUserId, {
      ledgerId: pendingTx.ledgerId || 'ledger_default_main',
      type: pendingTx.type,
      amount: pendingTx.amount,
      currency: (pendingTx.currency as LedgerCurrency) || 'TWD',
      categoryId: finalCategoryId,
      categoryName: finalCategoryName,
      accountId: finalAccountId,
      subAccountId: finalSubAccountId,
      date: pendingTx.date,
      title: pendingTx.title,
      note: pendingTx.note || (pendingTx.splitNote ? `LINE 記帳 (${pendingTx.splitNote})` : `LINE 記帳: ${pendingTx.title}`),
      splitDetails: pendingTx.splitDetails || undefined,
      payerId: targetUserId,
      payerName: pendingTx.userName || '我',
      payerMemberId: targetUserId,
    });

    await removePendingTx(tempTxId);
    await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

    return {
      success: true,
      message: `已成功將上一筆【${pendingTx.title}】NT$ ${pendingTx.amount.toLocaleString()} 元正式入帳！`,
    };
  } catch (err: any) {
    console.error('[commitSingleDraft Error]:', err);
    return { success: false, message: err?.message || '入帳失敗' };
  }
}

/**
 * 放棄並徹底清除單筆草稿
 */
export async function discardSingleDraft(
  tempTxId: string,
  lineUserId: string
): Promise<void> {
  await removePendingTx(tempTxId);
  await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
}

export { buildDraftResolutionFlexMessage, buildDraftResolutionQuickReply, buildDraftResolutionTextMessage } from './draftFlexTemplates';

let lastDraftPurgeTime = 0;
const PURGE_THROTTLE_MS = 30 * 60 * 1000; // 限制至少間隔 30 分鐘才巡檢一次，徹底根治配額耗盡

/**
 * 伺服器背景定時巡檢清理所有超過 30 分鐘之待入帳草稿 (包含單筆與批量，含雲端配額自動降級保護)
 */
export async function purgeAllExpiredDrafts(): Promise<{ purgedCount: number }> {
  // 1. 若雲端資料庫已達每日免費讀取上限，或未達巡檢節流週期，安靜跳過定時全表掃描
  const now = Date.now();
  if (isFirestoreQuotaExceeded() || now - lastDraftPurgeTime < PURGE_THROTTLE_MS) {
    return { purgedCount: 0 };
  }
  lastDraftPurgeTime = now;

  let purgedCount = 0;

  try {
    const { query, limit } = await import('firebase/firestore');

    // 2. 清理 pending_transactions (加上 limit(20) 嚴格防範全表掃描消耗配額)
    const txSnap = await Promise.race([
      getDocs(query(collection(db, 'pending_transactions'), limit(20))),
      new Promise<any>((res) => setTimeout(() => res(null), 2000)),
    ]).catch((err) => {
      if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
        markQuotaExceeded();
      }
      return null;
    });

    if (txSnap && txSnap.docs) {
      for (const d of txSnap.docs) {
        const data = d.data();
        const createdTime = data.createdAt ? new Date(data.createdAt).getTime() : 0;
        if (now - createdTime > DRAFT_EXPIRY_MS) {
          await deleteDoc(d.ref).catch(() => {});
          purgedCount++;
        }
      }
    }

    if (isFirestoreQuotaExceeded()) {
      return { purgedCount };
    }

    // 3. 清理 pending_batches (加上 limit(20) 防護)
    const batchSnap = await Promise.race([
      getDocs(query(collection(db, 'pending_batches'), limit(20))),
      new Promise<any>((res) => setTimeout(() => res(null), 2000)),
    ]).catch((err) => {
      if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
        markQuotaExceeded();
      }
      return null;
    });

    if (batchSnap && batchSnap.docs) {
      for (const d of batchSnap.docs) {
        const data = d.data() as PendingBatch;
        const createdTime = data.createdAt ? new Date(data.createdAt).getTime() : 0;
        if (data.status === 'PENDING' && now - createdTime > DRAFT_EXPIRY_MS) {
          await deleteDoc(d.ref).catch(() => {});
          purgedCount++;
        }
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('Quota limit exceeded') || e?.code === 'resource-exhausted') {
      markQuotaExceeded();
      return { purgedCount: 0 };
    }
  }

  return { purgedCount };
}
