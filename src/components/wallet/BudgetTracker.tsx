import React, { useState, useMemo } from 'react';
import { Budget, Category, Transaction } from '../../types';
import { formatCurrency, convertToTWD } from '../../utils/formatters';
import { getUserExpenseForTransaction } from '../../utils/mathUtils';
import { Plus, PieChart, ShieldAlert, Sparkles, TrendingUp, AlertTriangle, Edit3, Check, X } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';

interface BudgetTrackerProps {
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
  currentMonth: string;
  currentUserId?: string;
  onSetBudget: (month: string, amount: number, categoryId?: string) => Promise<any>;
  onUpdateBudget?: (budgetId: string, amount: number, categoryId?: string) => Promise<any>;
  onDeleteBudget?: (budgetId: string) => Promise<any>;
}

export const BudgetTracker: React.FC<BudgetTrackerProps> = ({
  categories,
  budgets,
  transactions,
  currentMonth,
  currentUserId = '',
  onSetBudget,
  onUpdateBudget,
  onDeleteBudget,
}) => {
  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const [selectedCatId, setSelectedCatId] = useState<string>(expenseCategories[0]?.id || '');
  const [budgetInput, setBudgetInput] = useState<string>('3000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editAmountInput, setEditAmountInput] = useState<string>('');
  const [editCatIdInput, setEditCatIdInput] = useState<string>('');
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. 本月份所有有效預算列表 (包含具體分類預算與全域總預算)
  const activeMonthBudgets = useMemo(() => {
    return budgets.filter((b) => b.month === currentMonth && !b.deletedAt);
  }, [budgets, currentMonth]);

  // 分類預算清單
  const categoryBudgets = useMemo(() => {
    return activeMonthBudgets.filter((b) => b.categoryId && b.categoryId !== 'total');
  }, [activeMonthBudgets]);

  // 全域/未分類預算清單
  const globalBudgets = useMemo(() => {
    return activeMonthBudgets.filter((b) => !b.categoryId || b.categoryId === 'total');
  }, [activeMonthBudgets]);

  // 2. 【核心鐵律】：全域總預算額度
  // 若有子分類預算，則依子分類預算加總；若設有全域預算且無子預算，則採全域預算；若兩者皆有，子預算加總加上全域未指定額度
  const totalBudgetLimit = useMemo(() => {
    const catSum = categoryBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const globalSum = globalBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    return catSum > 0 ? catSum : globalSum;
  }, [categoryBudgets, globalBudgets]);

  // 3. 加總當月所有真實開銷交易 (嚴格僅計算本人份額)
  const totalActualExpense = useMemo(() => {
    return transactions
      .filter((t) => t.date.startsWith(currentMonth) && !t.deletedAt && t.type === 'expense')
      .reduce((sum, t) => sum + convertToTWD(getUserExpenseForTransaction(t, currentUserId), t.currency), 0);
  }, [transactions, currentMonth, currentUserId]);

  // 全域總預算進度與狀態
  const totalProgressPercent = totalBudgetLimit > 0
    ? Math.min(100, Math.round((totalActualExpense / totalBudgetLimit) * 100))
    : 0;
  const isTotalOver = totalActualExpense > totalBudgetLimit && totalBudgetLimit > 0;
  const totalRemaining = Math.max(0, totalBudgetLimit - totalActualExpense);

  const handleSaveCategoryBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(budgetInput);
    if (!selectedCatId || isNaN(amount) || amount <= 0) return;

    setIsSubmitting(true);
    try {
      await onSetBudget(currentMonth, amount, selectedCatId);
      setBudgetInput('3000');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 【全域總預算動態面板】：由子分類預算自動推導加總 */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-6 text-white shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-700/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <PieChart size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                全域總開銷預算監控 ({currentMonth})
              </h3>
              <p className="text-[11px] text-stone-400">
                由下方 {categoryBudgets.length} 個子分類預算自動動態反向推導累加（嚴禁手動寫死）
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 bg-stone-700 text-stone-300 rounded-xl">
            {categoryBudgets.length > 0 ? '✨ 子分類動態加總' : '尚未分配子預算'}
          </span>
        </div>

        {/* 總額數據網格 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-stone-800/80 rounded-2xl border border-stone-700/60 min-w-0">
            <span className="text-[11px] text-stone-400 font-bold block truncate">全域總預算上限</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5 block truncate max-w-full" title={formatCurrency(totalBudgetLimit)}>
              {formatCurrency(totalBudgetLimit)}
            </span>
          </div>

          <div className="p-3.5 bg-stone-800/80 rounded-2xl border border-stone-700/60 min-w-0">
            <span className="text-[11px] text-stone-400 font-bold block truncate">當月實際總支出</span>
            <span className={`text-xl sm:text-2xl font-black mt-0.5 block truncate max-w-full ${isTotalOver ? 'text-rose-400' : 'text-stone-100'}`} title={formatCurrency(totalActualExpense)}>
              {formatCurrency(totalActualExpense)}
            </span>
          </div>

          <div className="p-3.5 bg-stone-800/80 rounded-2xl border border-stone-700/60 min-w-0">
            <span className="text-[11px] text-stone-400 font-bold block truncate">全域剩餘可用額度</span>
            <span className="text-xl sm:text-2xl font-black text-teal-300 mt-0.5 block truncate max-w-full" title={formatCurrency(totalRemaining)}>
              {formatCurrency(totalRemaining)}
            </span>
          </div>
        </div>

        {/* 全域動態進度條 */}
        {totalBudgetLimit > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center text-xs font-semibold text-stone-300">
              <span className="flex items-center gap-1.5">
                {isTotalOver ? (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertTriangle size={14} /> 警告：總開銷已超出總預算上限！
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Sparkles size={14} /> 全域消耗進度：{totalProgressPercent}%
                  </span>
                )}
              </span>
              <span>{formatCurrency(totalActualExpense)} / {formatCurrency(totalBudgetLimit)}</span>
            </div>

            <div className="w-full bg-stone-700/70 h-3 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isTotalOver
                    ? 'bg-rose-500 ring-2 ring-rose-400'
                    : totalProgressPercent > 80
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${totalProgressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. 子分類預算設定與明細管理 */}
      <div data-tour="budget-input-section" className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div>
            <h4 className="text-sm font-extrabold text-stone-900 flex items-center gap-1.5">
              <TrendingUp size={16} className="text-emerald-600" />
              <span>設定子分類預算</span>
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              請在此挑選分類並輸入額度，設定後將即時連動上方「全域總開銷預算」
            </p>
          </div>

          {/* 新增/更新子預算表單 */}
          <form onSubmit={handleSaveCategoryBudget} className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              className="px-3 py-1.5 border border-stone-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="total">📊 全域總支出預算</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="100"
              inputMode="decimal"
              min="100"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder="額度"
              className="w-24 px-2.5 py-1.5 border border-stone-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSubmitting || !selectedCatId}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={14} />
              <span>設定預算</span>
            </button>
          </form>
        </div>

        {/* 預算列表渲染 */}
        {activeMonthBudgets.length === 0 ? (
          <div className="text-center py-8 bg-stone-50 rounded-2xl border border-stone-100 space-y-2">
            <p className="text-xs font-bold text-stone-700">尚未分配任何預算規劃</p>
            <p className="text-[11px] text-stone-400 max-w-sm mx-auto">
              請從上方挑選支出分類（例如：餐飲、交通、娛樂）或設定全域總支出預算，輸入目標金額後儲存！
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {activeMonthBudgets.map((b) => {
              const isGlobalBudget = !b.categoryId || b.categoryId === 'total';
              const cat = !isGlobalBudget ? categories.find((c) => c.id === b.categoryId) : null;
              const catName = isGlobalBudget ? '全域總支出預算' : (cat?.name || '指定分類');
              const catIcon = isGlobalBudget ? '📊' : (cat?.icon || '🏷️');

              // 計算花費：若為全域總預算，計算當月總支出；若為分類預算，計算該分類支出
              const spent = isGlobalBudget
                ? totalActualExpense
                : transactions
                    .filter(
                      (t) =>
                        t.date.startsWith(currentMonth) &&
                        !t.deletedAt &&
                        t.type === 'expense' &&
                        t.categoryId === b.categoryId
                    )
                    .reduce((sum, t) => sum + convertToTWD(getUserExpenseForTransaction(t, currentUserId), t.currency), 0);

              const percent = Math.min(100, Math.round((spent / (b.amount || 1)) * 100));
              const isOver = spent > b.amount;
              const barColor = isOver ? 'bg-rose-500' : percent > 80 ? 'bg-amber-500' : 'bg-emerald-500';
              const isEditingThis = editingBudgetId === b.id;
              const isDeletingThis = deletingBudgetId === b.id;

              const handleSaveInlineEdit = async () => {
                const newAmount = parseFloat(editAmountInput);
                if (!isNaN(newAmount) && newAmount > 0) {
                  if (onUpdateBudget) {
                    await onUpdateBudget(b.id, newAmount, editCatIdInput || b.categoryId);
                  } else {
                    await onSetBudget(b.month, newAmount, editCatIdInput || b.categoryId);
                  }
                }
                setEditingBudgetId(null);
              };

              const handleConfirmDelete = async () => {
                if (!onDeleteBudget) return;
                setIsDeleting(true);
                try {
                  await onDeleteBudget(b.id);
                  setDeletingBudgetId(null);
                } finally {
                  setIsDeleting(false);
                }
              };

              return (
                <div key={b.id} className="p-4 bg-stone-50/80 border border-stone-200/80 rounded-2xl space-y-2.5 transition-all">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-lg shrink-0">{catIcon}</span>
                      <span className="font-bold text-stone-800 truncate" title={catName}>{catName}</span>
                    </div>
                    
                    {/* 右側：金額與操作按鈕 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="font-bold text-stone-900">{formatCurrency(spent)}</span>
                        <span className="text-stone-400"> / {formatCurrency(b.amount)}</span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingBudgetId(b.id);
                          setEditAmountInput(String(b.amount));
                          setEditCatIdInput(b.categoryId || '');
                          setDeletingBudgetId(null);
                        }}
                        className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="修改預算金額與分類"
                      >
                        <Edit3 size={14} />
                      </button>
                      {onDeleteBudget && (
                        <button
                          onClick={() => {
                            setDeletingBudgetId(b.id);
                            setEditingBudgetId(null);
                          }}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="刪除此筆預算"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ✏️ 展開式修改面板 */}
                  {isEditingThis && (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 animate-in fade-in">
                      <div className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                        <Edit3 size={12} className="text-emerald-600" />
                        <span>修改「{catName}」預算規劃</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-stone-600 mb-0.5">支出分類</label>
                          <select
                            value={editCatIdInput}
                            onChange={(e) => setEditCatIdInput(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-bold"
                          >
                            <option value="total">📊 全域總支出預算</option>
                            {expenseCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.icon} {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-stone-600 mb-0.5">預算上限 (元)</label>
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            value={editAmountInput}
                            onChange={(e) => setEditAmountInput(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg font-bold"
                            placeholder="輸入新金額"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          onClick={() => setEditingBudgetId(null)}
                          className="px-2.5 py-1 text-xs text-stone-500 hover:bg-stone-200/60 rounded-lg cursor-pointer"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSaveInlineEdit}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <Check size={12} />
                          <span>儲存變更</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 🗑️ 展開式刪除確認面板 (防破版、防擠壓) */}
                  {isDeletingThis && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs animate-in fade-in">
                      <span className="font-bold text-rose-800 text-[11px] truncate">
                        確定刪除「{catName}」預算規劃？
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setDeletingBudgetId(null)}
                          className="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleConfirmDelete}
                          disabled={isDeleting}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          {isDeleting ? '刪除中...' : '確定刪除'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 動態進度條 */}
                  <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-stone-500">
                    <span>
                      進度：{percent}% {isOver ? '⚠️ 已超出上限' : percent >= 80 ? '⚡ 預警階段' : '🌱 正常'}
                    </span>
                    <span className="font-semibold text-stone-700">
                      剩餘：{formatCurrency(Math.max(0, b.amount - spent))}
                    </span>
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
