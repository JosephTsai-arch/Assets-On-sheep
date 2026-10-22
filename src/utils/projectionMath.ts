import { Transaction, SinkingFund } from '../types';

export interface RecurringItemLike {
  id: string;
  title: string;
  targetAmount?: number;
  amount?: number;
  cycle: 'monthly' | 'quarterly' | 'semi_annually' | 'yearly';
  nextDueDate: string; // YYYY-MM or YYYY-MM-DD
  type?: 'expense' | 'income';
  deletedAt?: string | null;
}

export interface DueRecurringItem {
  id: string;
  title: string;
  amount: number;
  cycle: string;
  type?: 'expense' | 'income';
}

export interface MonthProjection {
  monthStr: string; // YYYY-MM
  monthDisplay: string; // e.g. 11月
  startingBalance: number; // 該月起始結餘 (前月預測結餘)
  averageVariableExpense: number; // 變動支出均值
  averageFloatingBalance: number; // 相容歷史別名
  estimatedIncome: number; // 相容歷史別名
  dueExpenses: number; // 當月固定排程支出總和
  dueIncomes?: number; // 當月固定排程收入總和
  dueFunds: DueRecurringItem[]; // 當月固定排程明細清單
  projectedBalance: number; // 預測資產總額 = 當月初始資產 + 固定收入 - 變動支出均值 - 當月固定支出
  isWaterLevelDropping: boolean; // 是否低於上月 (資產水位下降)
  isWarning: boolean; // 透支預警狀態 (projectedBalance < 0)
  isOverdraft: boolean; // 相容歷史別名
}

export interface ProjectionRadarResult {
  averageVariableExpense: number; // 變動支出均值 (扣除固定支出後平均)
  averageFloatingBalance: number; // 相容歷史別名
  averageMonthlyIncome: number; // 近一年平均月收入
  totalPastIncome: number; // 近一年總收入
  totalPastVariableExpense: number; // 近一年日常變動支出 (已扣除固定支出)
  totalPastFloatingExpense: number; // 相容歷史別名
  sampleMonths: number; // 實際取樣月份數 (取樣幾個月就除幾，不可盲目除以 12)
  pastMonthsEvaluated: number; // 相容歷史別名
  monthlyProjections: MonthProjection[]; // 未來 12 個月遞迴預測陣列
  hasAnyWarning: boolean; // 是否出現透支預警
  hasAnyOverdraft: boolean; // 相容歷史欄位
  minProjectedBalance: number; // 12 個月中最低結餘
  maxProjectedBalance: number; // 12 個月中最高結餘
}

