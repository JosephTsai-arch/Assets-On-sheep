import { SettlementDebt, SinkingCycle } from '../types';

/**
 * 動態沉澱基金純函式數學公式
 * 剩餘期數 = nextDueDate - 當前年月
 * 防呆：若剩餘期數 <= 0，強制設為 1
 * 本月建議應存 = (目標總金額 - 已預存金額) / 剩餘期數
 */
export function calculateSinkingFund(
  targetAmount: number,
  accumulatedAmount: number,
  nextDueDate: string, // YYYY-MM
  currentYearMonth?: string // YYYY-MM
): {
  monthsRemaining: number;
  suggestedMonthlySaving: number;
  isDueOrOverdue: boolean;
  progressPercent: number;
} {
  const now = new Date();
  const currentYM =
    currentYearMonth ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [tYear, tMonth] = nextDueDate.split('-').map(Number);
  const [cYear, cMonth] = currentYM.split('-').map(Number);

  const rawMonths = (tYear - cYear) * 12 + (tMonth - cMonth);
  const isDueOrOverdue = rawMonths <= 0;
  const monthsRemaining = rawMonths <= 0 ? 1 : rawMonths;

  const remainingAmount = Math.max(0, targetAmount - accumulatedAmount);
  const suggestedMonthlySaving = Math.max(0, Math.round(remainingAmount / monthsRemaining));

  const progressPercent = Math.min(
    100,
    Math.round((accumulatedAmount / (targetAmount || 1)) * 100)
  );

  return {
    monthsRemaining,
    suggestedMonthlySaving,
    isDueOrOverdue,
    progressPercent,
  };
}

/**
 * 展延 nextDueDate 至下一個週期
 */
export function getNextDueDate(currentDueDate: string, cycle: SinkingCycle): string {
  const [year, month] = currentDueDate.split('-').map(Number);
  let addMonths = 1;
  if (cycle === 'quarterly') addMonths = 3;
  if (cycle === 'semi_annually') addMonths = 6;
  if (cycle === 'yearly') addMonths = 12;

  const nextDate = new Date(year, month - 1 + addMonths, 1);
  const nextY = nextDate.getFullYear();
  const nextM = String(nextDate.getMonth() + 1).padStart(2, '0');
  return `${nextY}-${nextM}`;
}

/**
 * AA 平帳核心：最少轉帳次數演算法 (Min-Cash-Flow)
 */
export function calculateMinCashFlow(
  members: { id: string; name: string }[],
  balances: Record<string, number>
): SettlementDebt[] {
  // net balance = paid - owed
  // positive = creditor (is owed money)
  // negative = debtor (owes money)
  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const [id, bal] of Object.entries(balances)) {
    const rounded = Math.round(bal);
    if (rounded < -1) {
      debtors.push({ id, amount: -rounded });
    } else if (rounded > 1) {
      creditors.push({ id, amount: rounded });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions: SettlementDebt[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0) {
      transactions.push({
        fromId: debtor.id,
        fromName: memberMap.get(debtor.id) || debtor.id,
        toId: creditor.id,
        toName: memberMap.get(creditor.id) || creditor.id,
        amount: settleAmount,
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount <= 1) dIdx++;
    if (creditor.amount <= 1) cIdx++;
  }

  return transactions;
}

/**
 * 計算指定使用者在某筆交易中的真實個人開銷 (Effective Expense)
 * 【核心鐵律】：
 * 1. 若非支出類型 (income / transfer)，返回 0。
 * 2. 若為分帳交易 (有 splitDetails)：
 *    - 嚴格僅有「被分帳到的帳號」(splitDetails 中包含該用戶) 才會發生真實開銷！
 *    - 其開銷金額為該用戶被分配的份額 (split.amount)！
 *    - 若該用戶未參與此筆分帳 (未在 splitDetails 中)，其個人開銷嚴格為 0！
 * 3. 若無 splitDetails (個人帳本或非分帳支出)：
 *    - 只有付款人/記錄人 (payerId === userId || tx.userId === userId) 才會計入個人開銷 (tx.amount)！
 *    - 其他帳本成員若非付款人，個人開銷嚴格為 0！
 */
export function getUserExpenseForTransaction(
  tx: {
    deletedAt?: string | null;
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    userId: string;
    payerId?: string;
    payerMemberId?: string;
    splitDetails?: { memberId: string; amount: number }[] | null;
  },
  userId: string,
  candidateIds?: Set<string>
): number {
  if (tx.deletedAt || tx.type !== 'expense') return 0;

  const isMe = (targetId?: string) => {
    if (!targetId) return false;
    if (targetId === userId) return true;
    if (candidateIds && candidateIds.has(targetId)) return true;
    if (userId && (targetId.includes(userId) || (userId.length > 5 && userId.includes(targetId)))) return true;
    return false;
  };

  // 1. 若有分帳明細
  if (tx.splitDetails && Array.isArray(tx.splitDetails) && tx.splitDetails.length > 0) {
    const mySplit = tx.splitDetails.find((s) => isMe(s.memberId));
    if (mySplit) {
      return Number(mySplit.amount) || 0;
    }
    // 未被分帳的成員，個人開銷嚴格為 0
    return 0;
  }

  // 2. 若無分帳明細，僅付款人或創建者承擔開銷
  const isPayer = isMe(tx.payerMemberId) || isMe(tx.payerId) || isMe(tx.userId);
  return isPayer ? Number(tx.amount) || 0 : 0;
}

/**
 * 計算指定使用者在某筆交易中的真實個人收入 (Effective Income)
 */
export function getUserIncomeForTransaction(
  tx: {
    deletedAt?: string | null;
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    userId: string;
  },
  userId: string,
  candidateIds?: Set<string>
): number {
  if (tx.deletedAt || tx.type !== 'income') return 0;
  const isMe = (targetId?: string) => {
    if (!targetId) return false;
    if (targetId === userId) return true;
    if (candidateIds && candidateIds.has(targetId)) return true;
    if (userId && (targetId.includes(userId) || (userId.length > 5 && userId.includes(targetId)))) return true;
    return false;
  };
  return isMe(tx.userId) ? Number(tx.amount) || 0 : 0;
}
