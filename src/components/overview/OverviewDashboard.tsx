import React from 'react';
import { Transaction, AssetAccount, Ledger, Budget, Friend, Category } from '../../types';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import { formatCurrency, getCurrentYearMonth, convertToTWD } from '../../utils/formatters';
import { getUserExpenseForTransaction, getUserIncomeForTransaction } from '../../utils/mathUtils';
import { ArrowUpRight, ArrowDownRight, Wallet, PieChart, Users, ChevronRight, RotateCw } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export interface OverviewDashboardProps {
  currentUserId: string;
  userName: string;
  transactions: Transaction[];
  assetAccounts: AssetAccount[];
  ledgers: Ledger[];
  budgets: Budget[];
  categories?: Category[];
  friends?: Friend[];
  loading?: boolean;
  loadingStatus?: 'idle' | 'loading' | 'retrying' | 'ready' | 'stalled';
  onReload?: () => void;
  onNavigateToTransactions: () => void;
  onOpenTransactionModal: () => void;
  onOpenLineTour?: () => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  currentUserId,
  userName,
  transactions,
  assetAccounts,
  ledgers,
  budgets,
  categories = [],
  loading = false,
  loadingStatus = 'idle',
  onReload,
  onNavigateToTransactions,
  onOpenTransactionModal,
  onOpenLineTour,
}) => {
  const currentMonth = getCurrentYearMonth();

  // 1. (左上) 全帳本融合淨資產 (以 TWD 基準轉換)
  const netWorth = assetAccounts.reduce(
    (acc, curr) => acc + convertToTWD(curr.balance || 0, curr.currency),
    0
  );

  // 2. (右上) 本月總開銷 / 總收入 (多幣別回推匯率至 TWD，嚴格僅計算本人份額與開銷)
  const monthlyTxs = transactions.filter((t) => t.date.startsWith(currentMonth) && !t.deletedAt);
  const monthlyExpense = monthlyTxs
    .reduce((acc, t) => acc + convertToTWD(getUserExpenseForTransaction(t, currentUserId), t.currency), 0);
  const monthlyIncome = monthlyTxs
    .reduce((acc, t) => acc + convertToTWD(getUserIncomeForTransaction(t, currentUserId), t.currency), 0);

  // 3. (左下) 預算總執行進度條 (真實聯動子分類預算加總或全域預算)
  const activeMonthBudgets = budgets.filter((b) => b.month === currentMonth && !b.deletedAt);
  const categoryBudgetsSum = activeMonthBudgets
    .filter((b) => b.categoryId && b.categoryId !== 'total')
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const globalBudgetObj = activeMonthBudgets.find((b) => !b.categoryId || b.categoryId === 'total');
  const budgetAmount = categoryBudgetsSum > 0 ? categoryBudgetsSum : (globalBudgetObj?.amount || 30000);
  const budgetPercent = Math.min(100, Math.round((monthlyExpense / (budgetAmount || 1)) * 100));
  const budgetBarColor =
    budgetPercent > 90 ? 'bg-rose-500' : budgetPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500';

  // 4. (右下) 共管帳本待收/待付總額
  const sharedLedgers = ledgers.filter((l) => l.isShared && !l.deletedAt);
  const pendingDebtsList: { ledgerName: string; amount: number; type: 'receivable' | 'payable' }[] = [];

  for (const ledger of sharedLedgers) {
    const lTxs = transactions.filter(
      (t) => t.ledgerId === ledger.id && !t.deletedAt && t.type === 'expense'
    );
    let net = 0;
    for (const tx of lTxs) {
      if (!tx.splitDetails || tx.splitDetails.length === 0) continue;
      const isPayer = tx.payerId === currentUserId || tx.userId === currentUserId;

      const isMemberMe = (mId: string) =>
        mId === currentUserId ||
        mId.includes(currentUserId) ||
        currentUserId.includes(mId);

      if (isPayer) {
        // 本人墊付：他人未結清的分攤額為待收 (+)
        for (const split of tx.splitDetails) {
          if (!split.isSettled && !isMemberMe(split.memberId)) {
            net += convertToTWD(split.amount, tx.currency);
          }
        }
      } else {
        // 別人墊付：本人未結清的分攤額為待付 (-)
        for (const split of tx.splitDetails) {
          if (!split.isSettled && isMemberMe(split.memberId)) {
            net -= convertToTWD(split.amount, tx.currency);
          }
        }
      }
    }

    if (Math.abs(net) >= 1) {
      pendingDebtsList.push({
        ledgerName: ledger.name,
        amount: Math.round(Math.abs(net)),
        type: net > 0 ? 'receivable' : 'payable',
      });
    }
  }

  // 近期 5 筆交易
  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 頂部歡迎橫幅 (企業級 SaaS 規範) */}
      <div className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50/80 rounded-full border border-emerald-200/50 text-xs font-semibold text-emerald-800">
            <span>✨ 智慧記帳・羊羊陪你存第一桶金</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
            早安，{userName}！
          </h1>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
            <p className="text-sm text-gray-500 font-medium max-w-md">
              全帳本融合總覽，即時掌握個人與共管財務全貌。
            </p>
            {onReload && (
              <button
                type="button"
                onClick={onReload}
                disabled={loading}
                title="重新整理財務資料"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCw size={12} className={loading ? 'animate-spin text-emerald-600' : 'text-stone-500'} />
                <span>{loading ? '同步中...' : '重新整理'}</span>
              </button>
            )}
          </div>
        </div>
        <div className="p-3 bg-gray-50/80 rounded-2xl border border-gray-100 flex items-center gap-3 shrink-0">
          <AssetSheepMascot size={68} />
          <div className="pr-2 hidden sm:block">
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full block text-center mb-1">
              +300% 成長
            </span>
            <p className="text-xs font-bold text-gray-800">資產上羊</p>
          </div>
        </div>
      </div>

      {/* 資料讀取不到或為空時的專屬輔助提示卡片 (含 6 秒逾時守護) */}
      {((assetAccounts.length === 0 && transactions.length === 0 && ledgers.length === 0) || loadingStatus === 'stalled') && (
        <div className="p-4 bg-amber-50/95 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-900 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🐑</span>
            <div>
              <p className="font-bold">
                {loadingStatus === 'stalled' ? '資料讀取稍微延遲' : '尚未讀取到帳本資料？'}
              </p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                {loadingStatus === 'stalled'
                  ? '連線時間較長，通常手動重整後可在 4 秒內完成同步載入！'
                  : '若因冷啟動或暫態連線未及時載入，請點擊右方按鈕手動重整，系統亦會自動透過專線備援！'}
              </p>
            </div>
          </div>
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? '讀取中...' : '🔄 讀不到？請按我重整'}</span>
            </button>
          )}
        </div>
      )}

      {/* 2x2 融合核心資料卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* (左上) 全帳戶淨資產 */}
        <div data-tour="overview-networth-card" className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-gray-700">
              <Wallet size={16} className="text-emerald-600" />
              <span>全帳戶淨資產總額 (TWD)</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              即時連動
            </span>
          </div>
          <div className="my-3">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-gray-900 tabular-nums break-words block">
              {formatCurrency(netWorth)}
            </span>
          </div>
          <p className="text-xs text-gray-400 font-medium">各外幣資產已依即時匯率動態折算為新台幣</p>
        </div>

        {/* (右上) 本月總開銷 / 總收入 */}
        <div data-tour="overview-monthly-card" className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-gray-700">
              <PieChart size={16} className="text-amber-500" />
              <span>本月收支概況 ({currentMonth})</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3.5 my-2">
            <div className="p-4 bg-gray-50/70 border border-gray-100 rounded-xl">
              <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
                <ArrowUpRight size={13} /> 本月總開銷
              </span>
              <p className="text-xl sm:text-2xl font-extrabold text-rose-600 mt-1 tabular-nums">
                {formatCurrency(monthlyExpense)}
              </p>
            </div>
            <div className="p-4 bg-gray-50/70 border border-gray-100 rounded-xl">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <ArrowDownRight size={13} /> 本月總收入
              </span>
              <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums">
                {formatCurrency(monthlyIncome)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 font-medium">外幣明細已乘上基準匯率加總 (如日幣 1:0.21)</p>
        </div>

        {/* (左下) 本月預算總執行進度 */}
        <div data-tour="overview-budget-card" className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2 gap-2">
            <span className="text-xs font-bold text-gray-700 shrink-0">本月預算總執行進度</span>
            <span className="text-xs font-bold text-gray-900 tabular-nums truncate text-right max-w-[200px]" title={`${budgetPercent}% (已用 ${formatCurrency(monthlyExpense)} / ${formatCurrency(budgetAmount)})`}>
              {budgetPercent}% (已用 {formatCurrency(monthlyExpense)} / {formatCurrency(budgetAmount)})
            </span>
          </div>
          <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden my-3">
            <div
              className={`h-full ${budgetBarColor} transition-all duration-500 rounded-full`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-xs font-medium text-gray-500">
            <span className="tabular-nums">
              剩餘額度：{formatCurrency(Math.max(0, budgetAmount - monthlyExpense))}
            </span>
            <span className="font-semibold text-gray-400">
              {budgetPercent >= 100 ? '⚠️ 已超支' : budgetPercent >= 80 ? '⚡ 預算緊繃' : '🌱 餘裕充裕'}
            </span>
          </div>
        </div>

        {/* (右下) 共管待收/待付總額 */}
        <div data-tour="overview-shared-card" className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Users size={16} className="text-indigo-600" />
              <span>共管帳本待收/待付</span>
            </span>
            <span className="text-xs text-gray-400 font-medium">AA平帳即時連動</span>
          </div>
          {pendingDebtsList.length > 0 ? (
            <div className="space-y-2 my-2 max-h-24 overflow-y-auto pr-1">
              {pendingDebtsList.map((debt, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-2.5 bg-gray-50/70 border border-gray-100/70 rounded-xl text-xs gap-2"
                >
                  <span className="font-semibold text-gray-800 truncate min-w-0 flex-1" title={debt.ledgerName}>
                    {debt.ledgerName}
                  </span>
                  <span
                    className={`font-bold tabular-nums shrink-0 ${
                      debt.type === 'receivable' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {debt.type === 'receivable' ? '待收 +' : '待付 -'}
                    {formatCurrency(debt.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-xl text-center text-xs text-gray-400 font-medium my-2">
              ✨ 讚啦！目前共管帳本無未結清欠款
            </div>
          )}
          <p className="text-xs text-gray-400 font-medium mt-1">
            依據 isSettled: false 與參與者精確計算淨值
          </p>
        </div>
      </div>

      {/* 底部近期明細卡片 */}
      <div className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold tracking-tight text-gray-900">
              📋 近期全帳本融合明細
            </span>
            <span className="text-xs text-gray-400 font-medium">（最近 5 筆）</span>
          </div>
          <button
            onClick={onNavigateToTransactions}
            className="text-xs font-semibold text-gray-900 hover:text-emerald-700 flex items-center gap-0.5 transition-all duration-200 ease-in-out cursor-pointer hover:underline"
          >
            <span>查看全部</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <EmptyState
            title="目前尚無記帳紀錄"
            description="點擊按鈕或記錄新項目，讓小羊幫你管好每一筆資產！"
            actionText="立即記一筆"
            onAction={onOpenTransactionModal}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {recentTransactions.map((tx) => {
              const ledger = ledgers.find((l) => l.id === tx.ledgerId);
              const isSettlement = tx.categoryId === 'cat_settlement' || tx.title.includes('AA平帳');
              const isPayer = tx.payerId === currentUserId;

              let isPositive = tx.type === 'income';
              let signSymbol = isPositive ? '+' : '-';
              let signColor = isPositive ? 'text-emerald-600' : 'text-gray-900';

              if (isSettlement) {
                if (!isPayer) {
                  isPositive = true;
                  signSymbol = '+';
                  signColor = 'text-emerald-600';
                } else {
                  isPositive = false;
                  signSymbol = '-';
                  signColor = 'text-rose-600';
                }
              }

              return (
                <div
                  key={tx.id}
                  className="py-3.5 flex items-center justify-between gap-3 hover:bg-gray-50/50 px-2 rounded-xl transition-colors"
                >
                  {(() => {
                    const matchedCat = categories.find((c) => c.id === tx.categoryId || c.name === tx.categoryName);
                    const itemIcon = tx.categoryIcon || matchedCat?.icon || (isSettlement ? '🤝' : tx.type === 'transfer' ? '🔄' : isPositive ? '💰' : '🏷️');
                    return (
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base shrink-0 ${
                            isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          {itemIcon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-gray-900 truncate" title={tx.title}>{tx.title}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5 font-medium flex-wrap">
                            <span className="shrink-0">{tx.date}</span>
                            <span className="shrink-0">•</span>
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-bold rounded text-[10px] truncate max-w-[100px]" title={tx.categoryName}>
                              {tx.categoryName}
                            </span>
                            <span className="shrink-0">•</span>
                            <span className="truncate max-w-[120px]" title={ledger?.name}>{ledger?.name || '日常帳本'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-extrabold tabular-nums ${signColor}`}>
                      {signSymbol}
                      {formatCurrency(tx.amount, tx.currency)}
                    </p>
                    <p className="text-[11px] text-gray-400 font-medium truncate max-w-[100px] ml-auto">{tx.payerName || '本人'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export { OverviewDashboard as OverviewView };
export default OverviewDashboard;
