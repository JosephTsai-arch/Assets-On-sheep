import React from 'react';
import { ActiveTab } from '../../types';
import { Plus } from 'lucide-react';

interface BottomTabBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isSuperAdmin: boolean;
  onOpenTransactionModal: () => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  setActiveTab,
  isSuperAdmin,
  onOpenTransactionModal,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'overview', label: '總覽', icon: '🏠' },
    { id: 'transactions', label: '明細', icon: '📋' },
    { id: 'wallet', label: '錢包', icon: '💳' },
    { id: 'collaboration', label: '共管', icon: '🤝' },
    { id: 'analytics', label: '統計', icon: '📊' },
    ...(isSuperAdmin ? [{ id: 'admin' as ActiveTab, label: '管理', icon: '👑' }] : []),
  ];

  return (
    <>
      {/* Mobile Floating Action Button (FAB) */}
      <button
        data-tour="btn-record"
        data-tour-fab="btn-record-fab"
        onClick={onOpenTransactionModal}
        className="md:hidden fixed right-4 bottom-18 z-40 w-13 h-13 bg-emerald-600 hover:bg-emerald-700 active:scale-90 text-white rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-transform border-2 border-white"
        aria-label="新增記帳"
      >
        <Plus size={26} strokeWidth={3} />
      </button>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/80 py-1 px-1 flex justify-around items-center pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-lg">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-tour={`nav-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-0 max-w-[72px] flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all cursor-pointer ${
                isActive ? 'text-emerald-700 font-bold scale-105' : 'text-stone-500 font-medium hover:text-stone-700'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] mt-0.5 truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};