/** 取得指定基準月份往前推算 count 個月份清單 (格式: YYYY-MM) */
export function getPastMonthsList(baseYearMonth: string, count: number = 6): string[] {
  const [year, month] = baseYearMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * 判斷該筆交易是否為固定收支排程 (RecurringItem/SinkingFund) 觸發的紀錄
 * 精算日常浮動支出時【必須嚴格排除】，避免未來預測時重複扣款
 */
export function isRecurringTransaction(
  tx: Transaction,
  recurringItems?: RecurringItemLike[]
): boolean {
  if (tx.deletedAt) return false;
  if ((tx as any).recurringItemId || (tx as any).sinkingFundId || (tx as any).isRecurring) return true;
  if (tx.id.startsWith('tx_sink_') || tx.id.startsWith('tx_recurring_')) return true;
  if (
    tx.categoryName === '固定收支(沉澱基金)' ||
    tx.categoryName === '固定收支(定期收入)' ||
    tx.categoryId === 'cat_fixed_exp' ||
    tx.categoryId === 'cat_fixed_inc'
  ) return true;

  const title = tx.title || '';
  const note = tx.note || '';
  if (
    title.includes('固定支出') ||
    title.includes('固定收入') ||
    title.includes('固定收支') ||
    title.includes('沉澱基金') ||
    note.includes('沉澱基金原預存金額') ||
    note.includes('定期固定收入入帳')
  ) {
    return true;
  }

  if (recurringItems && recurringItems.length > 0) {
    return recurringItems.some((item) => item.title && title.includes(item.title));
  }
  return false;
}

/**
 * 任務 1: 定義與精算「變動支出均值 (Average Variable Expense)」
 * - 傳入過去 12 個月的所有真實 Transaction 歷史明細
 * - 支出項目扣除固定支出後平均 (排除 isRecurringTransaction)
 * - 樣本數計算：不可盲目除 12，取樣幾個月就除以幾 (統計過去 12 個月中實際有紀錄的月數，保底為 1)
 */
export function calculateAverageVariableExpense(
  transactions: Transaction[],
  baseYearMonth: string,
  recurringItems?: RecurringItemLike[],
  monthsCount: number = 12
): {
  averageVariableExpense: number;
  averageFloatingBalance: number;
  averageMonthlyIncome: number;
  totalIncome: number;
  totalVariableExpense: number;
  totalFloatingExpense: number;
  sampleMonths: number;
  effectiveMonths: number;
} {
  const pastMonths = getPastMonthsList(baseYearMonth, monthsCount);
  const pastMonthsSet = new Set(pastMonths);

  let totalIncome = 0;
  let totalVariableExpense = 0;
  const activeMonthsSet = new Set<string>();

  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    const txMonth = tx.date.slice(0, 7);
    if (!pastMonthsSet.has(txMonth)) continue;

    const amount = Number(tx.amount) || 0;
    if (amount <= 0) continue;

    activeMonthsSet.add(txMonth);

    if (tx.type === 'income') {
      totalIncome += amount;
    } else if (tx.type === 'expense') {
      if (!isRecurringTransaction(tx, recurringItems)) {
        totalVariableExpense += amount;
      }
    }
  }

  // 防呆邊界：以實際有紀錄的月數為分母（不可盲目除 12，取樣幾個月就除幾；保底為 1）
  const sampleMonths = Math.min(monthsCount, Math.max(1, activeMonthsSet.size));
  const averageVariableExpense = Math.round(totalVariableExpense / sampleMonths);
  const averageMonthlyIncome = Math.round(totalIncome / sampleMonths);
  const averageFloatingBalance = Math.round((totalIncome - totalVariableExpense) / sampleMonths);

  return {
    averageVariableExpense,
    averageFloatingBalance,
    averageMonthlyIncome,
    totalIncome,
    totalVariableExpense,
    totalFloatingExpense: totalVariableExpense,
    sampleMonths,
    effectiveMonths: sampleMonths,
  };
}

// 保留相容歷史呼叫
export const calculateAverageFloatingBalance = calculateAverageVariableExpense;

/**
 * 判斷固定收支排程在目標預測月份是否應扣款
 * - monthly: 每月皆扣款
 * - yearly: 僅在同一曆月 (tMonth === dueMonth) 扣款
 * - quarterly: 每季 (間隔 3 個月) 扣款
 */
export function isRecurringDueInMonth(
  item: RecurringItemLike,
  targetYearMonth: string
): boolean {
  if (item.deletedAt) return false;

  const [tYear, tMonth] = targetYearMonth.split('-').map(Number);
  const dueParts = item.nextDueDate.slice(0, 7).split('-').map(Number);
  const dueYear = dueParts[0] || tYear;
  const dueMonth = dueParts[1] || tMonth;
  const diffMonths = (tYear - dueYear) * 12 + (tMonth - dueMonth);

  switch (item.cycle) {
    case 'monthly':
      return true;
    case 'yearly':
      return tMonth === dueMonth;
    case 'quarterly':
      return diffMonths >= 0 ? diffMonths % 3 === 0 : Math.abs(diffMonths) % 3 === 0;
    case 'semi_annually':
      return diffMonths >= 0 ? diffMonths % 6 === 0 : Math.abs(diffMonths) % 6 === 0;
    default:
      return targetYearMonth === item.nextDueDate.slice(0, 7);
  }
}

