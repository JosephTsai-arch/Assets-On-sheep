import React, { useState } from 'react';
import { AccountMergeSummary, MergeChoice } from '../../services/accountMergeService';
import { X, GitMerge, AlertTriangle, CheckCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface AccountMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: AccountMergeSummary;
  onExecuteMerge: (choice: MergeChoice) => Promise<void>;
}

export const AccountMergeModal: React.FC<AccountMergeModalProps> = ({
  isOpen,
  onClose,
  summary,
  onExecuteMerge,
}) => {
  const [isMerging, setIsMerging] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<MergeChoice>('keep_google');

  if (!isOpen) return null;

  const handleChoice = async (choice: MergeChoice) => {
    setSelectedChoice(choice);
    setIsMerging(true);
    try {
      await onExecuteMerge(choice);
      onClose();
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-stone-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <GitMerge size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-stone-900 leading-tight">
                Gmail (Google) 與 LINE 雙向帳號融合
              </h2>
              <p className="text-[11px] text-stone-500 font-medium">
                架構書指定規格：三選一原子合併・徹底解決多身分同步
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isMerging}
            className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Alert Notice */}
          <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              系統偵測到您的 <strong>Gmail/Google 帳號</strong> 與 <strong>LINE 帳號</strong> 皆有獨立的記帳紀錄或資產。請自下方三項架構書方案中選擇一種整合方式：
            </span>
          </div>

          {/* Side-by-side stats comparison */}
          <div className="grid grid-cols-2 gap-3">
            {/* Google side */}
            <div className="p-4 bg-blue-50/50 border border-blue-200/70 rounded-2xl flex flex-col items-center text-center">
              <img
                src={
                  summary.googleStats.avatarUrl ||
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                }
                alt="Google"
                className="w-14 h-14 rounded-full object-cover border-2 border-blue-400 mb-2 shadow-xs"
              />
              <span className="text-xs font-bold text-stone-800 truncate w-full">
                {summary.googleStats.displayName}
              </span>
              <span className="text-[10px] text-blue-600 font-semibold mb-2 truncate max-w-full">
                {summary.googleStats.email || 'Google 帳號'}
              </span>

              <div className="w-full space-y-1.5 text-left text-xs bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                <div className="flex justify-between text-stone-500 text-[11px]">
                  <span>交易筆數</span>
                  <span className="font-bold text-stone-800">
                    {summary.googleStats.transactionCount} 筆
                  </span>
                </div>
                <div className="flex justify-between text-stone-500 text-[11px]">
                  <span>總資產</span>
                  <span className="font-bold text-blue-700">
                    {formatCurrency(summary.googleStats.totalAssets)}
                  </span>
                </div>
              </div>
            </div>

            {/* LINE side */}
            <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl flex flex-col items-center text-center">
              <img
                src={
                  summary.lineStats.avatarUrl ||
                  'https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=100'
                }
                alt="LINE"
                className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500 mb-2 shadow-xs"
              />
              <span className="text-xs font-bold text-stone-800 truncate w-full">
                {summary.lineStats.displayName}
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold mb-2 truncate max-w-full font-mono">
                ID: {summary.lineStats.lineUserId || summary.lineUserId}
              </span>

              <div className="w-full space-y-1.5 text-left text-xs bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                <div className="flex justify-between text-stone-500 text-[11px]">
                  <span>交易筆數</span>
                  <span className="font-bold text-stone-800">
                    {summary.lineStats.transactionCount} 筆
                  </span>
                </div>
                <div className="flex justify-between text-stone-500 text-[11px]">
                  <span>總資產</span>
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(summary.lineStats.totalAssets)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Three Architecture Spec Options (三個架構書提供的選項) */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-extrabold text-stone-700 flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-emerald-600" />
              <span>請選擇資料融合架構方案（點擊即執行原子合併）：</span>
            </div>

            {/* 選項 3: 智慧去重合併 (推薦置頂) */}
            <button
              type="button"
              onClick={() => handleChoice('smart_merge')}
              disabled={isMerging}
              className={`w-full p-4 rounded-2xl border-2 transition-all cursor-pointer text-left relative flex flex-col gap-1.5 ${
                selectedChoice === 'smart_merge'
                  ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-200'
                  : 'border-stone-200 hover:border-amber-400 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <span className="text-xs font-extrabold text-stone-900">
                    智慧雙向去重融合 (架構書推薦方案)
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full flex items-center gap-1">
                  <Sparkles size={10} /> 最佳推薦
                </span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed pl-7">
                完整保留兩端的所有記帳與資產帳本！系統自動比對<strong>「同一天、同金額、同項目」</strong>智慧防重剔除，兩端身分永久錨定統一，資料完全不遺失。
              </p>
            </button>

            {/* 選項 1: 保留 Google，捨棄 LINE */}
            <button
              type="button"
              onClick={() => handleChoice('keep_google')}
              disabled={isMerging}
              className={`w-full p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col gap-1 ${
                selectedChoice === 'keep_google'
                  ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-100'
                  : 'border-stone-200 hover:border-blue-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <span className="text-xs font-bold text-stone-900">
                    保留 Google (Gmail) 帳號，捨棄 LINE 歷史資料
                  </span>
                </div>
                <span className="text-blue-600 text-xs font-bold">執行 ➔</span>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed pl-7">
                以 Google (Gmail) 為唯一存續主身分。捨棄 LINE 端過往的獨立記帳與錢包資料，將 LINE ID 永久綁定至 Google，未來的 LINE 記帳直接寫入本 Google 帳號。
              </p>
            </button>

            {/* 選項 2: 保留 LINE，捨棄 Google */}
            <button
              type="button"
              onClick={() => handleChoice('keep_line')}
              disabled={isMerging}
              className={`w-full p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col gap-1 ${
                selectedChoice === 'keep_line'
                  ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-100'
                  : 'border-stone-200 hover:border-emerald-400 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
                    2
                  </span>
                  <span className="text-xs font-bold text-stone-900">
                    保留 LINE 帳號，捨棄 Google (Gmail) 歷史資料
                  </span>
                </div>
                <span className="text-emerald-700 text-xs font-bold">執行 ➔</span>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed pl-7">
                以 LINE 官方身分為唯一存續帳號。捨棄 Google 端過往的獨立記帳，將此 Google 授權憑證歸併至 LINE 帳號中。
              </p>
            </button>
          </div>

          {/* Loading status banner */}
          {isMerging && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-center gap-2 text-xs font-bold text-amber-800 animate-pulse">
              <span className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></span>
              <span>正在執行原子交易雙向融合與資料遷移中，請稍候...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
