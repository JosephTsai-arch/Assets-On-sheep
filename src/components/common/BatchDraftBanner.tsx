import React, { useState } from 'react';
import { PendingBatch } from '../../types';
import { Layers, Edit3, CheckCircle2, Trash2, Loader2, Sparkles } from 'lucide-react';

interface BatchDraftBannerProps {
  draft: PendingBatch | null;
  onOpenEdit: (batchId: string) => void;
  onCommitSuccess: () => void;
  onDiscard: (batchId: string) => void;
  currentUserId?: string;
}

export const BatchDraftBanner: React.FC<BatchDraftBannerProps> = ({
  draft,
  onOpenEdit,
  onCommitSuccess,
  onDiscard,
  currentUserId,
}) => {
  const [committing, setCommitting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);

  if (!draft || draft.status !== 'PENDING' || !draft.items || draft.items.length === 0) {
    return null;
  }

  const validCount = draft.items.filter((i) => !i.isIgnored && i.amount > 0).length;
  if (validCount === 0) return null;

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const res = await fetch(`/api/batch/${draft.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });
      const data = await res.json();
      if (data.success) {
        onCommitSuccess();
      } else {
        alert(`一鍵入帳失敗：${data.error || '請重試'}`);
      }
    } catch (e: any) {
      alert(`網路異常：${e?.message || '請稍後再試'}`);
    } finally {
      setCommitting(false);
    }
  };

  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      await fetch(`/api/batch/${draft.id}`, { method: 'DELETE' });
      onDiscard(draft.id);
      setIsConfirmingDiscard(false);
    } catch (e: any) {
      console.warn('Discard draft error:', e);
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <div className="mb-6 bg-gradient-to-r from-indigo-900/90 via-slate-900 to-indigo-950 text-white p-4 sm:p-5 rounded-3xl shadow-xl border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top-3">
      {/* 資訊區域 */}
      <div className="flex items-center gap-3.5">
        <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-400/30 shrink-0">
          <Layers size={22} className="animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-1.5">
              <span>📝 您有 1 筆批量記帳草稿待確認</span>
              <span className="text-[10px] bg-indigo-500/40 text-indigo-200 px-2 py-0.5 rounded-full font-bold">
                已安全暫存
              </span>
            </h4>
          </div>
          <p className="text-xs text-indigo-200/80 font-medium mt-0.5">
            共 <strong className="text-white font-black">{validCount}</strong> 筆明細，總支出{' '}
            <strong className="text-rose-300 font-black">NT$ {draft.totalExpense?.toLocaleString() || 0}</strong> 元
            {draft.dateRange ? `（涵蓋 ${draft.dateRange}）` : ''}
          </p>
        </div>
      </div>

      {/* 動作按鈕 */}
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
        <button
          onClick={() => onOpenEdit(draft.id)}
          className="px-3.5 py-2 bg-white/10 hover:bg-white/20 active:scale-98 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/15 cursor-pointer"
        >
          <Edit3 size={14} />
          <span>繼續編輯</span>
        </button>

        <button
          onClick={handleCommit}
          disabled={committing}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {committing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>入帳中...</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} />
              <span>✅ 一鍵入帳</span>
            </>
          )}
        </button>

        {isConfirmingDiscard ? (
          <div className="flex items-center gap-1 bg-rose-950/80 px-2 py-1 rounded-xl border border-rose-500/40 text-xs">
            <span className="text-rose-200 text-[11px] font-bold">確定捨棄？</span>
            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
            >
              確定
            </button>
            <button
              onClick={() => setIsConfirmingDiscard(false)}
              className="px-2 py-1 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsConfirmingDiscard(true)}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
            title="捨棄草稿"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
