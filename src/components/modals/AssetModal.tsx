import React, { useState, useEffect } from 'react';
import { AssetAccount, AssetType, SubAccount } from '../../types';
import { X, Wallet, Plus, Trash2, Lock, AlertCircle } from 'lucide-react';

interface AssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assetData: any) => Promise<any>;
  initialData?: AssetAccount | null;
}

interface SubAccountFormItem {
  id: string;
  name: string;
  balanceStr: string;
}

/**
 * 優雅數字字串清洗器：
 * 1. 允許空字串 '' (刪到最後一位時呈現乾淨 placeholder 0，絕不跳回 0 卡在最前面)
 * 2. 避免前導零問題 (例如在 0 後面輸入 5 會自動轉為 5，而非 05)
 * 3. 支援小數點與負數
 */
const sanitizeNumberInput = (raw: string): string => {
  if (raw === '' || raw === '-') return raw;
  let clean = raw.replace(/[^\d.-]/g, '');

  const isNegative = clean.startsWith('-');
  clean = clean.replace(/-/g, '');
  if (isNegative) clean = '-' + clean;

  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }

  // 自動去除無效前導零：例如 "05" -> "5", "-05" -> "-5"，但保留 "0" 與 "0.xx"
  if (/^0\d+/.test(clean)) {
    clean = clean.replace(/^0+/, '');
    if (clean === '') clean = '0';
  } else if (/^-0\d+/.test(clean)) {
    clean = '-' + clean.slice(1).replace(/^0+/, '');
    if (clean === '-') clean = '0';
  }

  return clean;
};

