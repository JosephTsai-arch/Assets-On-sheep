import React, { useState, useMemo } from 'react';
import { BigExpenseItem, BASE_EXCHANGE_RATES } from '../../services/adminService';
import { formatCurrency } from '../../utils/formatters';
import { Trophy, Filter, ArrowUpDown } from 'lucide-react';

interface LargeExpenseTabProps {
  bigExpenses: BigExpenseItem[];
  selectedMonth: string;
}

/**
 * 專屬 Hook：多幣別大額支出正規化與篩選排序
 */
export function useNormalizedLargeExpenses(
  expenses: BigExpenseItem[],
  minThreshold: number
) {
  return useMemo(() => {
    // 1. 確保各明細皆具備正確的 normalizedAmount
    const normalized = expenses.map((exp) => {
      const rate = BASE_EXCHANGE_RATES[exp.currency] ?? 1;
      const normalizedAmount = exp.normalizedAmount ?? Math.round(exp.amount * rate);
      return {
        ...exp,
        normalizedAmount,
      };
    });

    // 2. 門檻篩選：與 normalizedAmount (折合台幣) 進行比較
    const filtered = normalized.filter((exp) => exp.normalizedAmount >= minThreshold);

    // 3. 精準排序：依照 normalizedAmount 降冪排序 (Descending Sort)
    return filtered.sort((a, b) => b.normalizedAmount - a.normalizedAmount);
  }, [expenses, minThreshold]);
}

export const LargeExpenseTab: React.FC<LargeExpenseTabProps> = ({
  bigExpenses,
  selectedMonth,
}) => {
  const [minExpenseFilter, setMinExpenseFilter] = useState<number>(5000);

  // 透過專屬 Hook 進行多幣別正規化、門檻過濾與降冪排序
  const sortedExpenses = useNormalizedLargeExpenses(bigExpenses, minExpenseFilter);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 頂部操作欄：標題、匯率備註與大額門檻選單 */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-stone-900 flex items-center gap-2">
            <Trophy size={17} className="text-amber-500" />
            <span>大額支出多幣別正規化排行榜 ({selectedMonth})</span>
          </h3>
          <p className="text-[11px] text-stone-400 mt-0.5">
            💱 自動依照標準匯率換算為 TWD 基準排序 (1 JPY ≈ 0.21, 1 USD ≈ 31, 1 EUR ≈ 34)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-stone-400 shrink-0" />
          <select
            value={minExpenseFilter}
            onChange={(e) => setMinExpenseFilter(Number(e.target.value))}
            className="px-3 py-1.5 border border-stone-200 rounded-xl text-xs font-bold bg-stone-50 hover:bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            <option value={3000}>大於折合 NT$ 3,000</option>
            <option value={5000}>大於折合 NT$ 5,000</option>
            <option value={10000}>大於折合 NT$ 10,000</option>
            <option value={20000}>大於折合 NT$ 20,000</option>
          </select>
        </div>
      </div>

      {/* 前 3 名頒獎台 UI (Top 3 Podium) */}
      {sortedExpenses.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 items-end pt-3 pb-2">
          {/* No.2 亞軍 */}
          <div className="p-4 bg-stone-50/90 rounded-3xl text-center border border-stone-200">
            <span className="text-xs font-bold text-stone-500">🥈 亞軍</span>
            <img
              src={sortedExpenses[1].userAvatar}
              alt={sortedExpenses[1].userName}
              className="w-10 h-10 rounded-full mx-auto my-1.5 object-cover border border-stone-200"
            />
            <p className="text-xs font-bold text-stone-800 truncate">{sortedExpenses[1].userName}</p>
            {/* UX 防呆呈現：原始金額 原始幣別 (約 XX TWD) */}
            <p className="text-xs font-black text-rose-600 mt-1">
              {sortedExpenses[1].amount.toLocaleString()} {sortedExpenses[1].currency}
            </p>
            <p className="text-[10px] font-bold text-stone-500">
              (約 {formatCurrency(sortedExpenses[1].normalizedAmount)})
            </p>
            <p className="text-[10px] text-stone-400 truncate mt-1">
              {sortedExpenses[1].title}
            </p>
          </div>

          {/* No.1 冠軍 */}
          <div className="p-5 bg-amber-50/80 rounded-3xl text-center border-2 border-amber-400 shadow-md transform -translate-y-2">
            <span className="text-xs font-black text-amber-800">👑 冠軍</span>
            <img
              src={sortedExpenses[0].userAvatar}
              alt={sortedExpenses[0].userName}
              className="w-12 h-12 rounded-full mx-auto my-1.5 object-cover border-2 border-amber-500 shadow-xs"
            />
            <p className="text-xs font-extrabold text-stone-900 truncate">{sortedExpenses[0].userName}</p>
            {/* UX 防呆呈現：原始金額 原始幣別 (約 XX TWD) */}
            <p className="text-sm font-black text-rose-600 mt-1">
              {sortedExpenses[0].amount.toLocaleString()} {sortedExpenses[0].currency}
            </p>
            <p className="text-[11px] font-extrabold text-amber-900">
              (約 {formatCurrency(sortedExpenses[0].normalizedAmount)})
            </p>
            <p className="text-[10px] text-stone-500 truncate mt-1">
              {sortedExpenses[0].title}
            </p>
          </div>

          {/* No.3 季軍 */}
          <div className="p-4 bg-amber-100/40 rounded-3xl text-center border border-amber-200">
            <span className="text-xs font-bold text-amber-700">🥉 季軍</span>
            <img
              src={sortedExpenses[2].userAvatar}
              alt={sortedExpenses[2].userName}
              className="w-10 h-10 rounded-full mx-auto my-1.5 object-cover border border-amber-200"
            />
            <p className="text-xs font-bold text-stone-800 truncate">{sortedExpenses[2].userName}</p>
            {/* UX 防呆呈現：原始金額 原始幣別 (約 XX TWD) */}
            <p className="text-xs font-black text-rose-600 mt-1">
              {sortedExpenses[2].amount.toLocaleString()} {sortedExpenses[2].currency}
            </p>
            <p className="text-[10px] font-bold text-stone-500">
              (約 {formatCurrency(sortedExpenses[2].normalizedAmount)})
            </p>
            <p className="text-[10px] text-stone-400 truncate mt-1">
              {sortedExpenses[2].title}
            </p>
          </div>
        </div>
      )}

      {/* 大額支出清單列表 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs divide-y divide-stone-100">
        {sortedExpenses.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400">
            本月無折合超過 {minExpenseFilter.toLocaleString()} TWD 之大額支出記錄
          </div>
        ) : (
          sortedExpenses.map((exp, idx) => (
            <div
              key={exp.id}
              className="py-3 flex items-center justify-between text-xs hover:bg-stone-50/60 px-2 rounded-xl transition-colors gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className={`w-5 font-extrabold shrink-0 ${idx < 3 ? 'text-amber-600' : 'text-stone-400'}`}>
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-bold text-stone-900 truncate" title={exp.title}>{exp.title}</p>
                    <span className="text-[10px] px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded shrink-0">
                      {exp.categoryName || '一般支出'}
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-0.5 truncate">
                    {exp.userName} • {exp.date}
                  </p>
                </div>
              </div>

              {/* 雙軌呈現：原始外幣金額 + 折合台幣 TWD 基準 */}
              <div className="text-right shrink-0">
                <p className="font-black text-xs text-rose-600">
                  {exp.amount.toLocaleString()} {exp.currency}
                </p>
                <p className="text-[10px] font-bold text-stone-500">
                  (約 {formatCurrency(exp.normalizedAmount)})
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
