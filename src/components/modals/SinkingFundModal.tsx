import React, { useState, useEffect } from 'react';
import { SinkingCycle, SinkingFund, SinkingType, Category, AssetAccount, Ledger } from '../../types';
import { X, Calendar, TrendingDown, TrendingUp, Wallet, Tag, BookOpen } from 'lucide-react';
import { getCurrentYearMonth } from '../../utils/formatters';

interface SinkingFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fundData: any) => Promise<any>;
  initialData?: SinkingFund | null;
  defaultType?: 'expense' | 'income';
  categories?: Category[];
  assetAccounts?: AssetAccount[];
  ledgers?: Ledger[];
}

export const SinkingFundModal: React.FC<SinkingFundModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultType = 'expense',
  categories = [],
  assetAccounts = [],
  ledgers = [],
}) => {
  const [type, setType] = useState<SinkingType>('expense');
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [accumulatedAmount, setAccumulatedAmount] = useState('0');
  const [nextDueDate, setNextDueDate] = useState(getCurrentYearMonth());
  const [cycle, setCycle] = useState<SinkingCycle>('yearly');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [targetLedgerId, setTargetLedgerId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 尋找日常私帳作為預設
  const dailyLedger = ledgers.find((l) => !l.isShared && !l.deletedAt) || ledgers[0];

  useEffect(() => {
    if (initialData) {
      setType(initialData.type === 'income' ? 'income' : 'expense');
      setTitle(initialData.title);
      setTargetAmount(String(initialData.targetAmount));
      setAccumulatedAmount(String(initialData.accumulatedAmount || 0));
      setNextDueDate(initialData.nextDueDate);
      setCycle(initialData.cycle);
      setTargetAccountId(initialData.targetAccountId || '');
      setCategoryId(initialData.categoryId || '');
      setTargetLedgerId(initialData.targetLedgerId || dailyLedger?.id || '');
    } else {
      setType(defaultType);
      setTitle('');
      setTargetAmount('');
      setAccumulatedAmount('0');
      setNextDueDate(getCurrentYearMonth());
      setCycle(defaultType === 'income' ? 'monthly' : 'yearly');
      setTargetAccountId('');
      setCategoryId('');
      setTargetLedgerId(dailyLedger?.id || '');
    }
  }, [initialData, defaultType, isOpen, dailyLedger?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetAmount) return;

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        targetAmount: Number(targetAmount) || 0,
        accumulatedAmount: type === 'expense' ? Number(accumulatedAmount) || 0 : 0,
        nextDueDate,
        cycle,
        type,
        targetAccountId: targetAccountId || '',
        categoryId: categoryId || '',
        targetLedgerId: targetLedgerId || dailyLedger?.id || '',
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isIncome = type === 'income';
  const filteredCategories = categories.filter((c) => !c.deletedAt && c.type === type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <Calendar size={18} className={isIncome ? 'text-emerald-600' : 'text-amber-600'} />
            <span>
              {initialData
                ? `✏️ 編輯固定${isIncome ? '收入' : '支出'}排程`
                : isIncome
                ? '✨ 新增固定收入排程'
                : '✨ 新增固定支出排程'}
            </span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* 收支型態切換分頁 */}
          <div className="flex bg-stone-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setType('expense');
                if (!initialData && cycle === 'monthly') setCycle('yearly');
                setCategoryId('');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                type === 'expense'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <TrendingDown size={14} className={type === 'expense' ? 'text-amber-600' : 'text-stone-400'} />
              <span>💸 固定支出 (定期扣款)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType('income');
                if (!initialData && cycle === 'yearly') setCycle('monthly');
                setCategoryId('');
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                type === 'income'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <TrendingUp size={14} className={type === 'income' ? 'text-emerald-600' : 'text-stone-400'} />
              <span>💰 固定收入 (定期進帳)</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">
              {isIncome ? '固定收入名稱 *' : '固定支出名稱 *'}
            </label>
            <input
              type="text"
              required
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isIncome ? '例如: 每月薪資入帳、房租進帳、季度獎金、定期配息' : '例如: 房屋租金、機車強制險、健身房月費、出國旅遊準備'}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className={isIncome ? 'grid grid-cols-1' : 'grid-cols-2 grid gap-3'}>
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">
                {isIncome ? '每期入帳金額 (TWD) *' : '每期目標/扣款金額 (TWD) *'}
              </label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                required
                min="1"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder={isIncome ? '例如: 65000' : '例如: 15000'}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-bold text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            {!isIncome && (
              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">已預存儲備 (TWD)</label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  min="0"
                  value={accumulatedAmount}
                  onChange={(e) => setAccumulatedAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-bold text-stone-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">
                {isIncome ? '下次預計入帳 *' : '下次執行年月 *'}
              </label>
              <input
                type="month"
                required
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">循環週期 *</label>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as SinkingCycle)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="monthly">每月固定 (Monthly)</option>
                <option value="quarterly">每季固定 (Quarterly - 3個月)</option>
                <option value="semi_annually">半年一次 (Semi-annually - 6個月)</option>
                <option value="yearly">每年固定 (Yearly - 12個月)</option>
              </select>
            </div>
          </div>

          {/* 預設記帳帳本 (依需求預設為日常私帳) */}
          <div className="pt-1 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <BookOpen size={12} className="text-stone-400" />
                <span>執行入帳/扣款之預設帳本 *</span>
              </span>
              <span className="text-[10px] text-emerald-700 font-medium">預設為日常私帳</span>
            </label>
            <select
              value={targetLedgerId}
              onChange={(e) => setTargetLedgerId(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              {ledgers
                .filter((l) => !l.deletedAt)
                .map((ledger) => (
                  <option key={ledger.id} value={ledger.id}>
                    {ledger.name} {!ledger.isShared ? '(日常私帳 - 預設)' : '(共管公帳)'}
                  </option>
                ))}
            </select>
          </div>

          {/* 關聯帳戶與分類 (選填，執行入帳/扣款時自動連動) */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-stone-100">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center gap-1">
                <Wallet size={12} className="text-stone-400" />
                <span>{isIncome ? '入帳資產帳戶' : '扣款資產帳戶'}</span>
              </label>
              <select
                value={targetAccountId}
                onChange={(e) => setTargetAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">不指定帳戶</option>
                {assetAccounts
                  .filter((a) => !a.deletedAt)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center gap-1">
                <Tag size={12} className="text-stone-400" />
                <span>收支分類</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="">預設系統分類</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon || '🏷️'} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim() || !targetAmount}
              className={`flex-2 py-2.5 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50 cursor-pointer transition-colors ${
                isIncome
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isSaving
                ? '儲存中...'
                : initialData
                ? '儲存修改'
                : isIncome
                ? '確認新增固定收入'
                : '確認新增固定支出'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
