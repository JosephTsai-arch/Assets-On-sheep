import React from 'react';
import { Ledger } from '../../../types';
import { Check } from 'lucide-react';

interface SplitExpenseSectionProps {
  currentLedger?: Ledger;
  safeLedgers: Ledger[];
  payerMemberId: string;
  setPayerMemberId: (id: string) => void;
  currentUserId: string;
  availableMembers: { id: string; name: string }[];
  selectedSplitMemberIds: string[];
  handleToggleMember: (id: string) => void;
  amount: string;
  aiFilledFields: Set<string>;
  setLedgerId: (id: string) => void;
}

export const SplitExpenseSection: React.FC<SplitExpenseSectionProps> = ({
  currentLedger,
  safeLedgers,
  payerMemberId,
  setPayerMemberId,
  currentUserId,
  availableMembers,
  selectedSplitMemberIds,
  handleToggleMember,
  amount,
  aiFilledFields,
  setLedgerId,
}) => {
  return (
    <>
      {/* 共管帳本專屬：付款代墊人選擇 */}
      {currentLedger?.isShared && (
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-1.5">
          <label className="block text-xs font-bold text-amber-900">
            誰先付款 / 代墊？ *
          </label>
          <select
            value={payerMemberId}
            onChange={(e) => setPayerMemberId(e.target.value)}
            className="w-full px-3 py-2 border border-amber-300 rounded-xl text-xs font-bold bg-white text-stone-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          >
            {availableMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? '🙋‍♂️ 本人 (我)' : `👤 ${m.name}`}
              </option>
            ))}
          </select>
          {payerMemberId !== currentUserId ? (
            <p className="text-[11px] text-amber-800 font-medium bg-amber-100/60 p-2 rounded-xl">
              💡 <strong>由成員先代墊</strong>：系統將自動記入 AA 平帳待還款，<strong>不會自您的資產帳戶扣款</strong>！
            </p>
          ) : (
            <p className="text-[11px] text-emerald-800 font-medium bg-emerald-50/80 p-2 rounded-xl">
              💳 <strong>由您先全額代墊</strong>：系統將自您下方選擇的資產帳戶扣款，並為其他分帳成員建立待清償債權！
            </p>
          )}
        </div>
      )}

      {/* AA 平攤成員勾選 (若為共管帳本) */}
      {currentLedger?.isShared ? (
        <div
          className={`p-3 border rounded-2xl transition-all ${
            aiFilledFields.has('split')
              ? 'bg-amber-50/90 border-amber-300 ring-1 ring-amber-300'
              : 'bg-amber-50/70 border-amber-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <span>👥 AA 平攤成員勾選 ({selectedSplitMemberIds.length} 人均分)</span>
              {aiFilledFields.has('split') && (
                <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-1.5 py-0.2 rounded">
                  ✨ AI 辨識成員
                </span>
              )}
            </span>
            <span className="text-[11px] font-bold text-amber-700">
              每人約{' '}
              {amount && !isNaN(Number(amount))
                ? Math.round(Number(amount) / Math.max(1, selectedSplitMemberIds.length)).toLocaleString()
                : 0}{' '}
              {currentLedger?.currency || 'TWD'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {availableMembers.map((m) => {
              const isChecked = selectedSplitMemberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleToggleMember(m.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer border gap-1.5 ${
                    isChecked
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-white text-stone-600 border-amber-200 hover:bg-amber-100/50'
                  }`}
                >
                  <span className="truncate min-w-0 flex-1 text-left" title={m.name}>{m.name}</span>
                  {isChecked && <Check size={12} strokeWidth={3} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        safeLedgers.some((l) => l.isShared) && (
          <div className="p-2.5 bg-stone-50 border border-stone-200/70 rounded-2xl flex items-center justify-between">
            <span className="text-xs text-stone-500 font-medium">
              👥 需與好友 (媽媽、小美、阿倫) AA 平攤？
            </span>
            <button
              type="button"
              onClick={() => {
                const shared = safeLedgers.find((l) => l.isShared);
                if (shared) setLedgerId(shared.id);
              }}
              className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold hover:bg-amber-200 transition-colors"
            >
              切換為共管帳本 🤝
            </button>
          </div>
        )
      )}
    </>
  );
};