export const AssetModal: React.FC<AssetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('bank');
  const [balance, setBalance] = useState('0');
  const [subAccounts, setSubAccounts] = useState<SubAccountFormItem[]>([]);
  const [newSubName, setNewSubName] = useState('');
  const [newSubBal, setNewSubBal] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setType(initialData.type);
      setBalance(initialData.balance !== undefined && initialData.balance !== null ? String(initialData.balance) : '0');
      let subs = initialData.subAccounts ? [...initialData.subAccounts] : [];
      if (initialData.type === 'bank' && subs.length === 0) {
        subs = [{ id: `sub_${initialData.id}_main`, name: '母帳戶 (活期主帳戶)', balance: Number(initialData.balance) || 0 }];
      }
      setSubAccounts(
        subs.map((s) => ({
          id: s.id,
          name: s.name,
          balanceStr: String(s.balance ?? 0),
        }))
      );
    } else {
      setName('');
      setType('bank');
      setBalance('0');
      setSubAccounts([{ id: `sub_${Date.now()}_main`, name: '母帳戶 (活期主帳戶)', balanceStr: '0' }]);
    }
    setNewSubName('');
    setNewSubBal('');
    setLockedNotice(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: AssetType) => {
    setType(newType);
    if (newType === 'bank' && subAccounts.length === 0) {
      const initBal = balance !== '' && !isNaN(Number(balance)) ? balance : '0';
      setSubAccounts([{ id: `sub_${Date.now()}_main`, name: '母帳戶 (活期主帳戶)', balanceStr: initBal }]);
    }
    setLockedNotice(null);
  };

  const handleAddSub = () => {
    if (!newSubName.trim()) return;
    const addBal = newSubBal.trim() !== '' ? sanitizeNumberInput(newSubBal.trim()) : '0';
    setSubAccounts([
      ...subAccounts,
      { id: `sub_${Date.now()}`, name: newSubName.trim(), balanceStr: addBal },
    ]);
    setNewSubName('');
    setNewSubBal('');
    setLockedNotice(null);
  };

  const handleUpdateSubName = (id: string, updatedName: string) => {
    setSubAccounts(subAccounts.map((s) => (s.id === id ? { ...s, name: updatedName } : s)));
  };

  const handleUpdateSubBalance = (id: string, rawVal: string) => {
    const cleaned = sanitizeNumberInput(rawVal);
    setSubAccounts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, balanceStr: cleaned } : s))
    );
  };

  const handleSubBalanceBlur = (id: string) => {
    setSubAccounts((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const trimmed = s.balanceStr.trim();
        if (trimmed === '' || trimmed === '-' || isNaN(Number(trimmed))) {
          return { ...s, balanceStr: '0' };
        }
        return s;
      })
    );
  };

  const handleRemoveSub = (id: string) => {
    if (type === 'bank' && subAccounts.length <= 1) {
      setLockedNotice('🔒 銀行帳號至少需保留一個【母帳號】，無法刪除！若帳戶無款項，請直接將餘額修改為 0 元。');
      return;
    }
    setSubAccounts(subAccounts.filter((s) => s.id !== id));
    setLockedNotice(null);
  };

  const subAccountsTotal = subAccounts.reduce(
    (sum, s) => sum + (parseFloat(s.balanceStr) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const isBank = type === 'bank';
      let finalSubAccounts = isBank
        ? subAccounts.map((s) => ({
            id: s.id,
            name: s.name.trim(),
            balance: parseFloat(s.balanceStr) || 0,
          }))
        : [];
      if (isBank && finalSubAccounts.length === 0) {
        finalSubAccounts = [{ id: `sub_${Date.now()}_main`, name: '母帳戶 (活期主帳戶)', balance: 0 }];
      }
      const effectiveBalance = isBank
        ? finalSubAccounts.reduce((sum, s) => sum + (Number(s.balance) || 0), 0)
        : (balance === '' ? 0 : (isNaN(Number(balance)) ? 0 : Number(balance)));

      await onSave({
        name: name.trim(),
        type,
        balance: effectiveBalance,
        currency: initialData?.currency || 'TWD',
        subAccounts: finalSubAccounts,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <Wallet size={18} className="text-emerald-600" />
            <span>{initialData ? '✏️ 編輯資產/子帳戶' : '✨ 新增資產載體'}</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">資產名稱 *</label>
            <input
              type="text"
              required
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 玉山銀行主帳戶"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">載體類型 *</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold bg-white"
              >
                <option value="bank">🏦 銀行帳戶</option>
                <option value="cash">💵 現金皮夾</option>
                <option value="e_wallet">📱 電子錢包</option>
                <option value="credit_card">💳 信用卡</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">
                {type === 'bank' ? '帳戶總額 (自動加總) *' : `餘額 (${initialData?.currency || 'TWD'}) *`}
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 font-bold pointer-events-none select-none">
                  {initialData?.currency || 'TWD'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  lang="zh-TW"
                  autoCapitalize="none"
                  autoCorrect="off"
                  required
                  readOnly={type === 'bank'}
                  value={type === 'bank' ? subAccountsTotal.toLocaleString() : balance}
                  placeholder="0"
                  onFocus={(e) => {
                    if (type !== 'bank') e.target.select();
                  }}
                  onChange={(e) => {
                    if (type !== 'bank') setBalance(sanitizeNumberInput(e.target.value));
                  }}
                  onBlur={() => {
                    if (type !== 'bank' && (balance.trim() === '' || isNaN(Number(balance)))) {
                      setBalance('0');
                    }
                  }}
                  className={`w-full pl-10 pr-3 py-2 border rounded-xl text-sm font-black tabular-nums transition-all ${
                    type === 'bank'
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 cursor-not-allowed'
                      : 'bg-white border-stone-200 text-stone-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none'
                  }`}
                />
              </div>
              {type === 'bank' && (
                <p className="text-[10px] text-emerald-600 font-medium mt-1">✓ 由下方 {subAccounts.length} 個子帳戶動態加總</p>
              )}
            </div>
          </div>

          {/* 銀行帳戶下自訂/編輯子帳戶 */}
          {type === 'bank' && (
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700">管理子帳戶 (如：旅遊基金、備用金)</label>
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-semibold">最少保留一筆母帳號</span>
              </div>
              <p className="text-[10px] text-stone-500">💡 銀行載體最少需維護一個【母帳號】，總額即時自動加總，餘額可設為 0。</p>

              {lockedNotice && (
                <div className="p-2 bg-amber-100/90 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-1.5 animate-in fade-in">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="shrink-0 text-amber-700" />
                    <span>{lockedNotice}</span>
                  </div>
                  <button type="button" onClick={() => setLockedNotice(null)} className="text-amber-800 font-bold px-1 cursor-pointer">✕</button>
                </div>
              )}

              {/* 現有子帳戶清單 */}
              <div className="space-y-1.5 pt-1 max-h-44 overflow-y-auto">
                {subAccounts.map((s, idx) => {
                  const isMother = idx === 0;
                  const isOnlyOne = subAccounts.length <= 1;
                  return (
                    <div key={s.id} className="flex items-center gap-1.5 p-1.5 bg-white rounded-xl border border-stone-200 text-xs">
                      {isMother && (
                        <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-800 rounded shrink-0">👑 母帳號</span>
                      )}
                      <input
                        type="text"
                        lang="zh-TW"
                        inputMode="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        value={s.name}
                        onChange={(e) => handleUpdateSubName(s.id, e.target.value)}
                        className="flex-1 min-w-[80px] px-2 py-1 bg-stone-50 rounded-lg text-xs font-medium"
                      />
                      <div className="relative shrink-0 w-24 sm:w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-stone-400 font-bold pointer-events-none select-none">
                          NT$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          lang="zh-TW"
                          autoCapitalize="none"
                          autoCorrect="off"
                          value={s.balanceStr}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleUpdateSubBalance(s.id, e.target.value)}
                          onBlur={() => handleSubBalanceBlur(s.id)}
                          className="w-full pl-7 pr-2 py-1 bg-stone-50 hover:bg-stone-100/70 focus:bg-white rounded-lg text-xs font-black text-right tabular-nums text-stone-900 border border-transparent focus:border-emerald-500 focus:outline-none transition-all"
                        />
                      </div>
                      {isOnlyOne ? (
                        <button
                          type="button"
                          onClick={() => setLockedNotice('🔒 銀行帳號至少需保留一個【母帳號】，無法刪除！若帳戶無款項，請直接將餘額修改為 0 元。')}
                          className="p-1 text-amber-600 hover:text-amber-700 cursor-not-allowed shrink-0"
                          title="母帳號鎖死保護：至少需保留一個母帳號"
                        >
                          <Lock size={14} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveSub(s.id)}
                          className="p-1 text-stone-400 hover:text-rose-600 cursor-pointer shrink-0"
                          title="刪除此子帳戶"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 新增子帳戶輸入框 */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  lang="zh-TW"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="新增子帳戶名稱"
                  className="flex-1 px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-xs"
                />
                <div className="relative shrink-0 w-24 sm:w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-stone-400 font-bold pointer-events-none select-none">
                    NT$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    lang="zh-TW"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={newSubBal}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewSubBal(sanitizeNumberInput(e.target.value))}
                    className="w-full pl-7 pr-2 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-bold text-right tabular-nums focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddSub}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 bg-white pt-3 border-t border-stone-100 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer">
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSaving ? '儲存中...' : initialData ? '確認更新' : '確認新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
