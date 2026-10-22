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
import { SinkingFund, Budget, Transaction, SinkingCycle, AssetAccount, SubAccount } from '../types';
import { getNextDueDate } from '../utils/mathUtils';

export async function getUserSinkingFunds(userId: string, lineUserId?: string): Promise<SinkingFund[]> {
  try {
    const candidateIds = new Set<string>();
    if (userId) {
      candidateIds.add(userId);
      if (userId.startsWith('line_')) candidateIds.add(userId.replace(/^line_/, ''));
      else candidateIds.add(`line_${userId}`);
    }
    if (lineUserId) {
      candidateIds.add(lineUserId);
      if (lineUserId.startsWith('line_')) candidateIds.add(lineUserId.replace(/^line_/, ''));
      else candidateIds.add(`line_${lineUserId}`);
    }

    const idList = Array.from(candidateIds);
    const q = query(collection(db, 'sinkingFunds'), where('userId', 'in', idList.slice(0, 10)));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as SinkingFund)
      .filter((s) => !s.deletedAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'sinkingFunds');
  }
}

export async function createSinkingFund(
  userId: string,
  params?: {
    title?: string;
    name?: string;
    targetAmount?: number;
    amount?: number;
    accumulatedAmount?: number;
    nextDueDate?: string;
    cycle?: SinkingCycle;
    period?: SinkingCycle;
    type?: 'expense' | 'income';
    targetAccountId?: string;
    categoryId?: string;
    targetLedgerId?: string;
    autoExecute?: boolean;
    dueDay?: number;
    currency?: string;
  }
): Promise<SinkingFund> {
  try {
    const p = params || {};
    const id = `fund_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fundType = p.type === 'income' ? 'income' : 'expense';
    const rawTitle = p.title ?? p.name ?? (fundType === 'income' ? '固定收入項目' : '固定支出項目');
    const title = (typeof rawTitle === 'string' ? rawTitle : String(rawTitle || '')).trim() || (fundType === 'income' ? '固定收入項目' : '固定支出項目');
    const rawAmount = p.targetAmount ?? p.amount ?? 0;
    const targetAmount = Number(rawAmount) || 0;
    const cycle = (p.cycle || p.period || 'monthly') as SinkingCycle;
    const nextDueDate = p.nextDueDate || new Date().toISOString().substring(0, 7);

    const fund: SinkingFund = {
      id,
      userId,
      title,
      targetAmount,
      accumulatedAmount: fundType === 'expense' ? (Number(p.accumulatedAmount) || 0) : 0,
      nextDueDate,
      cycle,
      type: fundType,
      targetAccountId: p.targetAccountId || '',
      categoryId: p.categoryId || '',
      targetLedgerId: p.targetLedgerId || '',
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    await setDoc(doc(db, 'sinkingFunds', id), cleanForFirestore(fund));
    return fund;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sinkingFunds');
  }
}

export async function updateSinkingFund(
  fundId: string,
  params?: Partial<{
    title?: string;
    name?: string;
    targetAmount?: number;
    amount?: number;
    accumulatedAmount?: number;
    nextDueDate?: string;
    cycle?: SinkingCycle;
    period?: SinkingCycle;
    type?: 'expense' | 'income';
    targetAccountId?: string;
    categoryId?: string;
    targetLedgerId?: string;
  }>
): Promise<void> {
  try {
    const p = params || {};
    const ref = doc(db, 'sinkingFunds', fundId);
    const updates: any = {
      ...p,
      updatedAt: new Date().toISOString(),
    };
    if (p.title !== undefined || p.name !== undefined) {
      const raw = p.title ?? p.name;
      updates.title = (typeof raw === 'string' ? raw : String(raw || '')).trim();
    }
    const rawAmount = p.targetAmount ?? p.amount;
    if (rawAmount !== undefined) {
      updates.targetAmount = Number(rawAmount) || 0;
    }
    if (p.cycle || p.period) {
      updates.cycle = p.cycle || p.period;
    }
    if (p.accumulatedAmount !== undefined) {
      updates.accumulatedAmount = p.type === 'income' ? 0 : (Number(p.accumulatedAmount) || 0);
    }
    await updateDoc(ref, cleanForFirestore(updates));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sinkingFunds/${fundId}`);
  }
}

