import React, { useState } from 'react';
import { Transaction, Ledger, AssetAccount, Category } from '../../types';
import { formatCurrency, getCurrentYearMonth } from '../../utils/formatters';
import { Search, Edit3, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';
import { EmptyState } from '../common/EmptyState';

interface TransactionListViewProps {
  currentUserId?: string;
  transactions: Transaction[];
  ledgers: Ledger[];
  assetAccounts: AssetAccount[];
  categories: Category[];
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => Promise<void>;
  onOpenAddModal: () => void;
}

export const TransactionListView: React.FC<TransactionListViewProps> = ({
  currentUserId,
  transactions,
  ledgers,
  assetAccounts,
  categories,
  onEditTransaction,
  onDeleteTransaction,
  onOpenAddModal,
}) => {
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'expense' | 'income' | 'transfer'>('ALL');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Filter Transactions
  const filtered = transactions.filter((t) => {
    if (t.deletedAt) return false;
    if (selectedLedgerId !== 'ALL' && t.ledgerId !== selectedLedgerId) return false;
    if (selectedMonth && !t.date.startsWith(selectedMonth)) return false;
    if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchCat = t.categoryName.toLowerCase().includes(q);
      const matchNote = t.note?.toLowerCase().includes(q);
      if (!matchTitle && !matchCat && !matchNote) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* 吸頂過濾列 (Sticky Filter Bar) */}
      <div className="sticky top-[60px] z-30 bg-[#FAF7F2]/95 backdrop-blur-md py-3 px-4 rounded-3xl border border-amber-900/10 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* (左側) 專屬帳本下拉選單 (全部融合/各私帳/各共管) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-600">帳本：</span>
          <select
            value={selectedLedgerId}
            onChange={(e) => setSelectedLedgerId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 shadow-2xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="ALL">🌐 全部帳本融合</option>
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.isShared ? '🤝' : '🔒'} {l.name} ({l.currency})
              </option>
            ))}
          </select>
        </div>

        {/* (右側) 月份/年份選擇器 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-600">月份：</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 shadow-2xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* 次級篩選區： 搜尋框與 Type (收/支/轉) 藥丸標籤 */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
          <input
            type="text"
            lang="zh-TW"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋名稱、類別或備註..."
            className="w-full pl-8 pr-3 py-1.5 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: '全部' },
            { id: 'expense', label: '支出' },
            { id: 'income', label: '收入' },
            { id: 'transfer', label: '轉帳' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTypeFilter(item.id as any)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                typeFilter === item.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 明細列表 (List) */}
      {filtered.length === 0 ? (
        <EmptyState
          title="此條件下無交易紀錄"
          description="換個篩選月份或帳本，或點擊下方按鈕新增一筆紀錄！"
          actionText="新增記帳"
          onAction={onOpenAddModal}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((tx) => {
            const ledger = ledgers.find((l) => l.id === tx.ledgerId);
            const asset = assetAccounts.find((a) => a.id === tx.accountId);
            const isIncome = tx.type === 'income';
            const isTransfer = tx.type === 'transfer';
            const isExpanded = expandedTxId === tx.id;

            return (
              <div
                key={tx.id}
                className="bg-white rounded-2xl border border-stone-200 shadow-xs hover:border-emerald-300 transition-all overflow-hidden"
              >
                {/* Main Row */}
                <div
                  onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  {/* 左側類別 Icon */}
                  {(() => {
                    const matchedCat = categories.find((c) => c.id === tx.categoryId || c.name === tx.categoryName);
                    const categoryIcon = tx.categoryIcon || matchedCat?.icon || (isTransfer ? '🔄' : isIncome ? '💰' : '🏷️');
                    return (
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0 ${
                            isTransfer
                              ? 'bg-blue-50 text-blue-600'
                              : isIncome
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          {categoryIcon}
                        </div>

                        {/* 中間上標題，中間下分類、帳戶與帳本標籤 */}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-stone-900 truncate" title={tx.title}>
                            {tx.title}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-1 flex-wrap">
                            <span className="font-semibold text-stone-700 shrink-0">{tx.date}</span>
                            <span className="shrink-0">•</span>
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 font-bold rounded truncate max-w-[110px]" title={tx.categoryName}>
                              {tx.categoryName}
                            </span>
                            <span className="shrink-0">•</span>
                            <span className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-600 truncate max-w-[110px]" title={ledger?.name}>
                              {ledger?.name || '日常帳本'}
                            </span>
                            {asset && (() => {
                              const subAcc = tx.subAccountId && asset.subAccounts ? asset.subAccounts.find((s) => s.id === tx.subAccountId) : null;
                              const label = subAcc ? `${asset.name} • ${subAcc.name}` : asset.name;
                              return (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded truncate max-w-[140px]" title={label}>
                                  {label}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 右側上金額，右側下付款人與分帳狀態 */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-right max-w-[45%] sm:max-w-[50%]">
                    <div className="min-w-0 flex-1">
                      {(() => {
                        const isSettlement = tx.categoryId === 'cat_settlement' || tx.title.includes('AA平帳');
                        const isPayer = tx.payerMemberId === currentUserId || tx.payerId === currentUserId || tx.userId === currentUserId;
                        let sign = isIncome ? '+' : '-';
                        let color = isIncome ? 'text-emerald-600' : 'text-stone-900';
                        let displayAmount = tx.amount;
                        let splitBadge = '';

                        if (isSettlement) {
                          if (!isPayer) {
                            sign = '+';
                            color = 'text-emerald-600';
                          } else {
                            sign = '-';
                            color = 'text-rose-600';
                          }
                        } else if (isTransfer) {
                          sign = tx.amount >= 0 ? '+' : '-';
                          color = 'text-blue-600';
                        } else if (tx.splitDetails && tx.splitDetails.length > 0) {
                          const mySplit = tx.splitDetails.find(
                            (s) =>
                              s.memberId === currentUserId ||
                              (currentUserId && (s.memberId?.includes(currentUserId) || currentUserId.includes(s.memberId)))
                          );
                          if (mySplit) {
                            displayAmount = mySplit.amount;
                            if (isPayer) {
                              splitBadge = `我先代墊 (份額 ${formatCurrency(mySplit.amount, tx.currency)})`;
                            } else {
                              splitBadge = `AA分攤 (由 ${tx.payerName || '成員'} 代墊)`;
                            }
                          } else {
                            displayAmount = 0;
                            sign = '';
                            color = 'text-stone-400';
                            splitBadge = `未參與分帳 (總額 ${formatCurrency(tx.amount, tx.currency)})`;
                          }
                        }

                        return (
                          <div className="min-w-0">
                            <p className={`text-sm sm:text-base font-black truncate ${color}`} title={`${sign}${formatCurrency(displayAmount, tx.currency)}`}>
                              {sign}{formatCurrency(displayAmount, tx.currency)}
                            </p>
                            {splitBadge && (
                              <p className="text-[10px] font-bold text-amber-700 truncate max-w-full mt-0.5 ml-auto" title={splitBadge}>
                                {splitBadge}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-[10px] text-stone-400 font-medium truncate max-w-full ml-auto">
                        付款：{tx.payerName || '本人'}
                      </p>
                    </div>

                    <span className="text-stone-400">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </div>
                </div>

                {/* 點擊 Row 展開明細詳情，行內右側提供 ✏️ 編輯 與 🗑️ 刪除圖示 */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-stone-100 bg-stone-50/60 text-xs text-stone-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="space-y-1">
                      <p><span className="font-bold text-stone-700">分類：</span>{tx.categoryName}</p>
                      {tx.note && <p className="break-words"><span className="font-bold text-stone-700">備註：</span>{tx.note}</p>}
                      {tx.splitDetails && tx.splitDetails.length > 0 && (
                        <p className="text-[11px] text-amber-800 font-medium break-words">
                          👥 AA 平分成員：{tx.splitDetails.map((s) => `${s.memberName} (${formatCurrency(s.amount, tx.currency)})`).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditTransaction(tx); }}
                        className="px-2.5 py-1.5 bg-white border border-stone-200 text-stone-700 rounded-xl hover:bg-stone-100 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Edit3 size={13} />
                        <span>編輯</span>
                      </button>
                      <InlineConfirm
                        onConfirm={() => onDeleteTransaction(tx.id)}
                        title="確認軟刪除此明細並回滾資產？"
                        confirmText="確認軟刪除"
                        triggerButton={
                          <button
                            type="button"
                            title="軟刪除此明細"
                            className="px-2.5 py-1.5 bg-white border border-stone-200 text-stone-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Trash2 size={13} />
                            <span>刪除</span>
                          </button>
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
