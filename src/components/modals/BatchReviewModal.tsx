import React, { useState, useEffect } from 'react';
import { BatchTransactionItem, PendingBatch, User } from '../../types';
import {
  X,
  Check,
  Plus,
  Loader2,
  Layers,
  AlertCircle,
  CheckCircle2,
  Save,
} from 'lucide-react';
import { BatchItemRow } from './batch/BatchItemRow';
import { saveLocalDraft, clearLocalDraft } from '../../services/batchDraftService';

interface BatchReviewModalProps {
  isOpen: boolean;
  batchId: string | null;
  onClose: () => void;
  currentUser: User | null;
  onSuccess?: () => void;
  onDraftSaved?: (draft: PendingBatch) => void;
}

export const BatchReviewModal: React.FC<BatchReviewModalProps> = ({
  isOpen,
  batchId,
  onClose,
  currentUser,
  onSuccess,
  onDraftSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [batch, setBatch] = useState<PendingBatch | null>(null);
  const [items, setItems] = useState<BatchTransactionItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen && batchId) {
      loadBatchData(batchId);
    }
  }, [isOpen, batchId]);

  const loadBatchData = async (id: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/batch/${id}`);
      const data = await res.json();
      if (data.success && data.batch) {
        setBatch(data.batch);
        setItems(data.batch.items || []);
      } else {
        setErrorMsg(data.error || '讀取批次資料失敗或該批次已入帳');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '網路異常無法載入批次');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = (index: number, updates: Partial<BatchTransactionItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddItem = () => {
    const today = new Date().toISOString().split('T')[0];
    const newItem: BatchTransactionItem = {
      id: `item_manual_${Date.now()}`,
      date: items.length > 0 ? items[items.length - 1].date : today,
      title: '新項目',
      amount: 100,
      type: 'expense',
      category: '餐飲美食',
    };
    setItems((prev) => [...prev, newItem]);
  };

  // 清除 URL 中的 openModal 與 bid 參數，防止組件重渲染時無限循環重新彈出
  const cleanUrlParams = () => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('openModal') || url.searchParams.has('bid')) {
        url.searchParams.delete('openModal');
        url.searchParams.delete('bid');
        window.history.replaceState({}, document.title, url.pathname + (url.search || ''));
      }
    } catch (e) {
      console.warn('URL clean error:', e);
    }
  };

  // 關閉視窗核心：自動儲存為草稿、寫入 LocalStorage 與後端、關閉 LIFF / React Modal
  const handleSafeClose = async () => {
    cleanUrlParams();

    if (batchId && items.length > 0) {
      setSavingDraft(true);
      const validItems = items.filter((i) => !i.isIgnored && i.amount > 0);
      const updatedBatch: PendingBatch = {
        ...(batch || {
          id: batchId,
          userId: currentUser?.id || 'anonymous',
          createdAt: new Date().toISOString(),
          status: 'PENDING',
          dateRange: '',
        }),
        items,
        totalExpense: validItems.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0),
        totalIncome: validItems.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0),
        validCount: validItems.length,
        zeroCount: items.length - validItems.length,
        isDraft: true,
        updatedAt: new Date().toISOString(),
      };

      // 1. 本地儲存保底
      saveLocalDraft(updatedBatch, currentUser?.id);
      if (onDraftSaved) onDraftSaved(updatedBatch);

      // 2. 背景同步至後端
      fetch(`/api/batch/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, isDraft: true }),
      }).catch((e) => console.warn('[AutoSave Draft Background]:', e));
    }

    // 3. 若處於 LINE 原生視窗中，嘗試關閉 LIFF 視窗
    if (typeof window !== 'undefined' && (window as any).liff?.isInClient?.()) {
      try {
        (window as any).liff.closeWindow();
      } catch (e) {
        console.warn('LIFF close window error:', e);
      }
    }

    onClose();
  };

  const validItems = items.filter((i) => !i.isIgnored && i.amount > 0);
  const totalExpense = validItems
    .filter((i) => i.type === 'expense')
    .reduce((sum, i) => sum + i.amount, 0);
  const totalIncome = validItems
    .filter((i) => i.type === 'income')
    .reduce((sum, i) => sum + i.amount, 0);

  const handleCommit = async () => {
    if (!batchId) return;
    setCommitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. 同步保存微調後的項目
      await fetch(`/api/batch/${batchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      // 2. 觸發原子入帳
      const res = await fetch(`/api/batch/${batchId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`🎉 成功匯入 ${data.insertedCount} 筆交易紀錄！`);
        clearLocalDraft(currentUser?.id);
        cleanUrlParams();
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(data.error || '批量入帳失敗');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '通訊異常');
    } finally {
      setCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSafeClose();
      }}
    >
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-2xl backdrop-blur-xs">
              <Layers size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">批量記帳核對與微調</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  共 {validItems.length} 筆
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">逐筆確認金額與分類，關閉時將自動保存為草稿</p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="關閉"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dashboard Banner */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] font-bold text-slate-400 block uppercase">總支出</span>
              <span className="text-base font-black text-rose-600">-NT$ {totalExpense.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 block uppercase">總收入</span>
              <span className="text-base font-black text-emerald-600">+NT$ {totalIncome.toLocaleString()}</span>
            </div>
            {batch?.dateRange && (
              <div className="hidden sm:block">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">涵蓋日期</span>
                <span className="text-xs font-bold text-slate-700">{batch.dateRange}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleAddItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <Plus size={14} />
            <span>新增一筆</span>
          </button>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* List Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-2.5 flex-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 size={30} className="animate-spin text-indigo-600" />
              <p className="text-xs font-bold">載入待確認明細中...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-xs">暫無待處理的批量交易資料</div>
          ) : (
            items.map((item, index) => (
              <BatchItemRow
                key={item.id || index}
                index={index}
                item={item}
                onUpdate={handleUpdateItem}
                onDelete={handleDeleteItem}
              />
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleSafeClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save size={14} />
            <span>{savingDraft ? '正在保存草稿...' : '保存為草稿並關閉'}</span>
          </button>

          <button
            onClick={handleCommit}
            disabled={committing || validItems.length === 0}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-extrabold rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {committing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>正在寫入交易紀錄...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>✅ 確認全數入帳 ({validItems.length} 筆)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
