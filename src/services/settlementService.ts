import { collection, doc, getDocs, getDoc, query, where, writeBatch } from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase/config';
import { Transaction, Ledger, Friend, SettlementDebt, AssetAccount } from '../types';
import { calculateMinCashFlow } from '../utils/mathUtils';
import { resolveLedgerMembers } from './memberResolverService';

export interface LedgerSettlementSummary {
  ledgerId: string;
  currency: string;
  memberBalances: { id: string; name: string; balance: number }[];
  debts: SettlementDebt[];
}

/**
 * 計算指定共管帳本的 AA 債務餘額與 Min-Cash-Flow 最佳平帳路徑
 */
export function calculateLedgerSettlement(
  ledger: Ledger,
  transactions: Transaction[],
  allFriends: Friend[],
  currentUserId: string,
  currentUserName: string
): LedgerSettlementSummary {
  // 建立成員名單對應表 (包含用戶本人與該帳本內所有成員/虛擬好友)
  const memberNameMap = new Map<string, string>();
  memberNameMap.set(currentUserId, `${currentUserName} (我)`);

  const resolved = resolveLedgerMembers(
    ledger.memberIds,
    allFriends,
    currentUserId,
    currentUserName
  );

  for (const m of resolved) {
    memberNameMap.set(m.id, m.name);
    if (m.rawName) memberNameMap.set(m.rawName, m.name);
    for (const rid of m.rawIds || []) {
      memberNameMap.set(rid, m.name);
    }
  }

  const normalizeId = (id: string) => {
    if (!id) return id;
    const match = resolved.find((m) => m.id === id || m.rawIds?.includes(id));
    if (match) return match.id;
    const friendObj = allFriends.find((f) => f.id === id || f.friendUserId === id);
    return friendObj?.friendUserId || id;
  };

  for (const f of allFriends) {
    if (!memberNameMap.has(f.id)) memberNameMap.set(f.id, f.name);
    if (f.friendUserId && !memberNameMap.has(f.friendUserId)) {
      memberNameMap.set(f.friendUserId, f.name);
    }
  }

  // 僅篩選該帳本且未被刪除的交易
  const ledgerTxs = transactions.filter(
    (t) => t.ledgerId === ledger.id && !t.deletedAt && t.type === 'expense'
  );

  const balances: Record<string, number> = {};
  for (const mId of ledger.memberIds) {
    const norm = normalizeId(mId);
    balances[norm] = 0;
  }
  balances[currentUserId] = balances[currentUserId] || 0;

  for (const tx of ledgerTxs) {
    const rawPayer = tx.payerId || tx.userId;
    const payerId = normalizeId(rawPayer);

    if (tx.splitDetails && tx.splitDetails.length > 0) {
      for (const split of tx.splitDetails) {
        const normMemberId = normalizeId(split.memberId);
        if (!split.isSettled && normMemberId !== payerId) {
          balances[payerId] = (balances[payerId] || 0) + split.amount;
          balances[normMemberId] = (balances[normMemberId] || 0) - split.amount;
        }
      }
    }
  }

  const memberList = Object.keys(balances).map((id) => ({
    id,
    name: memberNameMap.get(id) || (id === currentUserId ? '我' : '成員'),
  }));

  const debts = calculateMinCashFlow(memberList, balances);

  const memberBalances = memberList.map((m) => ({
    id: m.id,
    name: m.name,
    balance: Math.round(balances[m.id] || 0),
  }));

  return {
    ledgerId: ledger.id,
    currency: ledger.currency,
    memberBalances,
    debts,
  };
}

/**
 * 一鍵沖銷結算：為特定債務產生平帳轉帳記錄，並透過 Batch Write 同步更新原始明細 splitDetails.isSettled = true
 */
export async function executeSettlementPayment(
  userId: string,
  ledgerId: string,
  currency: any,
  debt: SettlementDebt,
  accountId?: string
): Promise<Transaction> {
  try {
    const batch = writeBatch(db);
    const id = `tx_settle_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const settleTx: Transaction = {
      id,
      userId,
      ledgerId,
      type: 'transfer',
      amount: debt.amount,
      currency,
      categoryId: 'cat_settlement',
      categoryName: 'AA結算沖銷',
      accountId: accountId || '',
      date: now.split('T')[0],
      title: `🤝 AA平帳：${debt.fromName} 支付給 ${debt.toName}`,
      payerId: debt.fromId,
      payerName: debt.fromName,
      createdAt: now,
      deletedAt: null,
    };

    batch.set(doc(db, 'transactions', id), cleanForFirestore(settleTx));

    // 若有提供真實資產帳戶，同步更動真實資產餘額
    if (accountId) {
      const accRef = doc(db, 'assetAccounts', accountId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const acc = accSnap.data() as AssetAccount;
        const isDebtorPaying = userId === debt.fromId || debt.fromId.includes(userId);
        const delta = isDebtorPaying ? -debt.amount : debt.amount;
        batch.update(accRef, {
          balance: (acc.balance || 0) + delta,
          updatedAt: now,
        });
      }
    }

    // 【必須同步更新】原始交易明細中 splitDetails 的 isSettled = true
    const q = query(
      collection(db, 'transactions'),
      where('ledgerId', '==', ledgerId)
    );
    const snap = await getDocs(q);

    // 尋找代墊收款人是 debt.toId 且分攤者是 debt.fromId 的所有交易明細，將其標記為 isSettled = true
    for (const docSnap of snap.docs) {
      const tx = docSnap.data() as Transaction;
      if (tx.deletedAt || tx.type !== 'expense' || !tx.splitDetails || tx.splitDetails.length === 0) {
        continue;
      }

      const isPayer =
        tx.payerId === debt.toId ||
        tx.userId === debt.toId ||
        tx.payerId?.includes(debt.toId) ||
        tx.userId?.includes(debt.toId) ||
        debt.toId.includes(tx.userId);
      if (!isPayer) continue;

      let hasMatch = false;
      const updatedSplitDetails = tx.splitDetails.map((s) => {
        const matchesDebtFrom =
          s.memberId === debt.fromId ||
          s.memberId.includes(debt.fromId) ||
          debt.fromId.includes(s.memberId);
        if (!s.isSettled && matchesDebtFrom) {
          hasMatch = true;
          return { ...s, isSettled: true };
        }
        return s;
      });

      if (hasMatch) {
        batch.update(doc(db, 'transactions', tx.id), {
          splitDetails: updatedSplitDetails,
          updatedAt: now,
        });
      }
    }

    await batch.commit();
    return settleTx;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settlements/${ledgerId}`);
  }
}
