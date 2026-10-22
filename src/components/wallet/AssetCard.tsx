import React from 'react';
import { AssetAccount } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Wallet, Edit3, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';

export interface AssetCardProps {
  asset: AssetAccount;
  index: number;
  totalAssets: number;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onEditAsset: (asset: AssetAccount) => void;
  onDeleteAsset: (id: string) => Promise<void>;
}

export const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  index,
  totalAssets,
  isDragging,
  isOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onMove,
  onEditAsset,
  onDeleteAsset,
}) => {
  const hasSub = asset.subAccounts && asset.subAccounts.length > 0;

  return (
    <div
      draggable
      data-tour={asset.type === 'cash' || asset.name.includes('現金') || index === 0 ? 'asset-cash-card' : undefined}
      onDragStart={(e) => onDragStart(e, asset.id)}
      onDragOver={(e) => onDragOver(e, asset.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, asset.id)}
      className={`bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border rounded-2xl p-6 flex flex-col justify-between transition-all duration-200 ${
        isDragging ? 'opacity-40 scale-[0.98] border-dashed border-emerald-400' : ''
      } ${isOver ? 'border-2 border-emerald-500 shadow-lg ring-2 ring-emerald-100' : 'border-gray-100/50'}`}
    >
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div
              className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 p-0.5 rounded transition-colors shrink-0"
              title="長按並拖拉排序資產"
            >
              <GripVertical size={16} />
            </div>
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5 min-w-0">
              <Wallet size={16} className="text-emerald-600 shrink-0" />
              <span className="truncate" title={asset.name}>{asset.name}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 上移 / 下移微調按鈕 */}
            <div className="flex items-center bg-gray-50 border border-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMove(index, 'up')}
                className="p-1 text-gray-400 hover:text-gray-800 disabled:opacity-25 disabled:cursor-not-allowed rounded transition-colors"
                title="上移此資產順序"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                disabled={index === totalAssets - 1}
                onClick={() => onMove(index, 'down')}
                className="p-1 text-gray-400 hover:text-gray-800 disabled:opacity-25 disabled:cursor-not-allowed rounded transition-colors"
                title="下移此資產順序"
              >
                <ChevronDown size={12} />
              </button>
            </div>

            <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md">
              {asset.type === 'e_wallet'
                ? '電子錢包'
                : asset.type === 'cash'
                ? '現金'
                : asset.type === 'bank'
                ? '銀行'
                : '信用卡'}
            </span>
            <button
              onClick={() => onEditAsset(asset)}
              className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              title="編輯資產/子帳戶"
            >
              <Edit3 size={14} />
            </button>
            <InlineConfirm
              onConfirm={() => onDeleteAsset(asset.id)}
              title={`確定軟刪除「${asset.name}」？`}
            />
          </div>
        </div>

        <div className="my-3">
          <div className="text-[11px] font-bold text-gray-500 mb-0.5 flex items-center justify-between">
            <span>{hasSub ? '帳戶總額 (自動加總子帳戶)' : '帳戶餘額'}</span>
            {hasSub && (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-semibold">
                已自動加總 {asset.subAccounts!.length} 個子帳戶
              </span>
            )}
          </div>
          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums break-words block">
            {formatCurrency(
              hasSub
                ? asset.subAccounts!.reduce((sum, s) => sum + (s.balance || 0), 0)
                : asset.balance,
              asset.currency
            )}
          </span>
        </div>

        {/* 銀行巢狀子帳戶清單 */}
        {hasSub && (
          <div className="mt-4 pt-3.5 border-t border-gray-100 space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500">
              <span>所屬指定子帳戶：</span>
              <button
                onClick={() => onEditAsset(asset)}
                className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Edit3 size={12} />
                <span>編輯子帳戶</span>
              </button>
            </div>
            {asset.subAccounts!.map((sub, sIdx) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-2.5 bg-gray-50/70 border border-gray-100/70 rounded-xl text-xs gap-2"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {asset.type === 'bank' && sIdx === 0 && (
                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-800 rounded shrink-0">
                      👑 母帳號
                    </span>
                  )}
                  <span className="font-medium text-gray-700 truncate" title={sub.name}>{sub.name}</span>
                </div>
                <span className="font-bold text-gray-900 tabular-nums shrink-0">
                  {formatCurrency(sub.balance, asset.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
