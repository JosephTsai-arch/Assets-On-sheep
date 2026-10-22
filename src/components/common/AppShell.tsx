import React, { useState } from 'react';
import { User, ActiveTab } from '../../types';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import { Plus, LogOut, User as UserIcon, ShieldAlert, Clock } from 'lucide-react';

export interface AppShellProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: User | null;
  isSuperAdmin: boolean;
  onOpenTransactionModal: () => void;
  onOpenProfileModal: () => void;
  onOpenReminderModal?: () => void;
  onLogout: () => void;
  children?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  isSuperAdmin,
  onOpenTransactionModal,
  onOpenProfileModal,
  onOpenReminderModal,
  onLogout,
  children,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const tabs: { id: ActiveTab; label: string; icon: string; adminOnly?: boolean }[] = [
    { id: 'overview', label: '總覽概況', icon: '🏠' },
    { id: 'transactions', label: '記帳明細', icon: '📋' },
    { id: 'wallet', label: '資產錢包', icon: '💳' },
    { id: 'collaboration', label: '好友與AA共管', icon: '🤝' },
    { id: 'analytics', label: '統計分析', icon: '📊' },
    ...(isSuperAdmin ? [{ id: 'admin' as ActiveTab, label: '管理員專區', icon: '👑', adminOnly: true }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-800">
      {/* 頂部導覽列：毛玻璃效果 (bg-white/80 backdrop-blur-md border-b border-gray-100) 與置頂 sticky */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 lg:px-8 py-2.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* 左側：專屬 Logo 圖片與標準標題設定 */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none group"
            onClick={() => setActiveTab('overview')}
          >
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl overflow-hidden bg-amber-50/80 border border-amber-200/60 shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <AssetSheepMascot size={36} />
            </div>
            {/* 現代字體標題設定 */}
            <span className="text-xl font-bold tracking-tight text-gray-900">資產上羊</span>
          </div>

          {/* 中間：桌面導覽籤頁 */}
          <nav className="hidden md:flex items-center bg-stone-100/80 p-1 rounded-2xl border border-stone-200/70 shadow-xs">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-emerald-800 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 右側：記一筆按鈕與個人頭像選單 (已強制刪除幻覺文字「熊熊在線」) */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenTransactionModal}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Plus size={16} strokeWidth={3} />
              <span>記一筆</span>
            </button>

            {/* 使用者個人資訊下拉選單 */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-emerald-400 transition-all cursor-pointer"
              >
                <img
                  src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                  alt={currentUser?.name || 'User'}
                  className="w-9 h-9 rounded-full object-cover border-2 border-emerald-500/30"
                />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-stone-100 py-2 z-50 animate-in fade-in zoom-in-95"
                  onMouseLeave={() => setDropdownOpen(false)}
                >
                  <div className="px-4 py-2 border-b border-stone-100">
                    <p className="text-xs font-bold text-stone-900 truncate">{currentUser?.name}</p>
                    <p className="text-[10px] text-stone-400 truncate">{currentUser?.email}</p>
                    {isSuperAdmin && (
                      <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                        👑 總管理員 (Super Admin)
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenProfileModal();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-stone-700 hover:bg-stone-50 flex items-center gap-2 cursor-pointer"
                  >
                    <UserIcon size={14} />
                    <span>編輯個人暱稱與頭像</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      if (onOpenReminderModal) onOpenReminderModal();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-amber-800 hover:bg-amber-50/70 flex items-center gap-2 cursor-pointer"
                  >
                    <Clock size={14} className="text-amber-600" />
                    <span>⏰ 每日記帳提醒鬧鐘</span>
                  </button>

                  {isSuperAdmin && (
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        setActiveTab('admin');
                      }}
                      className="w-full px-4 py-2 text-left text-xs font-medium text-amber-700 hover:bg-amber-50 flex items-center gap-2 cursor-pointer"
                    >
                      <ShieldAlert size={14} />
                      <span>👑 管理員專區</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-stone-100" />

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut size={14} />
                    <span>登出帳號</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 主體內容容器 */}
      {children && (
        <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
          {children}
        </main>
      )}
    </div>
  );
};

export default AppShell;
