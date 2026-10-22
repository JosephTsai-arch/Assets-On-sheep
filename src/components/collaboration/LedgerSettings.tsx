import React, { useState } from 'react';
import { Ledger, Friend } from '../../types';
import { BookOpen, Users, Lock, Trash2, Edit3, Plus, ShieldAlert } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';

interface LedgerSettingsProps {
  ledgers: Ledger[];
  friends: Friend[];
  currentUserId: string;
  onOpenAddLedger: () => void;
  onEditLedger: (ledger: Ledger) => void;
  onDeleteLedger: (ledgerId: string) => Promise<void>;
}

export const LedgerSettings: React.FC<LedgerSettingsProps> = ({
  ledgers,
  friends,
  currentUserId,
  onOpenAddLedger,
  onEditLedger,
  onDeleteLedger,
}) => {
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const activeLedgers = ledgers.filter((l) => !l.deletedAt);

  const handleDelete = async (ledgerId: string) => {
    setIsDeletingId(ledgerId);
    try {
      await onDeleteLedger(ledgerId);
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
      {/* 標題與操作按鈕 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-600" />
            <span>帳本管理與多幣別設定</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            管理個人日常私帳與好友多幣別共管帳本，支援行內雙重確認軟刪除
          </p>
        </div>

        <button
          onClick={onOpenAddLedger}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} />
          <span>新增帳本</span>
        </button>
      </div>

      {/* 帳本列表 */}
      <div className="space-y-3">
        {activeLedgers.map((ledger) => {
          const isCreator = ledger.creatorId === currentUserId || ledger.userId === currentUserId;
          const isLastPrivateLedger = !ledger.isShared && activeLedgers.filter((l) => !l.isShared).length <= 1;

          return (
            <div
              key={ledger.id}
              className="p-4 bg-stone-50/80 border border-stone-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-stone-300 transition-colors"
            >
              {/* 帳本資訊 */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{ledger.isShared ? '🤝' : '🔒'}</span>
                  <span className="font-extrabold text-sm text-stone-900">{ledger.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-200/80 text-stone-700 rounded-md">
                    {ledger.currency}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    ledger.isShared ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {ledger.isShared ? '好友共管' : '私人帳本'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <span>成員：{ledger.memberIds?.length || 1} 人</span>
                  <span>•</span>
                  <span>建立於：{new Date(ledger.createdAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span className={isCreator ? 'text-emerald-600 font-bold' : 'text-stone-500'}>
                    {isCreator ? '👑 我是創建者' : '受邀協作者'}
                  </span>
                </div>
              </div>

              {/* 動作按鈕：編輯與行內雙重確認軟刪除 */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => onEditLedger(ledger)}
                  className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs rounded-xl border border-stone-200 shadow-2xs flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 size={13} />
                  <span>編輯</span>
                </button>

                {/* 刪除帳本按鈕：行內雙重確認，防手滑並寫入 deletedAt 軟刪除 */}
                {isLastPrivateLedger ? (
                  <span
                    title="系統必須保留至少一本私人日常私帳"
                    className="text-[11px] text-stone-400 px-2 py-1 bg-stone-100 rounded-xl cursor-not-allowed"
                  >
                    🔒 預設私帳 (不可刪)
                  </span>
                ) : (
                  <InlineConfirm
                    onConfirm={() => handleDelete(ledger.id)}
                    title={`確定刪除帳本「${ledger.name}」？此操作將進行軟刪除。`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