export async function depositToSinkingFund(
  fundId: string,
  addAmount: number
): Promise<void> {
  try {
    const ref = doc(db, 'sinkingFunds', fundId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const current = snap.data() as SinkingFund;
    await updateDoc(ref, {
      accumulatedAmount: (current.accumulatedAmount || 0) + addAmount,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sinkingFunds/${fundId}`);
  }
}

/**
 * ⚡ 一鍵入帳原子操作：
 * 1. 自動生成對應收入或支出 Transaction
 * 2. 連動更新指定資產帳戶餘額
 * 3. accumulatedAmount 歸零
 * 4. nextDueDate 依週期自動精算並展延至下個週期
 */
export async function executeSinkingFundDueRecord(
  userId: string,
  fund: SinkingFund,
  primaryLedgerId: string
): Promise<Transaction> {
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const isIncome = fund.type === 'income';

    // 1. 生成收支交易 (優先使用排程綁定之帳本，若無則使用傳入之日常私帳)
    const effectiveLedgerId = fund.targetLedgerId || primaryLedgerId;
    const txId = `tx_sink_${Date.now()}`;

    // 解析真實分類 ID 與真實分類名稱
    const { getUserCategories } = await import('./categoryService');
    const userCats = await getUserCategories(userId).catch(() => []);
    let resolvedCatId = fund.categoryId?.trim() || '';
    let resolvedCatName = '';

    if (resolvedCatId) {
      const found = userCats.find((c) => c.id === resolvedCatId);
      if (found) {
        resolvedCatName = found.name;
      }
    }

    if (!resolvedCatName) {
      // 依據沉澱基金名稱智慧推斷標準分類
      const fTitle = (fund.title || '').toLowerCase();
      let targetName = isIncome ? '正職薪資' : '其他雜支';
      if (/薪水|薪資|底薪/i.test(fTitle)) targetName = '正職薪資';
      else if (/租金|客房|房租/i.test(fTitle)) targetName = '租金收入';
      else if (/獎金|津貼|分紅/i.test(fTitle)) targetName = '獎金津貼';
      else if (/股息|利息/i.test(fTitle)) targetName = '股息利息';
      else if (/youtube|icloud|netflix|spotify|訂閱/i.test(fTitle)) targetName = '數位訂閱';
      else if (/地價稅|房屋稅|稅|保險|勞保|健保|福委金/i.test(fTitle)) targetName = '保險稅務';
      else if (/管理費|火險|房租|水電|修繕/i.test(fTitle)) targetName = '居家生活';
      else if (/車險|加油|機車|汽車/i.test(fTitle)) targetName = '汽機車輛';
      else if (/營養|維他命|藥|醫療|看診|失能險/i.test(fTitle)) targetName = '醫療健康';
      else if (/餐|飯|吃/i.test(fTitle)) targetName = '餐飲美食';
      else if (/高鐵|捷運|車票/i.test(fTitle)) targetName = '交通運輸';

      const found = userCats.find((c) => c.name === targetName);
      if (found) {
        resolvedCatId = found.id;
        resolvedCatName = found.name;
      } else {
        resolvedCatName = targetName;
        resolvedCatId = isIncome ? `cat_inc_${userId}_${targetName}` : `cat_exp_${userId}_${targetName}`;
      }
    }

    const tx: Transaction = {
      id: txId,
      userId,
      ledgerId: effectiveLedgerId,
      type: isIncome ? 'income' : 'expense',
      amount: fund.targetAmount,
      currency: 'TWD',
      categoryId: resolvedCatId,
      categoryName: resolvedCatName,
      accountId: fund.targetAccountId || '',
      date: today,
      title: `⚡ 固定${isIncome ? '收入' : '支出'}執行：${fund.title}`,
      note: isIncome
        ? `定期固定收入入帳`
        : `沉澱基金原預存金額 NT$ ${(fund.accumulatedAmount || 0).toLocaleString()} 已沖銷入帳`,
      payerId: userId,
      payerName: '本人',
      createdAt: now,
      deletedAt: null,
    };
    batch.set(doc(db, 'transactions', txId), cleanForFirestore(tx));

    // 2. 若指定帳戶，連動資產餘額
    if (fund.targetAccountId) {
      const accRef = doc(db, 'assetAccounts', fund.targetAccountId);
      const accSnap = await getDoc(accRef);
      if (accSnap.exists()) {
        const acc = accSnap.data() as AssetAccount;
        const delta = isIncome ? fund.targetAmount : -fund.targetAmount;
        if (acc.subAccounts && acc.subAccounts.length > 0) {
          const subAccounts = acc.subAccounts.map((s: SubAccount, idx: number) =>
            idx === 0 ? { ...s, balance: (s.balance || 0) + delta } : s
          );
          const total = subAccounts.reduce((sum: number, s: SubAccount) => sum + (s.balance || 0), 0);
          batch.update(accRef, cleanForFirestore({ balance: total, subAccounts, updatedAt: now }));
        } else {
          batch.update(accRef, {
            balance: (acc.balance || 0) + delta,
            updatedAt: now,
          });
        }
      }
    }

    // 3. 展延下次期數並歸零已預存金額
    const nextDue = getNextDueDate(fund.nextDueDate, fund.cycle);
    const fundRef = doc(db, 'sinkingFunds', fund.id);
    batch.update(fundRef, {
      accumulatedAmount: 0,
      nextDueDate: nextDue,
      updatedAt: now,
    });

    await batch.commit();
    return tx;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sinkingFunds/${fund.id}/execute`);
  }
}

export async function softDeleteSinkingFund(fundId: string): Promise<void> {
  try {
    const ref = doc(db, 'sinkingFunds', fundId);
    await updateDoc(ref, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sinkingFunds/${fundId}`);
  }
}

// 預算管理
export async function getUserBudgets(userId: string): Promise<Budget[]> {
  try {
    const q = query(collection(db, 'budgets'), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Budget)
      .filter((b) => !b.deletedAt);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'budgets');
  }
}

export async function setMonthBudget(
  userId: string,
  month: string,
  amount: number,
  categoryId?: string
): Promise<Budget> {
  try {
    const id = `bgt_${userId}_${month}_${categoryId || 'total'}`;
    const budget: Budget = {
      id,
      userId,
      month,
      amount: Number(amount) || 0,
      categoryId,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    await setDoc(doc(db, 'budgets', id), cleanForFirestore(budget));
    return budget;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'budgets');
  }
}

export async function updateBudget(
  budgetId: string,
  amount: number,
  categoryId?: string
): Promise<void> {
  try {
    const ref = doc(db, 'budgets', budgetId);
    const updates: any = {
      amount: Number(amount) || 0,
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    if (categoryId) updates.categoryId = categoryId;
    await setDoc(ref, cleanForFirestore(updates), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `budgets/${budgetId}`);
  }
}

export async function deleteBudget(budgetId: string): Promise<void> {
  try {
    const ref = doc(db, 'budgets', budgetId);
    await setDoc(
      ref,
      cleanForFirestore({
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `budgets/${budgetId}`);
  }
}