/**
 * 任務 2 & 3: 未來 12 個月遞迴預測迴圈 (Projection Loop) 與透支/水位下降預警
 *
 * 初始資金 (Month 0) = 當前系統總資產 (所有 Account balance 總和)
 * 預測範圍：未來 12 個月，嚴格排除當下月份 (例如 10 月時，顯示之首月為 11 月)
 *
 * 優化之預測資產總額計算公式：
 *   預測資產總額 = 當月初始資產 + 固定收入 - 變動支出均值 - 當月固定支出
 *
 * 水位升降與警示規則：
 *   若當月的預測資產總額高於或等於上月，長條呈現綠色；
 *   若低於上月 (資產水位下降)，長條則呈現紅色，並以「資產水位下降」警示圖標取代資金安全圖標。
 *   若預測餘額 < 0，同時標記為透支警戒 (isWarning: true)。
 */
export function calculate12MonthCashProjection(
  initialBalance: number,
  transactions: Transaction[],
  recurringItems: (RecurringItemLike | SinkingFund)[],
  currentYearMonth: string
): ProjectionRadarResult {
  const {
    averageVariableExpense,
    averageFloatingBalance,
    averageMonthlyIncome,
    totalIncome,
    totalVariableExpense,
    sampleMonths,
  } = calculateAverageVariableExpense(transactions, currentYearMonth, recurringItems, 12);

  const [currentY, currentM] = currentYearMonth.split('-').map(Number);
  const monthlyProjections: MonthProjection[] = [];

  let runningBalance = initialBalance;
  let hasAnyWarning = false;

  // 未來 12 個月：排除當下月份，從下個月 (i = 1 到 12) 開始推算
  for (let i = 1; i <= 12; i++) {
    const d = new Date(currentY, currentM - 1 + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthDisplay = `${d.getMonth() + 1}月`;
    const startingBalance = runningBalance;

    const dueFunds: DueRecurringItem[] = [];
    let dueExpenses = 0;
    let dueIncomes = 0;

    for (const rawItem of recurringItems) {
      const itemType = (rawItem as any).type === 'income' ? 'income' : 'expense';
      const item: RecurringItemLike = {
        id: rawItem.id,
        title: rawItem.title,
        amount: (rawItem as any).targetAmount ?? (rawItem as any).amount ?? 0,
        cycle: rawItem.cycle,
        nextDueDate: rawItem.nextDueDate,
        type: itemType,
        deletedAt: rawItem.deletedAt,
      };

      if (isRecurringDueInMonth(item, monthStr)) {
        const itemAmount = item.amount || 0;
        if (itemType === 'income') {
          dueIncomes += itemAmount;
        } else {
          dueExpenses += itemAmount;
        }
        dueFunds.push({
          id: item.id,
          title: item.title,
          amount: itemAmount,
          cycle: item.cycle,
          type: itemType,
        });
      }
    }

    // 核心公式：預測資產總額 = 當月初始資產 + 固定收入 - 變動支出均值 - 當月固定支出
    runningBalance = Math.round(startingBalance + dueIncomes - averageVariableExpense - dueExpenses);

    // 水位升降判定：當月預測資產總額若低於上月，標記為水位下降
    const isWaterLevelDropping = runningBalance < startingBalance;

    // 透支預警判定 (預測餘額 < 0)
    const isWarning = runningBalance < 0;
    if (isWarning) hasAnyWarning = true;

    monthlyProjections.push({
      monthStr,
      monthDisplay,
      startingBalance,
      averageVariableExpense,
      averageFloatingBalance,
      estimatedIncome: averageMonthlyIncome,
      dueExpenses,
      dueIncomes,
      dueFunds,
      projectedBalance: runningBalance,
      isWaterLevelDropping,
      isWarning,
      isOverdraft: isWarning,
    });
  }

  const balances = monthlyProjections.map((p) => p.projectedBalance);
  const minProjectedBalance = Math.min(...balances);
  const maxProjectedBalance = Math.max(...balances, 10000);

  return {
    averageVariableExpense,
    averageFloatingBalance,
    averageMonthlyIncome,
    totalPastIncome: totalIncome,
    totalPastVariableExpense: totalVariableExpense,
    totalPastFloatingExpense: totalVariableExpense,
    sampleMonths,
    pastMonthsEvaluated: sampleMonths,
    monthlyProjections,
    hasAnyWarning,
    hasAnyOverdraft: hasAnyWarning,
    minProjectedBalance,
    maxProjectedBalance,
  };
}
