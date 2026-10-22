import React, { useState } from 'react';
import { Category, Transaction } from '../../types';
import {
  generateCategoryCleaningSuggestions,
  CategoryCleaningSuggestion,
} from '../../services/categoryService';
import {
  batchUpdateTransactionCategories,
  CategoryCleaningUpdate,
} from '../../services/transactionService';
import { formatCurrency } from '../../utils/formatters';
import {
  Sparkles,
  ArrowRight,
  CheckSquare,
  Square,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wand2,
} from 'lucide-react';

interface AICleaningEngineProps {
  categories: Category[];
  transactions: Transaction[];
  onCleanApplied?: () => void;
}

export const AICleaningEngine: React.FC<AICleaningEngineProps> = ({
  categories,
  transactions,
  onCleanApplied,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [suggestions, setSuggestions] = useState<CategoryCleaningSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);

  // 1. 執行 AI 智慧比對掃描
  const handleScan = () => {
    setIsScanning(true);
    setSuccessMessage(null);
    try {
      const results = generateCategoryCleaningSuggestions(categories, transactions);
      setSuggestions(results);
      // 預設全選
      setSelectedIds(new Set(results.map((s) => s.transactionId)));
      setHasScanned(true);
    } finally {
      setIsScanning(false);
    }
  };

  // 2. 切換單一勾選 / 全選
  const handleToggle = (txId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedIds.size === suggestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(suggestions.map((s) => s.transactionId)));
    }
  };

  // 3. 【核心批次執行】：Firestore writeBatch 原子寫入
  const handleBatchCommit = async () => {
    const selectedSuggestions = suggestions.filter((s) => selectedIds.has(s.transactionId));
    if (selectedSuggestions.length === 0 || isCommitting) return;

    setIsCommitting(true);
    try {
      const updates: CategoryCleaningUpdate[] = selectedSuggestions.map((s) => ({
        transactionId: s.transactionId,
        newCategoryId: s.suggestedCategoryId,
        newCategoryName: s.suggestedCategoryName,
        newCategoryIcon: s.suggestedCategoryIcon,
      }));

      // 呼叫 transactionService 內之 writeBatch 進行原子批次更新 (嚴禁迴圈逐筆)
      const count = await batchUpdateTransactionCategories(updates);

      // 行內成功提示 (3.5秒自動消失)
      setSuccessMessage(`✅ 成功清洗 ${count} 筆明細至新分類！`);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3500);

      // 【自動清空/隱藏】目前的 AI 建議清單，讓 UI 恢復乾淨狀態
      setSuggestions([]);
      setSelectedIds(new Set());
      setHasScanned(false);

      if (onCleanApplied) {
        onCleanApplied();
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-3">
      {/* 標題與啟動掃描列 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h4 className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
            <Sparkles size={15} className="text-indigo-600" />
            <span>AI 智慧分類清洗引擎 (批次原子寫入)</span>
          </h4>
          <p className="text-[11px] text-indigo-700 mt-0.5">
            自動辨識品名語意特徵，推薦更精準之收支分類，審查後一鍵批次遷移
          </p>
        </div>

        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning || isCommitting}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-extrabold shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
        >
          {isScanning ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>語意掃描中...</span>
            </>
          ) : (
            <>
              <Wand2 size={13} />
              <span>{hasScanned && suggestions.length > 0 ? '重新診斷' : '掃描分類瑕疵'}</span>
            </>
          )}
        </button>
      </div>

      {/* 行內成功提示 (嚴禁 alert) */}
      {successMessage && (
        <div className="p-3 bg-emerald-100/90 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-black flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 掃描後無瑕疵狀態 */}
      {hasScanned && suggestions.length === 0 && !successMessage && (
        <div className="p-3 bg-white/80 rounded-xl border border-indigo-100 text-center text-xs text-indigo-800 font-bold">
          🎉 太棒了！您目前的交易明細分類清晰，未發現任何語意偏差或重複歸類！
        </div>
      )}

      {/* 1. 建議清單審查區 (Review Checklist) */}
      {suggestions.length > 0 && (
        <div className="space-y-2.5 pt-1">
          {/* 清單上方全選與計數控制列 */}
          <div className="flex items-center justify-between text-xs font-bold text-stone-700 px-1">
            <button
              type="button"
              onClick={handleToggleAll}
              className="flex items-center gap-1.5 text-indigo-700 hover:text-indigo-900 cursor-pointer"
            >
              {selectedIds.size === suggestions.length ? (
                <CheckSquare size={15} className="text-indigo-600" />
              ) : (
                <Square size={15} className="text-stone-400" />
              )}
              <span>
                {selectedIds.size === suggestions.length ? '取消全選' : '全選全部建議'}
              </span>
            </button>
            <span className="text-[11px] text-stone-500">
              共發現 {suggestions.length} 筆待清洗項目（已勾選 {selectedIds.size} 筆）
            </span>
          </div>

          {/* 建議項目列表 (可滾動) */}
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {suggestions.map((item) => {
              const isChecked = selectedIds.has(item.transactionId);

              return (
                <div
                  key={item.transactionId}
                  onClick={() => handleToggle(item.transactionId)}
                  className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                    isChecked
                      ? 'bg-white border-indigo-300 shadow-2xs'
                      : 'bg-white/60 border-stone-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Checkbox 單筆剔除 / 勾選 */}
                    <div className="shrink-0 text-indigo-600">
                      {isChecked ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} className="text-stone-400" />
                      )}
                    </div>

                    {/* 明細名稱與金額 */}
                    <div className="truncate">
                      <div className="flex items-center gap-1.5 font-bold text-stone-900">
                        <span className="truncate">{item.transactionTitle}</span>
                        <span className="text-[11px] text-stone-500 font-semibold shrink-0">
                          ({formatCurrency(item.transactionAmount, item.currency as any)})
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-400 truncate">{item.reason}</p>
                    </div>
                  </div>

                  {/* 原分類 ➔ AI 建議新分類 */}
                  <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold">
                    <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md flex items-center gap-1">
                      <span>{item.originalCategoryIcon}</span>
                      <span>{item.originalCategoryName}</span>
                    </span>

                    <ArrowRight size={12} className="text-indigo-400" />

                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md flex items-center gap-1">
                      <span>{item.suggestedCategoryIcon}</span>
                      <span>{item.suggestedCategoryName}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2. 批次執行寫入按鈕 (Batch Commit) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleBatchCommit}
              disabled={selectedIds.size === 0 || isCommitting}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCommitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>批次原子更新中 (Firestore writeBatch)...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>✨ 一鍵套用清洗 (已選 {selectedIds.size} 筆)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
