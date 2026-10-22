import React, { useState, useEffect } from 'react';
import { AssetAccount, Ledger } from '../../types';
import { X, ArrowRightLeft } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetAccounts: AssetAccount[];
  ledgers: Ledger[];
  onTransfer: (params: {
    ledgerId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    title?: string;
    fromSubAccountId?: string;
    toSubAccountId?: string;
  }) => Promise<void>;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  assetAccounts,
  ledgers,
  onTransfer,
}) => {
  const [fromAccountId, setFromAccountId] = useState(assetAccounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(assetAccounts[1]?.id || assetAccounts[0]?.id || '');
  const [fromSubAccountId, setFromSubAccountId] = useState('');
  const [toSubAccountId, setToSubAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('資產互轉');
  const [ledgerId, setLedgerId] = useState(ledgers[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 當 Modal 開啟或帳戶清單更新時，主動同步確保預設有效 ID 已填入
  useEffect(() => {
    if (!isOpen) return;

    if (assetAccounts && assetAccounts.length > 0) {
      const validFrom = assetAccounts.some((a) => a.id === fromAccountId)
        ? fromAccountId
        : assetAccounts[0].id;
      setFromAccountId(validFrom);

      const secondAcc = assetAccounts.find((a) => a.id !== validFrom) || assetAccounts[0];
      const validTo = assetAccounts.some((a) => a.id === toAccountId)
        ? toAccountId
        : secondAcc.id;
      setToAccountId(validTo);

      const fromAcc = assetAccounts.find((a) => a.id === validFrom);
      if (fromAcc?.subAccounts && fromAcc.subAccounts.length > 0) {
        if (!fromSubAccountId || !fromAcc.subAccounts.some((s) => s.id === fromSubAccountId)) {
          setFromSubAccountId(fromAcc.subAccounts[0].id);
        }
      } else {
        setFromSubAccountId('');
      }

      const toAcc = assetAccounts.find((a) => a.id === validTo);
      if (toAcc?.subAccounts && toAcc.subAccounts.length > 0) {
        if (!toSubAccountId || !toAcc.subAccounts.some((s) => s.id === toSubAccountId)) {
          setToSubAccountId(toAcc.subAccounts[0].id);
        }
      } else {
        setToSubAccountId('');
      }
    }

    if (ledgers && ledgers.length > 0) {
      if (!ledgerId || !ledgers.some((l) => l.id === ledgerId)) {
        setLedgerId(ledgers[0].id);
      }
    }
  }, [isOpen, assetAccounts, ledgers]);

  if (!isOpen) return null;

  const fromAsset = assetAccounts.find((a) => a.id === fromAccountId);
  const toAsset = assetAccounts.find((a) => a.id === toAccountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('請輸入大於 0 的轉帳金額');
      return;
    }

    const effectiveFromId = fromAccountId || assetAccounts[0]?.id;
    const effectiveToId = toAccountId || assetAccounts[1]?.id || assetAccounts[0]?.id;

    if (!effectiveFromId || !effectiveToId) {
      setErrorMsg('請先建立並選擇有效的轉出與轉入帳戶');
      return;
    }

    const fromAcc = assetAccounts.find((a) => a.id === effectiveFromId);
    const toAcc = assetAccounts.find((a) => a.id === effectiveToId);

    const effectiveFromSubId = fromSubAccountId || fromAcc?.subAccounts?.[0]?.id;
    const effectiveToSubId = toSubAccountId || toAcc?.subAccounts?.[0]?.id;

    if (effectiveFromId === effectiveToId) {
      if (!effectiveFromSubId || !effectiveToSubId || effectiveFromSubId === effectiveToSubId) {
        setErrorMsg('轉出與轉入帳戶不能完全相同（若為同帳戶互轉，請指定不同的子帳戶）');
        return;
      }
    }

    const targetLedgerId = ledgerId || ledgers[0]?.id || 'ledger_default_main';

    setIsSubmitting(true);
    try {
      await onTransfer({
        ledgerId: targetLedgerId,
        fromAccountId: effectiveFromId,
        toAccountId: effectiveToId,
        amount: numAmount,
        title: title.trim() || '資產互轉',
        fromSubAccountId: effectiveFromSubId || undefined,
        toSubAccountId: effectiveToSubId || undefined,
      });
      setAmount('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '轉帳執行失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-emerald-600" />
            <span>🔄 資產間雙向轉帳</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {assetAccounts.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-500 mx-auto flex items-center justify-center text-xl">
              💳
            </div>
            <div>
              <p className="text-sm font-bold text-stone-800">尚未建立任何資產帳戶</p>
              <p className="text-xs text-stone-500 mt-1">請先在資產錢包頁面建立至少一個帳戶，即可使用雙向轉帳功能。</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer"
            >
              知道了
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs font-bold">
              {errorMsg}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">轉出帳戶 (扣款) *</label>
            <select
              value={fromAccountId}
              onChange={(e) => {
                const newId = e.target.value;
                setFromAccountId(newId);
                const target = assetAccounts.find((a) => a.id === newId);
                if (target?.subAccounts && target.subAccounts.length > 0) {
                  setFromSubAccountId(target.subAccounts[0].id);
                } else {
                  setFromSubAccountId('');
                }
              }}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {assetAccounts.map((a) => {
                const hasSub = a.subAccounts && a.subAccounts.length > 0;
                const bal = hasSub ? a.subAccounts!.reduce((s, sub) => s + (sub.balance || 0), 0) : a.balance;
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} ({hasSub ? '帳戶總額' : '餘額'}: {bal.toLocaleString()})
                  </option>
                );
              })}
            </select>
          </div>

          {fromAsset?.subAccounts && fromAsset.subAccounts.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                <span>轉出子帳戶 *</span>
                <span className="text-[10px] text-emerald-600 font-semibold">（預設首選子帳戶）</span>
              </label>
              <select
                value={fromSubAccountId || fromAsset.subAccounts[0]?.id}
                onChange={(e) => setFromSubAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white"
              >
                {fromAsset.subAccounts.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    🎯 {s.name} (餘額: {s.balance.toLocaleString()}){idx === 0 ? ' [首選預設]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">轉入帳戶 (入帳) *</label>
            <select
              value={toAccountId}
              onChange={(e) => {
                const newId = e.target.value;
                setToAccountId(newId);
                const target = assetAccounts.find((a) => a.id === newId);
                if (target?.subAccounts && target.subAccounts.length > 0) {
                  setToSubAccountId(target.subAccounts[0].id);
                } else {
                  setToSubAccountId('');
                }
              }}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {assetAccounts.map((a) => {
                const hasSub = a.subAccounts && a.subAccounts.length > 0;
                const bal = hasSub ? a.subAccounts!.reduce((s, sub) => s + (sub.balance || 0), 0) : a.balance;
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} ({hasSub ? '帳戶總額' : '餘額'}: {bal.toLocaleString()})
                  </option>
                );
              })}
            </select>
          </div>

          {toAsset?.subAccounts && toAsset.subAccounts.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                <span>轉入子帳戶 *</span>
                <span className="text-[10px] text-emerald-600 font-semibold">（預設首選子帳戶）</span>
              </label>
              <select
                value={toSubAccountId || toAsset.subAccounts[0]?.id}
                onChange={(e) => setToSubAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white"
              >
                {toAsset.subAccounts.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    🎯 {s.name} (餘額: {s.balance.toLocaleString()}){idx === 0 ? ' [首選預設]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">轉帳金額 *</label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-bold text-stone-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">紀錄帳本</label>
              <select
                value={ledgerId}
                onChange={(e) => setLedgerId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white"
              >
                {ledgers.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">轉帳備註 / 說明</label>
            <input
              type="text"
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如: 存款至旅遊基金"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium"
            />
          </div>

          <div className="sticky bottom-0 bg-white pt-3 border-t border-stone-100 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !amount}
              className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? '處理中...' : '確認轉帳'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
