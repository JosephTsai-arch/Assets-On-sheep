import React, { useState } from 'react';
import { Ledger, Transaction, Friend, AssetAccount } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { calculateLedgerSettlement, executeSettlementPayment } from '../../services/settlementService';
import { ArrowRight, X, Wallet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface MinCashFlowModalProps {
  ledger: Ledger;
  transactions: Transaction[];
  friends: Friend[];
  currentUserId: string;
  currentUserName: string;
  assetAccounts?: AssetAccount[];
  onClose: () => void;
  onReload: () => void;
}

export const MinCashFlowModal: React.FC<MinCashFlowModalProps> = ({
  ledger,
  transactions,
  friends,
  currentUserId,
  currentUserName,
  assetAccounts = [],
  onClose,
  onReload,
}) => {
  const [settlingKey, setSettlingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    assetAccounts[0]?.id || ''
  );

  const settlement = calculateLedgerSettlement(
    ledger,
    transactions,
    friends,
    currentUserId,
    currentUserName
  );

  const handleSettle = async (debt: any, index: number) => {
    const key = `debt_${index}_${debt.fromId}_${debt.toId}`;
    if (settlingKey) return; // 防止重複連點
    setSettlingKey(key);
    try {
      await executeSettlementPayment(
        currentUserId,
        ledger.id,
        ledger.currency,
        debt,
        selectedAccountId || undefined
      );
      setFeedback({
        type: 'success',
        message: `✨ 沖銷成功！「${debt.fromName}」支付給「${debt.toName}」${formatCurrency(debt.amount, ledger.currency)} 已成功結清！`,
      });
      onReload();
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: e?.message || '沖銷失敗，請稍後重試',
      });
    } finally {
      setSettlingKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 border border-stone-200 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-stone-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-stone-900">
              🤝 {ledger.name} 平帳中心
            </h3>
            <p className="text-xs text-stone-400">計價幣別：{ledger.currency}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 沖銷操作回饋訊息 */}
        {feedback && (
          <div
            className={`p-3 rounded-2xl flex items-center gap-2 text-xs font-bold transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span className="flex-1">{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-stone-400 hover:text-stone-600 cursor-pointer ml-auto text-[11px]"
            >
              ✕
            </button>
          </div>
        )}

        {/* 沖銷還款資金帳戶選擇 (真實扣款連動) */}
        {assetAccounts.length > 0 && settlement.debts.length > 0 && (
          <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-1.5">
            <label className="block text-xs font-bold text-stone-700 flex items-center gap-1.5">
              <Wallet size={14} className="text-emerald-600" />
              <span>平帳資金帳戶 (若由您還款將自此扣款；收款將入帳至此)：</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  💳 {a.name} (餘額: {a.balance != null ? a.balance.toLocaleString() : 0})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-xs font-bold text-stone-700">視覺化最佳還款清償路徑 (Min-Cash-Flow)：</h4>
          {settlement.debts.length === 0 ? (
            <div className="p-4 bg-emerald-50 rounded-2xl text-center text-xs text-emerald-800 font-bold">
              ✨ 讚啦！目前無任何未結清之欠款
            </div>
          ) : (
            settlement.debts.map((debt, i) => {
              const isMePaying = debt.fromId === currentUserId || debt.fromId?.includes(currentUserId);
              const isCurrentSettling = settlingKey === `debt_${i}_${debt.fromId}_${debt.toId}`;

              return (
                <div
                  key={i}
                  className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between gap-2.5 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-bold text-rose-700 truncate max-w-[100px] sm:max-w-[140px]" title={debt.fromName}>
                      {debt.fromName}
                    </span>
                    <ArrowRight size={13} className="text-stone-400 shrink-0" />
                    <span className="font-bold text-emerald-700 truncate max-w-[100px] sm:max-w-[140px]" title={debt.toName}>
                      {debt.toName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-black text-stone-900 tabular-nums">
                      {formatCurrency(debt.amount, ledger.currency)}
                    </span>
                    <button
                      onClick={() => handleSettle(debt, i)}
                      disabled={!!settlingKey}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-[11px] shadow-xs cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5 transition-all"
                    >
                      {isCurrentSettling ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>沖銷處理中...</span>
                        </>
                      ) : (
                        <span>{isMePaying ? '立即沖銷扣款' : '一鍵沖銷'}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
