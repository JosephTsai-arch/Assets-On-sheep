import React, { useState, useEffect } from 'react';
import { SinkingFund, Transaction, Category, AssetAccount, Ledger } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { calculateSinkingFund } from '../../utils/mathUtils';
import { useCashFlowProjection } from '../../hooks/useCashFlowProjection';
import {
  Zap,
  Calendar,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Plus,
  ShieldCheck,
  DollarSign,
  Edit3,
  Wallet,
  Tag,
  Scale,
  BookOpen,
  BarChart3,
  List,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';
import { EmptyState } from '../common/EmptyState';
import { OverdraftRadarSection } from './OverdraftRadarSection';

interface AdvancedSinkingFundBoardProps {
  sinkingFunds: SinkingFund[];
  transactions: Transaction[];
  currentMonth: string;
  currentBalance: number;
  categories?: Category[];
  assetAccounts?: AssetAccount[];
  ledgers?: Ledger[];
  onExecuteSinkingFund: (fund: SinkingFund) => Promise<void>;
  onDeleteSinkingFund: (id: string) => Promise<void>;
  onOpenAddSinkingFund: () => void;
  onOpenAddSinkingFundWithType?: (type: 'expense' | 'income') => void;
  onEditSinkingFund?: (fund: SinkingFund) => void;
}

export const AdvancedSinkingFundBoard: React.FC<AdvancedSinkingFundBoardProps> = ({
  sinkingFunds,
  transactions,
  currentMonth,
  currentBalance,
  categories = [],
  assetAccounts = [],
  ledgers = [],
  onExecuteSinkingFund,
  onDeleteSinkingFund,
  onOpenAddSinkingFund,
  onOpenAddSinkingFundWithType,
  onEditSinkingFund,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');

  // 分離固定支出與固定收入
  const incomeFunds = sinkingFunds.filter((f) => f.type === 'income');
  const expenseFunds = sinkingFunds.filter((f) => f.type !== 'income');

  // 1. 每月固定收入折算總額 (每月 = 原額, 每季 = /3, 半年 = /6, 每年 = /12)
  const totalMonthlyFixedIncome = incomeFunds.reduce((sum, fund) => {
    const monthlyVal =
      fund.cycle === 'monthly'
        ? fund.targetAmount
        : fund.cycle === 'yearly'
        ? Math.round(fund.targetAmount / 12)
        : fund.cycle === 'semi_annually'
        ? Math.round(fund.targetAmount / 6)
        : Math.round(fund.targetAmount / 3);
    return sum + monthlyVal;
  }, 0);

  // 2. 每月固定支出預留均攤總額 (僅精算支出項)
  const totalSuggestedMonthlySaving = expenseFunds.reduce((sum, fund) => {
    const math = calculateSinkingFund(
      fund.targetAmount,
      fund.accumulatedAmount,
      fund.nextDueDate,
      currentMonth
    );
    return sum + math.suggestedMonthlySaving;
  }, 0);

  // 3. 固定收支淨月結餘 (Fixed Net Cashflow)
  const netRecurringBalance = totalMonthlyFixedIncome - totalSuggestedMonthlySaving;

  // 4. 篩選與排序列表 (依下次到期時間升冪)
  const filteredFunds = sinkingFunds.filter((f) => {
    if (filterType === 'all') return true;
    if (filterType === 'income') return f.type === 'income';
    return f.type !== 'income';
  });

  const sortedFunds = [...filteredFunds].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  // 5. 呼叫未來 12 個月現金流預測演算法 (已相容收入與支出雙向注入)
  const projection = useCashFlowProjection({
    initialBalance: currentBalance,
    transactions,
    recurringItems: sinkingFunds,
    currentYearMonth: currentMonth,
  });

  // 變動支出均值 (近一年支出扣除固定支出後平均，取樣幾個月就除幾)
  const avgVariableExpense = projection.averageVariableExpense;
  const sampleMonths = projection.sampleMonths || projection.pastMonthsEvaluated || 1;

  const accountMap = new Map(assetAccounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, `${c.icon || ''} ${c.name}`.trim()]));
  const ledgerMap = new Map(ledgers.map((l) => [l.id, l.name]));

  const handleAddWithType = (type: 'expense' | 'income') => {
    if (onOpenAddSinkingFundWithType) {
      onOpenAddSinkingFundWithType(type);
    } else {
      onOpenAddSinkingFund();
    }
  };

  return (
    <div className="space-y-6">
      {/* 頂部數據儀表板 (4 欄佈局：固定月收入、固定月支出預存、變動支出均值、12 個月透支狀態) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 卡片 1: 每月固定收入預估 */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-md flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1.5">
              <TrendingUp size={14} />
              <span>每月固定進帳</span>
            </span>
            <div className="mt-1">
              <span className="text-xl sm:text-2xl font-black truncate max-w-full block" title={formatCurrency(totalMonthlyFixedIncome)}>
                {formatCurrency(totalMonthlyFixedIncome)}
              </span>
            </div>
            <p className="text-[11px] opacity-90 mt-0.5 truncate">
              {incomeFunds.length} 項固定收入排程
            </p>
          </div>
          <div className="p-2.5 bg-white/20 rounded-2xl shrink-0">
            <DollarSign size={24} />
          </div>
        </div>

        {/* 卡片 2: 本月建議支出預留 (沉澱準備) */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-3xl p-5 text-white shadow-md flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1.5">
              <TrendingDown size={14} />
              <span>本月建議支出/預存</span>
            </span>
            <div className="mt-1">
              <span className="text-xl sm:text-2xl font-black truncate max-w-full block" title={formatCurrency(totalSuggestedMonthlySaving)}>
                {formatCurrency(totalSuggestedMonthlySaving)}
              </span>
            </div>
            <p className="text-[11px] opacity-90 mt-0.5 truncate">
              {expenseFunds.length} 項固定支出均攤
            </p>
          </div>
          <div className="p-2.5 bg-white/20 rounded-2xl shrink-0">
            <Calendar size={24} />
          </div>
        </div>

        {/* 卡片 3: 變動支出均值 (扣除固定支出後平均，註記樣本數) */}
        <div className="bg-amber-50/70 border border-amber-200 text-amber-950 rounded-3xl p-5 shadow-xs flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider opacity-90 flex items-center gap-1.5 text-amber-900">
              <TrendingDown size={14} className="text-amber-700" />
              <span>變動支出均值</span>
            </span>
            <div className="mt-1">
              <span className="text-xl sm:text-2xl font-black truncate max-w-full block text-amber-800" title={formatCurrency(avgVariableExpense)}>
                {formatCurrency(avgVariableExpense)}
              </span>
            </div>
            <p className="text-[11px] opacity-80 mt-0.5 truncate text-amber-900/80" title={`近 12 個月排除固定收支之日常變動支出平均 (取樣 ${sampleMonths} 個月)`}>
              📊 樣本 {sampleMonths} 個月 (已扣除固定支出)
            </p>
          </div>
          <div className="p-2.5 rounded-2xl shrink-0 bg-amber-200/70 text-amber-800">
            <Wallet size={24} />
          </div>
        </div>

        {/* 卡片 4: 12 個月資產防禦狀態 */}
        <div className={`rounded-3xl p-5 border shadow-xs flex items-center justify-between ${
          projection.hasAnyWarning ? 'bg-red-50 border-red-200 text-red-900' : 'bg-stone-50 border-stone-200 text-stone-900'
        }`}>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              {projection.hasAnyWarning ? <AlertTriangle size={15} className="text-red-500" /> : <ShieldCheck size={15} className="text-emerald-600" />}
              <span>12 個月透支雷達</span>
            </span>
            <div className="mt-1">
              <span className="text-xl sm:text-2xl font-black">
                {projection.hasAnyWarning ? '⚠️ 透支警戒' : '🌱 資金鏈充裕'}
              </span>
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {projection.hasAnyWarning ? '部分月份扣款後餘額小於 0' : '未來一年餘額均在安全邊界'}
            </p>
          </div>
        </div>
      </div>

      {/* 排程清單區塊 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Calendar size={18} className="text-amber-600" />
              <span>固定收支排程清單</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              支援設定每月/季/年定期收入與支出扣款，週期自動延展與一鍵入帳
            </p>
          </div>

          {/* 快捷新增按鈕群 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddWithType('expense')}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <TrendingDown size={14} />
              <span>＋ 新增固定支出</span>
            </button>
            <button
              onClick={() => handleAddWithType('income')}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <TrendingUp size={14} />
              <span>＋ 新增固定收入</span>
            </button>
          </div>
        </div>

        {/* 分頁篩選器 (全部 / 固定支出 / 固定收入) */}
        <div className="flex bg-stone-100 p-1 rounded-2xl w-full sm:w-80">
          <button
            onClick={() => setFilterType('all')}
            className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              filterType === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            全部 ({sinkingFunds.length})
          </button>
          <button
            onClick={() => setFilterType('expense')}
            className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              filterType === 'expense' ? 'bg-white text-amber-800 shadow-xs' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            💸 固定支出 ({expenseFunds.length})
          </button>
          <button
            onClick={() => setFilterType('income')}
            className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              filterType === 'income' ? 'bg-white text-emerald-800 shadow-xs' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            💰 固定收入 ({incomeFunds.length})
          </button>
        </div>

        {sortedFunds.length === 0 ? (
          <EmptyState
            title={
              filterType === 'income'
                ? '尚未設定固定收入排程'
                : filterType === 'expense'
                ? '尚未設定固定支出排程'
                : '尚未設定固定收支排程'
            }
            description="例如：每月薪資進帳、房屋租金、年繳保險費、機車燃料稅等，定期自動推算！"
            actionText="立即新增排程"
            onAction={() => handleAddWithType(filterType === 'income' ? 'income' : 'expense')}
          />
        ) : (
          <div className="space-y-3">
            {sortedFunds.map((fund) => {
              const isIncome = fund.type === 'income';
              const math = calculateSinkingFund(
                fund.targetAmount,
                fund.accumulatedAmount,
                fund.nextDueDate,
                currentMonth
              );

              const boundAccountName = fund.targetAccountId ? accountMap.get(fund.targetAccountId) : null;
              const boundCategoryName = fund.categoryId ? categoryMap.get(fund.categoryId) : null;
              const boundLedgerName = fund.targetLedgerId ? ledgerMap.get(fund.targetLedgerId) : '日常私帳';

              const cycleLabel =
                fund.cycle === 'monthly'
                  ? '每月固定'
                  : fund.cycle === 'yearly'
                  ? '每年固定'
                  : fund.cycle === 'semi_annually'
                  ? '半年一次'
                  : '每季固定';

              return (
                <div
                  key={fund.id}
                  className={`p-4 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                    isIncome
                      ? 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-200'
                      : 'bg-stone-50/80 border-stone-200/80 hover:border-stone-300'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-stone-900 break-words max-w-full">{fund.title}</span>

                      {/* 收支標籤 */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                          isIncome ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isIncome ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        <span>{isIncome ? '固定收入' : '固定支出'}</span>
                      </span>

                      {/* 循環週期標籤 */}
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-200/70 text-stone-700 rounded-md shrink-0">
                        {cycleLabel}
                      </span>

                      {/* 預設帳本標籤 */}
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-stone-100 text-stone-700 rounded-md flex items-center gap-1 shrink-0 truncate max-w-[140px]" title={`預設帳本: ${boundLedgerName}`}>
                        <BookOpen size={11} className="text-stone-500" />
                        <span className="truncate">{boundLedgerName}</span>
                      </span>

                      {/* 到期/下次標籤 */}
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md shrink-0">
                        {math.monthsRemaining <= 0
                          ? '本月到期'
                          : isIncome
                          ? `下次入帳：${fund.nextDueDate}`
                          : `剩餘 ${math.monthsRemaining} 個月 (${fund.nextDueDate})`}
                      </span>

                      {/* 關聯帳戶 */}
                      {boundAccountName && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md flex items-center gap-1 shrink-0 truncate max-w-[140px]" title={boundAccountName}>
                          <Wallet size={11} />
                          <span className="truncate">{boundAccountName}</span>
                        </span>
                      )}

                      {/* 關聯分類 */}
                      {boundCategoryName && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md flex items-center gap-1 shrink-0 truncate max-w-[120px]" title={boundCategoryName}>
                          <Tag size={11} />
                          <span className="truncate">{boundCategoryName}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                      {isIncome ? (
                        <>
                          <span className="font-bold text-emerald-700">
                            每期預計進帳：{formatCurrency(fund.targetAmount)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>每期目標：{formatCurrency(fund.targetAmount)}</span>
                          <span>•</span>
                          <span>已預存：{formatCurrency(fund.accumulatedAmount)} ({math.progressPercent}%)</span>
                          <span>•</span>
                          <span className="font-bold text-amber-700">
                            本月建議應存：{formatCurrency(math.suggestedMonthlySaving)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                    {/* 一鍵入帳 / 扣款按鈕 */}
                    <button
                      onClick={() => onExecuteSinkingFund(fund)}
                      className={`px-3.5 py-1.5 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95 ${
                        math.isDueOrOverdue ? 'animate-pulse' : ''
                      } ${
                        isIncome
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                      title={isIncome ? '執行收入入帳' : '執行支出扣款'}
                    >
                      <Zap size={14} fill="currentColor" />
                      <span>{isIncome ? '⚡ 一鍵入帳' : '⚡ 一鍵扣款'}</span>
                    </button>

                    {/* 編輯按鈕 */}
                    {onEditSinkingFund && (
                      <button
                        onClick={() => onEditSinkingFund(fund)}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
                        title="編輯排程"
                      >
                        <Edit3 size={15} />
                      </button>
                    )}

                    {/* 刪除按鈕 */}
                    <InlineConfirm
                      onConfirm={() => onDeleteSinkingFund(fund.id)}
                      title={`確定刪除「${fund.title}」排程？`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. 12 個月透支雷達折線/雙長條圖 (已安全模組化為專屬高內聚元件) */}
      <OverdraftRadarSection projection={projection} currentBalance={currentBalance} />
    </div>
  );
};
