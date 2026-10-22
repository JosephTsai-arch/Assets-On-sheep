import React, { useState } from 'react';
import { User, ActiveTab } from '../../types';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import { Plus, LogOut, User as UserIcon, ShieldAlert, Tag, Bell, Compass, Clock } from 'lucide-react';

export interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  currentUser: User | null;
  isSuperAdmin: boolean;
  unreadAnnouncementsCount?: number;
  onOpenAnnouncementModal?: () => void;
  onOpenTourHub?: () => void;
  onOpenReminderModal?: () => void;
  onOpenTransactionModal: () => void;
  onOpenCategoryModal: () => void;
  onOpenProfileModal: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  isSuperAdmin,
  unreadAnnouncementsCount = 0,
  onOpenAnnouncementModal,
  onOpenTourHub,
  onOpenReminderModal,
  onOpenTransactionModal,
  onOpenCategoryModal,
  onOpenProfileModal,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const tabs: { id: ActiveTab; shortLabel: string; fullLabel: string; icon: string; adminOnly?: boolean }[] = [
    { id: 'overview', shortLabel: '總覽', fullLabel: '總覽概況', icon: '🏠' },
    { id: 'transactions', shortLabel: '明細', fullLabel: '記帳明細', icon: '📋' },
    { id: 'wallet', shortLabel: '錢包', fullLabel: '資產錢包', icon: '💳' },
    { id: 'collaboration', shortLabel: '共管', fullLabel: '好友與AA共管', icon: '🤝' },
    { id: 'analytics', shortLabel: '統計', fullLabel: '統計分析', icon: '📊' },
    ...(isSuperAdmin ? [{ id: 'admin' as ActiveTab, shortLabel: '管理', fullLabel: '管理員專區', icon: '👑', adminOnly: true }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-stone-200/60 px-3 sm:px-4 lg:px-8 py-2 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Logo & Title (精巧防擠壓) */}
        <div
          className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none group shrink-0"
          onClick={() => setActiveTab('overview')}
        >
          <div className="relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl overflow-hidden bg-amber-50/80 border border-amber-200/60 shadow-xs group-hover:scale-105 transition-transform shrink-0">
            <AssetSheepMascot size={30} />
          </div>
          <span className="text-base sm:text-xl font-black tracking-tight text-gray-900 shrink-0">資產上羊</span>
        </div>

        {/* Center: Desktop/Tablet Navigation Tabs (響應式防碰撞長度與平滑捲動) */}
        <nav className="hidden md:flex items-center bg-stone-100/80 p-1 rounded-2xl border border-stone-200/70 shadow-xs shrink min-w-0 max-w-fit overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour={`nav-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 xl:gap-1.5 px-2.5 lg:px-3 xl:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <span className="text-sm shrink-0">{tab.icon}</span>
                <span className="hidden xl:inline">{tab.fullLabel}</span>
                <span className="xl:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Tour, Announcements, Category, Quick Record & User Profile (響應式防擠壓排版) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* 顯眼新手導覽按鈕 (手機版保留精巧圖標、平板與桌機顯文字) */}
          <button
            data-tour="btn-tour-launch"
            onClick={onOpenTourHub}
            className="w-8.5 h-8.5 sm:w-auto sm:h-9 px-0 sm:px-2.5 lg:px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer border border-amber-400/80 flex items-center justify-center gap-1.5 shrink-0"
            title="新手操作導覽學院"
            aria-label="新手操作導覽學院"
          >
            <Compass size={16} className="shrink-0 text-amber-100" />
            <span className="hidden sm:inline lg:hidden font-bold">導覽</span>
            <span className="hidden lg:inline font-bold">新手導覽</span>
          </button>

          {/* 公告按鈕 (若該帳號有未讀訊息則按鈕有醒目標籤提示樣態) */}
          <button
            onClick={onOpenAnnouncementModal}
            className={`relative w-8.5 h-8.5 sm:w-auto sm:h-9 px-0 sm:px-2.5 lg:px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-1.5 shrink-0 ${
              unreadAnnouncementsCount > 0
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-400/30'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
            }`}
            title={unreadAnnouncementsCount > 0 ? `有 ${unreadAnnouncementsCount} 則未讀公告` : '查看全域公告'}
            aria-label="查看全域公告"
          >
            <div className="relative flex items-center justify-center">
              <Bell
                size={16}
                className={unreadAnnouncementsCount > 0 ? 'text-amber-600 animate-bounce' : 'text-stone-500'}
              />
              {unreadAnnouncementsCount > 0 && (
                <span className="absolute -top-2 -right-2.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-xs animate-pulse">
                  {unreadAnnouncementsCount > 99 ? '99+' : unreadAnnouncementsCount}
                </span>
              )}
            </div>
            <span className="hidden lg:inline">公告</span>
          </button>

          {/* 收支類別設定按鈕 (手機/平板收納至個人選單，大螢幕展開防擠壓) */}
          <button
            onClick={onOpenCategoryModal}
            className="hidden lg:flex h-8.5 sm:h-9 px-2 sm:px-2.5 lg:px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs rounded-xl border border-emerald-200 transition-all cursor-pointer shadow-xs active:scale-95 items-center justify-center gap-1.5 shrink-0"
            title="收支類別設定"
            aria-label="收支類別設定"
          >
            <Tag size={15} className="text-emerald-600 shrink-0" />
            <span className="hidden xl:inline">收支類別設定</span>
            <span className="hidden lg:inline xl:hidden">類別</span>
          </button>

          {/* 記一筆快速按鈕 (手機版保留底部 thumb-friendly FAB，平板與桌機顯示頂部按鈕，避免手機頂部過擠) */}
          <button
            data-tour="btn-record"
            onClick={onOpenTransactionModal}
            className="hidden sm:flex h-8.5 sm:h-9 px-2.5 sm:px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer items-center justify-center gap-1.5 shrink-0"
            title="新增一筆記帳"
            aria-label="新增一筆記帳"
          >
            <Plus size={16} strokeWidth={2.5} className="shrink-0" />
            <span>記一筆</span>
          </button>

          {/* User Avatar with Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center p-0.5 rounded-full hover:ring-2 hover:ring-emerald-400 transition-all cursor-pointer"
              title={currentUser?.name || '個人帳號選單'}
              aria-label="個人帳號選單"
            >
              <img
                src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                alt={currentUser?.name || 'User'}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-emerald-500/30"
              />
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-stone-100 py-2 z-50 animate-in fade-in zoom-in-95"
                onMouseLeave={() => setDropdownOpen(false)}
              >
                <div className="px-4 py-2 border-b border-stone-100">
                  <p className="text-xs font-bold text-stone-900 truncate">{currentUser?.name}</p>
                  <p className="text-[10px] text-stone-400 truncate">{currentUser?.email}</p>
                  {currentUser?.lineUserId && (
                    <span className="block mt-0.5 text-[9px] font-mono text-emerald-700 font-bold truncate max-w-full" title={currentUser.lineUserId}>
                      LINE: {currentUser.lineUserId}
                    </span>
                  )}
                  {isSuperAdmin && (
                    <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                      👑 總管理員 (Super Admin)
                    </span>
                  )}
                </div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenTransactionModal();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={14} className="text-emerald-600" />
                  <span>➕ 新增一筆記帳</span>
                </button>

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

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenTourHub) onOpenTourHub();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-bold text-amber-800 hover:bg-amber-50/70 flex items-center gap-2 cursor-pointer"
                >
                  <Compass size={14} className="text-amber-600" />
                  <span>🎓 新手操作導覽學院</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenCategoryModal();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-emerald-800 hover:bg-emerald-50/70 flex items-center gap-2 cursor-pointer"
                >
                  <Tag size={14} className="text-emerald-600" />
                  <span>🏷️ 收支類別設定</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenAnnouncementModal) onOpenAnnouncementModal();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-stone-700 hover:bg-stone-50 flex items-center gap-2 cursor-pointer"
                >
                  <Bell size={14} className="text-amber-600" />
                  <span>📢 查看全域公告 {unreadAnnouncementsCount > 0 ? `(${unreadAnnouncementsCount}則未讀)` : ''}</span>
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
  );
};
