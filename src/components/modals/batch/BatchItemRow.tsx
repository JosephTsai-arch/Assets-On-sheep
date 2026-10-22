import React from 'react';
import { BatchTransactionItem } from '../../../types';
import { Trash2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface BatchItemRowProps {
  index: number;
  item: BatchTransactionItem;
  onUpdate: (index: number, updates: Partial<BatchTransactionItem>) => void;
  onDelete: (index: number) => void;
}

export const BatchItemRow: React.FC<BatchItemRowProps> = ({
  index,
  item,
  onUpdate,
  onDelete,
}) => {
  const isIgnored = Boolean(item.isIgnored || item.amount === 0);

  return (
    <div
      className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 ${
        isIgnored
          ? 'bg-slate-50/60 border-slate-200 opacity-60'
          : 'bg-white border-slate-200/90 hover:border-indigo-300 shadow-2xs'
      }`}
    >
      {/* 編號與收支切換 */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-black text-slate-400 w-6">#{index + 1}</span>
        <button
          type="button"
          onClick={() =>
            onUpdate(index, {
              type: item.type === 'income' ? 'expense' : 'income',
            })
          }
          className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-0.5 ${
            item.type === 'income'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          {item.type === 'income' ? (
            <>
              <ArrowDownLeft size={11} />
              <span>收入</span>
            </>
          ) : (
            <>
              <ArrowUpRight size={11} />
              <span>支出</span>
            </>
          )}
        </button>
      </div>

      {/* 日期 */}
      <div className="w-28 shrink-0">
        <input
          type="date"
          value={item.date}
          onChange={(e) => onUpdate(index, { date: e.target.value })}
          className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* 品名 */}
      <div className="flex-1 min-w-[120px]">
        <input
          type="text"
          value={item.title}
          placeholder="品名"
          onChange={(e) => onUpdate(index, { title: e.target.value })}
          className="w-full px-2.5 py-1.5 text-xs font-bold text-slate-800 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* 金額 */}
      <div className="w-24 shrink-0">
        <input
          type="number"
          value={item.amount || ''}
          placeholder="0"
          onChange={(e) => onUpdate(index, { amount: parseFloat(e.target.value) || 0 })}
          className="w-full px-2.5 py-1.5 text-xs font-black text-slate-900 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-right font-mono"
        />
      </div>

      {/* 分類 */}
      <div className="w-28 shrink-0">
        <input
          type="text"
          value={item.category}
          placeholder="分類"
          onChange={(e) => onUpdate(index, { category: e.target.value })}
          className="w-full px-2.5 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* 刪除按鈕 */}
      <button
        type="button"
        onClick={() => onDelete(index)}
        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
        title="刪除此筆"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};
