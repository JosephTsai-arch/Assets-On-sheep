import React, { useState, useEffect } from 'react';
import { User, HealthReport } from '../../types';
import { formatCurrency, getCurrentYearMonth } from '../../utils/formatters';
import {
  fetchAllUsersAndTransactions,
  UserMonthlyRankingItem,
  BigExpenseItem,
} from '../../services/adminService';
import { createRescueCode, getSoftDeletedItemsByUser, deepRestoreLedger } from '../../services/disasterService';
import { Trophy, ShieldCheck, Key, RefreshCw, Undo2, Award, Users } from 'lucide-react';
import { MemberManagementTab } from './MemberManagementTab';
import { LargeExpenseTab } from './LargeExpenseTab';
import { Tab3_SecretAdvice } from './Tab3_SecretAdvice';
import { SystemConfigTab } from './SystemConfigTab';
import { RescueCenterTab } from './RescueCenterTab';
import { AnnouncementTab } from './AnnouncementTab';

interface AdminViewProps {
  currentUser: User;
  onViewReport: (report: HealthReport) => void;
  onAnnouncementsUpdated?: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ currentUser, onViewReport, onAnnouncementsUpdated }) => {
  const [activeTab, setActiveTab] = useState<'members' | 'announcements' | 'ranking' | 'big_expenses' | 'confidential' | 'rescue' | 'keys'>('announcements');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [loading, setLoading] = useState(true);

  // Data states
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [monthlyRankings, setMonthlyRankings] = useState<UserMonthlyRankingItem[]>([]);
  const [bigExpenses, setBigExpenses] = useState<BigExpenseItem[]>([]);
  const [sortOrder, setSortOrder] = useState<'surplus' | 'deficit'>('surplus');

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const data = await fetchAllUsersAndTransactions(selectedMonth);
      setMonthlyRankings(data.monthlyRankings);
      setBigExpenses(data.bigExpenses);
      setAllUsers(data.allUsers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [selectedMonth]);

  const sortedRankings = [...monthlyRankings].sort((a, b) => {
    return sortOrder === 'surplus' ? b.netSavings - a.netSavings : a.netSavings - b.netSavings;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 總管專屬橫幅 */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <h1 className="text-xl font-black">資產上羊・首席管理員總控台</h1>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            大象無形特權視圖・已授權至總管帳號：{currentUser.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 bg-stone-800 border border-stone-700 text-white rounded-xl text-xs font-bold"
          />
          <button
            onClick={loadAdminData}
            className="p-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl cursor-pointer"
            title="重新整理"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 7 大分頁按鈕 */}
      <div className="flex bg-stone-200/80 p-1 rounded-2xl overflow-x-auto gap-1">
        {[
          { id: 'announcements', label: '📢 全域公告管理' },
          { id: 'members', label: '👑 會員權限管理' },
          { id: 'ranking', label: '1. 月總收支排行' },
          { id: 'big_expenses', label: '2. 大額支出排行' },
          { id: 'confidential', label: '3. 機密財務報告' },
          { id: 'rescue', label: '4. 災難救援中心' },
          { id: 'keys', label: '5. 全域系統金鑰' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === t.id ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: 全域公告管理 (支援 LINE 廣播與視窗彈出、全域編輯與刪除) */}
      {activeTab === 'announcements' && (
        <AnnouncementTab
          currentUser={currentUser}
          onAnnouncementsUpdated={onAnnouncementsUpdated}
        />
      )}

      {/* Tab: 會員權限管理與軟刪除 */}
      {activeTab === 'members' && (
        <MemberManagementTab
          allUsers={allUsers}
          onReload={loadAdminData}
          currentUser={currentUser}
        />
      )}

      {/* Tab 1: 各帳號月總收支排行 */}
      {activeTab === 'ranking' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-stone-900">
              各帳號月總收支排行 ({selectedMonth})
            </h3>
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => setSortOrder('surplus')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                  sortOrder === 'surplus' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                淨結餘最高
              </button>
              <button
                onClick={() => setSortOrder('deficit')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                  sortOrder === 'deficit' ? 'bg-rose-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                淨赤字(透支)最高
              </button>
            </div>
          </div>

          <div className="divide-y divide-stone-100">
            {sortedRankings.map((r, i) => (
              <div key={r.userId} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-5 font-black text-stone-400 text-center">{i + 1}</span>
                  <img src={r.userAvatar} alt={r.userName} className="w-8 h-8 rounded-full object-cover" />
                  <div>
                    <p className="font-bold text-stone-900">{r.userName}</p>
                    <p className="text-[10px] text-stone-400">ID: {r.userId} • {r.email}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`font-black text-sm ${r.netSavings >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {r.netSavings >= 0 ? '+' : ''}{formatCurrency(r.netSavings)}
                  </p>
                  <p className="text-[10px] text-stone-400">
                    入: {formatCurrency(r.totalIncome)} / 支: {formatCurrency(r.totalExpense)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: 大額支出月排行 (多幣別基準正規化與前 3 名頒獎台 UI) */}
      {activeTab === 'big_expenses' && (
        <LargeExpenseTab bigExpenses={bigExpenses} selectedMonth={selectedMonth} />
      )}

      {/* Tab 3: 機密財務報告 (全域撈取 + 手風琴摺疊介面) */}
      {activeTab === 'confidential' && (
        <Tab3_SecretAdvice onViewReport={onViewReport} />
      )}

      {/* Tab 4: 災難救援中心 */}
      {activeTab === 'rescue' && (
        <RescueCenterTab currentUserEmail={currentUser.email} currentUserId={currentUser.id} />
      )}

      {/* Tab 5: 全域系統金鑰 SystemConfig (載入狀態與 3 秒行內成功回饋) */}
      {activeTab === 'keys' && (
        <SystemConfigTab />
      )}
    </div>
  );
};
