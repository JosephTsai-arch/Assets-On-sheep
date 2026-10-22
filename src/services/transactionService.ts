import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase/config';
import { Transaction, AssetAccount } from '../types';
import { getUserCandidateIds, expandAllMemberAliases } from './identityService';

export async function getUserTransactions(
  userId: string,
  lineUserId?: string,
  userLedgerIds?: string[]
): Promise<Transaction[]> {
  try {
    const candidateIds = await getUserCandidateIds(userId, lineUserId);

    const txMap = new Map<string, Transaction>();

    const candidateList = Array.from(candidateIds).filter(Boolean);
    const queries: Promise<any>[] = [];

    // 1. 合併檢索本人建立的交易紀錄 (以 'in' 批次查詢，1 次查詢取代 5 次獨立查詢)
    if (candidateList.length > 0) {
      queries.push(getDocs(query(collection(db, 'transactions'), where('userId', 'in', candidateList.slice(0, 10)))));
    }

    // 2. 檢索本人參與分帳的交易明細 (針對主身分檢索，避免指數級乘積查詢)
    const primaryId = candidateList[0];
    const secondaryId = candidateList.find((id) => id !== primaryId && (id.startsWith('U') || id.startsWith('line_')));
    if (primaryId) {
      queries.push(getDocs(query(collection(db, 'transactions'), where('splitMemberIds', 'array-contains', primaryId))));
    }
    if (secondaryId) {
      queries.push(getDocs(query(collection(db, 'transactions'), where('splitMemberIds', 'array-contains', secondaryId))));
    }

    // 3. 檢索本人所屬帳本之交易明細 (以 'in' 批次查詢，大幅減少讀取次數)
    let ledgerIdsToQuery: string[] = userLedgerIds || [];
    if (!userLedgerIds || userLedgerIds.length === 0) {
      try {
        const { getUserLedgers } = await import('./ledgerService');
        const userLedgers = await getUserLedgers(userId, lineUserId);
        if (userLedgers) {
          ledgerIdsToQuery = userLedgers.map((l) => l.id);
        }
      } catch (lErr) {
        console.warn('[getUserTransactions ledger lookup notice]:', lErr);
      }
    }

    if (ledgerIdsToQuery.length > 0) {
      for (let i = 0; i < ledgerIdsToQuery.length; i += 10) {
        const chunk = ledgerIdsToQuery.slice(i, i + 10);
        queries.push(getDocs(query(collection(db, 'transactions'), where('ledgerId', 'in', chunk))));
      }
    }

    const snaps = await Promise.allSettled(queries);

    const userLedgerIdSet = new Set<string>(ledgerIdsToQuery);
    for (const res of snaps) {
      if (res.status !== 'fulfilled') continue;
      const snap = res.value;
      snap.docs.forEach((d: any) => {
        const tx = d.data() as Transaction;
        if (!tx.deletedAt) {
          // 嚴格帳本隔離防護：該交易必須屬於該用戶合法擁有的帳本，或該用戶為分帳成員/付款人
          const isMyTx = candidateIds.has(tx.userId) || candidateIds.has(tx.payerMemberId || tx.payerId || '');
          const isMyLedger = tx.ledgerId ? userLedgerIdSet.has(tx.ledgerId) : false;
          const isParticipant = (tx.splitMemberIds || tx.participantIds || []).some((m) => candidateIds.has(m));

          if (isMyLedger || isParticipant || isMyTx) {
            txMap.set(d.id, tx);
          }
        }
      });
    }

    return Array.from(txMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'transactions');
  }
}

