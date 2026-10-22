import React from 'react';
import { AssetSheepMascot } from '../../utils/mascotSvgs';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = '目前尚無資料',
  description = '點擊按鈕或記錄新項目，讓小羊幫你管好每一筆資產！',
  actionText,
  onAction,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 rounded-2xl border-dashed border-2 border-gray-200 my-4">
      <div className="mb-4 opacity-90 transform hover:scale-105 transition-transform duration-200">
        {icon ? icon : <AssetSheepMascot size={88} />}
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 font-medium max-w-sm mb-5 leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-sm transition-all duration-200 ease-in-out hover:shadow-md flex items-center gap-2 cursor-pointer"
        >
          <span>＋</span>
          <span>{actionText}</span>
        </button>
      )}
    </div>
  );
};
