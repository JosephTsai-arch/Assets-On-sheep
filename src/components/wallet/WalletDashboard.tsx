import React, { useState } from 'react';
import { AssetAccount, SinkingFund, Budget, Transaction, Category, Ledger } from '../../types';
import { PiggyBankMascot } from '../../utils/mascotSvgs';
import { formatCurrency, getCurrentYearMonth } from '../../utils/formatters';
import { Plus, ArrowRightLeft, Wallet, Edit3, TrendingDown, TrendingUp, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';
import { BudgetTracker } from './BudgetTracker';
import { AdvancedSinkingFundBoard } from './AdvancedSinkingFundBoard';
import { AssetCard } from './AssetCard';

export interface WalletDashboardProps {
  assetAccounts: AssetAccount[];
  sinkingFunds: SinkingFund[];
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  ledgers?: Ledger[];
  currentUserId?: string;
  onOpenTransferModal: () => void;
  onOpenAddAsset: () => void;
  onEditAsset: (asset: AssetAccount) => void;
  onOpenAddSinkingFund: () => void;
  onOpenAddSinkingFundWithType?: (type: 'expense' | 'income') => void;
  onEditSinkingFund?: (fund: SinkingFund) => void;
  onExecuteSinkingFund: (fund: SinkingFund) => Promise<void>;
  onDeleteSinkingFund: (id: string) => Promise<void>;
  onDeleteAsset: (id: string) => Promise<void>;
  onReorderAssets?: (orderedIds: string[]) => Promise<void>;
  onSetBudget: (month: string, amount: number, categoryId?: string) => Promise<any>;
  onUpdateBudget?: (budgetId: string, amount: number, categoryId?: string) => Promise<any>;
  onDeleteBudget?: (budgetId: string) => Promise<any>;
}

export const WalletDashboard: React.FC<WalletDashboardProps> = ({
  assetAccounts,
  sinkingFunds,
  budgets,
  categories,
  transactions,
  ledgers = [],
  currentUserId,
  onOpenTransferModal,
  onOpenAddAsset,
  onEditAsset,
  onOpenAddSinkingFund,
  onOpenAddSinkingFundWithType,
  onEditSinkingFund,
  onExecuteSinkingFund,
  onDeleteSinkingFund,
  onDeleteAsset,
  onReorderAssets,
  onSetBudget,
  onUpdateBudget,
  onDeleteBudget,
}) => {
  const [tab, setTab] = useState<'assets' | 'budgets' | 'sinking'>('assets');
  const currentMonth = getCurrentYearMonth();
  const currentBalance = assetAccounts.reduce((sum, a) => {
    const hasSub = a.subAccounts && a.subAccounts.length > 0;
    const effectiveBal = hasSub
      ? a.subAccounts!.reduce((s, sub) => s + (sub.balance || 0), 0)
      : (a.balance || 0);
    return sum + effectiveBal;
  }, 0);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = draggedId || e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    if (!sourceId || sourceId === targetId || !onReorderAssets) return;

    const sourceIdx = assetAccounts.findIndex((a) => a.id === sourceId);
    const targetIdx = assetAccounts.findIndex((a) => a.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const newOrder = [...assetAccounts];
    const [moved] = newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    await onReorderAssets(newOrder.map((a) => a.id));
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!onReorderAssets) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= assetAccounts.length) return;

    const newOrder = [...assetAccounts];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    await onReorderAssets(newOrder.map((a) => a.id));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 頂部吉祥物與操作橫幅 (企業級 SaaS 規範) */}
      <div className="bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2 bg-amber-50/60 rounded-2xl border border-amber-100/60 shrink-0">
            <PiggyBankMascot size={46} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 flex items-center gap-1.5">
              <span>💳 資產錢包與沉澱基金</span>
            </h1>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              各載體餘額管理、分類綁定預算與大額年繳開銷壓力均攤
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* 次要按鈕：微縮過渡與柔和陰影 */}
          <button
            onClick={onOpenTransferModal}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-white border border-gray-200/80 hover:bg-gray-50 active:scale-95 text-gray-800 font-semibold text-xs rounded-xl shadow-xs transition-all duration-200 ease-in-out hover:shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowRightLeft size={14} className="text-gray-600" />
            <span>🔄 資產間互轉</span>
          </button>

          {/* 主按鈕：依當前分頁呈現，固定收支分頁提供支出與收入雙按鈕 */}
          {tab === 'sinking' ? (
            <div className="flex items-center gap-2">
              <button
                data-tour="btn-add-fixed-expense"
                onClick={() =>
                  onOpenAddSinkingFundWithType
                    ? onOpenAddSinkingFundWithType('expense')
                    : onOpenAddSinkingFund()
                }
                className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrendingDown size={14} />
                <span>＋ 新增固定支出</span>
              </button>
              <button
                data-tour="btn-add-fixed-income"
                onClick={() =>
                  onOpenAddSinkingFundWithType
                    ? onOpenAddSinkingFundWithType('income')
                    : onOpenAddSinkingFund()
                }
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrendingUp size={14} />
                <span>＋ 新增固定收入</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAddAsset}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-gray-900 hover:bg-gray-800 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-sm transition-all duration-200 ease-in-out hover:shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>＋ 新增資產</span>
            </button>
          )}
        </div>
      </div>

      {/* 頂部分頁切換 (Tabs) */}
      <div className="flex bg-gray-100/80 p-1 rounded-2xl w-full sm:w-80 shadow-2xs">
        <button
          data-tour="tab-assets"
          onClick={() => setTab('assets')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
            tab === 'assets' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          資產列表
        </button>
        <button
          data-tour="tab-budgets"
          onClick={() => setTab('budgets')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
            tab === 'budgets' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          預算管理
        </button>
        <button
          data-tour="tab-sinking"
          onClick={() => setTab('sinking')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-150 cursor-pointer ${
            tab === 'sinking' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          固定收支排程
        </button>
      </div>

      {/* Tab 1: 資產列表區 (資產卡片統一規範，支援拖拉排序與按鈕微調) */}
      {tab === 'assets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {assetAccounts.map((asset, index) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              index={index}
              totalAssets={assetAccounts.length}
              isDragging={draggedId === asset.id}
              isOver={dragOverId === asset.id}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onMove={handleMove}
              onEditAsset={onEditAsset}
              onDeleteAsset={onDeleteAsset}
            />
          ))}
        </div>
      )}

      {/* Tab 2: 預算管理 */}
      {tab === 'budgets' && (
        <BudgetTracker
          categories={categories}
          budgets={budgets}
          transactions={transactions}
          currentMonth={currentMonth}
          currentUserId={currentUserId}
          onSetBudget={onSetBudget}
          onUpdateBudget={onUpdateBudget}
          onDeleteBudget={onDeleteBudget}
        />
      )}

      {/* Tab 3: 固定收支進階儀表板與透支雷達圖 */}
      {tab === 'sinking' && (
        <AdvancedSinkingFundBoard
          sinkingFunds={sinkingFunds}
          transactions={transactions}
          currentMonth={currentMonth}
          currentBalance={currentBalance}
          categories={categories}
          assetAccounts={assetAccounts}
          ledgers={ledgers}
          onExecuteSinkingFund={onExecuteSinkingFund}
          onDeleteSinkingFund={onDeleteSinkingFund}
          onOpenAddSinkingFund={onOpenAddSinkingFund}
          onOpenAddSinkingFundWithType={onOpenAddSinkingFundWithType}
          onEditSinkingFund={onEditSinkingFund}
        />
      )}
    </div>
  );
};

export { WalletDashboard as WalletView };
export default WalletDashboard;