export async function createTransaction(
  userId: string,
  txData: Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'deletedAt'>
): Promise<Transaction> {
  try {
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const rawParticipants = new Set<string>([userId]);
    if (txData.payerMemberId) rawParticipants.add(txData.payerMemberId);
    if (txData.splitDetails && Array.isArray(txData.splitDetails)) {
      txData.splitDetails.forEach((s) => {
        if (s.memberId) rawParticipants.add(s.memberId);
      });
    }
    const participantIds = await expandAllMemberAliases(Array.from(rawParticipants));

    const tx: Transaction & { splitMemberIds?: string[]; participantIds?: string[] } = {
      ...txData,
      id,
      userId,
      amount: Math.abs(txData.amount),
      splitMemberIds: participantIds,
      participantIds,
      createdAt: now,
      deletedAt: null,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'transactions', id), cleanForFirestore(tx));

    // 連動資產餘額
    let effectiveAccountId = tx.accountId;
    let accDoc = effectiveAccountId ? await getDoc(doc(db, 'assetAccounts', effectiveAccountId)) : null;

    // 若傳入的 accountId 不存在或未指定，自動撈取該使用者的真實第一資產帳戶！
    if (!accDoc || !accDoc.exists()) {
      try {
        const { getUserAssetAccounts } = await import('./walletService');
        const userAssets = await getUserAssetAccounts(userId);
        if (userAssets && userAssets.length > 0) {
          effectiveAccountId = userAssets[0].id;
          tx.accountId = effectiveAccountId;
          accDoc = await getDoc(doc(db, 'assetAccounts', effectiveAccountId));
        }
      } catch (aErr) {
        console.warn('[createTransaction asset fallback notice]:', aErr);
      }
    }

    if (accDoc && accDoc.exists()) {
      const acc = accDoc.data() as AssetAccount;
      const accRef = doc(db, 'assetAccounts', acc.id);
      const delta = tx.type === 'income' ? tx.amount : -tx.amount;
      let subAccounts = acc.subAccounts || [];
      let effectiveSubAccountId = tx.subAccountId;

      // 若主帳戶有子帳戶，但未指定子帳戶，默認選擇排序第一的子帳戶執行
      if (!effectiveSubAccountId && subAccounts.length > 0) {
        effectiveSubAccountId = subAccounts[0].id;
        tx.subAccountId = effectiveSubAccountId;
      }

      if (effectiveSubAccountId && subAccounts.length > 0) {
        subAccounts = subAccounts.map((s) =>
          s.id === effectiveSubAccountId ? { ...s, balance: (s.balance || 0) + delta } : s
        );
        const newTotalBalance = subAccounts.reduce((sum, s) => sum + (s.balance || 0), 0);
        batch.update(accRef, cleanForFirestore({ balance: newTotalBalance, subAccounts, updatedAt: now }));
      } else {
        const newBalance = (acc.balance || 0) + delta;
        batch.update(accRef, cleanForFirestore({ balance: newBalance, updatedAt: now }));
      }
    }

    await batch.commit();
    return tx as Transaction;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'transactions');
  }
}

export async function updateTransaction(
  transactionId: string,
  updates: Partial<Transaction>
): Promise<void> {
  try {
    const ref = doc(db, 'transactions', transactionId);
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) return;
    const oldTx = existingSnap.data() as Transaction;

    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 重新運算 participantIds
    let finalUpdates: any = { ...updates };
    if (updates.splitDetails || updates.userId || updates.payerMemberId) {
      const rawParticipants = new Set<string>([updates.userId || oldTx.userId]);
      const payer = updates.payerMemberId || oldTx.payerMemberId;
      if (payer) rawParticipants.add(payer);
      const splits = updates.splitDetails || oldTx.splitDetails;
      if (splits && Array.isArray(splits)) {
        splits.forEach((s) => {
          if (s.memberId) rawParticipants.add(s.memberId);
        });
      }
      const participantIds = await expandAllMemberAliases(Array.from(rawParticipants));
      finalUpdates.splitMemberIds = participantIds;
      finalUpdates.participantIds = participantIds;
    }

    // 資產餘額智慧連動：精準回滾舊紀錄，套用新紀錄
    const oldAccId = oldTx.accountId;
    const newAccId = updates.accountId !== undefined ? updates.accountId : oldTx.accountId;
    const oldSubId = oldTx.subAccountId;
    const newSubId = updates.subAccountId !== undefined ? updates.subAccountId : oldTx.subAccountId;
    const oldDelta = oldTx.type === 'income' ? oldTx.amount : -oldTx.amount;
    const newType = updates.type || oldTx.type;
    const newAmount = updates.amount !== undefined ? updates.amount : oldTx.amount;
    const newDelta = newType === 'income' ? newAmount : -newAmount;

    if (oldAccId && newAccId && oldAccId === newAccId) {
      // 情況 A：同一個資產帳戶內更新
      const accRef = doc(db, 'assetAccounts', oldAccId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const acc = accSnap.data() as AssetAccount;
        let subAccounts = acc.subAccounts || [];

        if (subAccounts.length > 0) {
          if (oldSubId === newSubId && oldSubId) {
            const netChange = newDelta - oldDelta;
            subAccounts = subAccounts.map((s) =>
              s.id === oldSubId ? { ...s, balance: (s.balance || 0) + netChange } : s
            );
          } else {
            // 轉移了子帳戶：舊子帳戶回滾，新子帳戶套用
            if (oldSubId) {
              subAccounts = subAccounts.map((s) =>
                s.id === oldSubId ? { ...s, balance: (s.balance || 0) - oldDelta } : s
              );
            }
            if (newSubId) {
              subAccounts = subAccounts.map((s) =>
                s.id === newSubId ? { ...s, balance: (s.balance || 0) + newDelta } : s
              );
            }
          }
          const newTotalBalance = subAccounts.reduce((sum, s) => sum + (s.balance || 0), 0);
          batch.update(accRef, cleanForFirestore({ balance: newTotalBalance, subAccounts, updatedAt: now }));
        } else {
          const netChange = newDelta - oldDelta;
          batch.update(accRef, { balance: (acc.balance || 0) + netChange, updatedAt: now });
        }
      }
    } else {
      // 情況 B：切換了不同資產帳戶
      // 1. 回滾舊帳戶
      if (oldAccId) {
        const oldRef = doc(db, 'assetAccounts', oldAccId);
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists()) {
          const oldAcc = oldSnap.data() as AssetAccount;
          let subAccounts = oldAcc.subAccounts || [];
          if (oldSubId && subAccounts.length > 0) {
            subAccounts = subAccounts.map((s) =>
              s.id === oldSubId ? { ...s, balance: (s.balance || 0) - oldDelta } : s
            );
            const total = subAccounts.reduce((sum, s) => sum + (s.balance || 0), 0);
            batch.update(oldRef, cleanForFirestore({ balance: total, subAccounts, updatedAt: now }));
          } else {
            batch.update(oldRef, { balance: (oldAcc.balance || 0) - oldDelta, updatedAt: now });
          }
        }
      }

      // 2. 套用新帳戶
      if (newAccId) {
        const newRef = doc(db, 'assetAccounts', newAccId);
        const newSnap = await getDoc(newRef);
        if (newSnap.exists()) {
          const newAcc = newSnap.data() as AssetAccount;
          let subAccounts = newAcc.subAccounts || [];
          if (newSubId && subAccounts.length > 0) {
            subAccounts = subAccounts.map((s) =>
              s.id === newSubId ? { ...s, balance: (s.balance || 0) + newDelta } : s
            );
            const total = subAccounts.reduce((sum, s) => sum + (s.balance || 0), 0);
            batch.update(newRef, cleanForFirestore({ balance: total, subAccounts, updatedAt: now }));
          } else {
            batch.update(newRef, { balance: (newAcc.balance || 0) + newDelta, updatedAt: now });
          }
        }
      }
    }

    batch.update(ref, cleanForFirestore({ ...finalUpdates, updatedAt: now }));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `transactions/${transactionId}`);
  }
}

export async function softDeleteTransaction(transactionId: string): Promise<void> {
  try {
    const ref = doc(db, 'transactions', transactionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const tx = snap.data() as Transaction;
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 壓上 deletedAt
    batch.update(ref, { deletedAt: now, updatedAt: now });

    // 若是雙向轉帳成對記錄，一併軟刪除成對的另一筆
    if (tx.transferPairId) {
      const pairQ = query(
        collection(db, 'transactions'),
        where('transferPairId', '==', tx.transferPairId)
      );
      const pairSnap = await getDocs(pairQ);
      pairSnap.docs.forEach((d) => {
        if (d.id !== transactionId) {
          batch.update(doc(db, 'transactions', d.id), { deletedAt: now, updatedAt: now });
        }
      });
    }

    // 精準回滾資產餘額
    if (tx.accountId) {
      const accRef = doc(db, 'assetAccounts', tx.accountId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const acc = accSnap.data() as AssetAccount;
        // 如果原本是支出(扣款)，軟刪除應加回；如果原本是收入，軟刪除應扣除
        const rollbackDelta = tx.type === 'income' ? -tx.amount : tx.amount;
        let subAccounts = acc.subAccounts;
        if (tx.subAccountId && subAccounts && subAccounts.length > 0) {
          subAccounts = subAccounts.map((s) =>
            s.id === tx.subAccountId ? { ...s, balance: (s.balance || 0) + rollbackDelta } : s
          );
          const newTotalBalance = subAccounts.reduce((sum, s) => sum + (s.balance || 0), 0);
          batch.update(accRef, cleanForFirestore({ balance: newTotalBalance, subAccounts, updatedAt: now }));
        } else {
          batch.update(accRef, {
            balance: (acc.balance || 0) + rollbackDelta,
            updatedAt: now,
          });
        }
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `transactions/${transactionId}`);
  }
}

export interface CategoryCleaningUpdate {
  transactionId: string;
  newCategoryId: string;
  newCategoryName: string;
  newCategoryIcon?: string;
}

/**
 * 批次更新交易之分類 (使用 Firestore writeBatch，嚴格禁止迴圈逐筆 update)
 */
export async function batchUpdateTransactionCategories(
  updates: CategoryCleaningUpdate[]
): Promise<number> {
  if (!updates || updates.length === 0) return 0;
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    for (const item of updates) {
      const ref = doc(db, 'transactions', item.transactionId);
      batch.update(
        ref,
        cleanForFirestore({
          categoryId: item.newCategoryId,
          categoryName: item.newCategoryName,
          categoryIcon: item.newCategoryIcon,
          updatedAt: now,
        })
      );
    }

    await batch.commit();
    return updates.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'transactions/batchUpdateCategories');
  }
}

