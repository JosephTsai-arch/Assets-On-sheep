import React, { useState } from 'react';
import { User, UserRole } from '../../types';
import { updateUserRole, softDeleteUser } from '../../services/adminService';
import { isSuperAdminUser } from '../../firebase/config';
import { Users, Copy, Check, Shield, Crown, UserX, Search } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';

interface MemberManagementTabProps {
  allUsers: User[];
  onReload: () => Promise<void>;
  currentUser: User;
}

export const MemberManagementTab: React.FC<MemberManagementTabProps> = ({
  allUsers,
  onReload,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleCopyUserId = async (userId: string) => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedId(userId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      setCopiedId(userId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'member' | 'admin') => {
    setLoadingId(userId);
    try {
      await updateUserRole(userId, newRole);
      await onReload();
    } finally {
      setLoadingId(null);
    }
  };

  const handleKickMember = async (userId: string) => {
    setLoadingId(userId);
    try {
      await softDeleteUser(userId);
      await onReload();
    } finally {
      setLoadingId(null);
    }
  };

  const filteredUsers = allUsers.filter((u) => {
    if (u.deletedAt) return false;
    if ((u as any).status === 'decommissioned') return false;
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5 animate-in fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
        <div>
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <Users size={18} className="text-emerald-600" />
            <span>會員權限分配與帳號管理</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            總管理員專屬通道：管理員角色授權、成員軟刪除與複製真實 user_id (嚴格維護 super_admin 隔離鐵律)
          </p>
        </div>

        {/* 搜尋過濾 */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            lang="zh-TW"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋姓名、Email、ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* 會員列表 */}
      <div className="divide-y divide-stone-100">
        {filteredUsers.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400">
            查無相符的會員資料
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isSuperAdmin = isSuperAdminUser(u) || u.role === 'super_admin';
            const isCopied = copiedId === u.id;
            const isLoading = loadingId === u.id;

            return (
              <div
                key={u.id}
                className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                {/* 使用者資訊與頭貼 */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={
                      u.avatarUrl ||
                      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
                    }
                    alt={u.name}
                    className="w-10 h-10 rounded-2xl object-cover border border-stone-100 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-stone-900 truncate max-w-[140px] sm:max-w-[200px]" title={u.name}>{u.name}</span>
                      {isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full text-[10px] font-extrabold border border-amber-200 shrink-0">
                          <Crown size={11} className="text-amber-600" />
                          <span>總管理員 (天然綁定)</span>
                        </span>
                      ) : u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-bold border border-indigo-200 shrink-0">
                          <Shield size={11} className="text-indigo-600" />
                          <span>協同管理員</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full text-[10px] font-medium shrink-0">
                          一般成員
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                      <span className="truncate max-w-[150px] sm:max-w-[240px]" title={u.email}>{u.email}</span>
                      <span>•</span>
                      <span className="font-mono text-[10px] truncate max-w-[100px] sm:max-w-none">{u.id}</span>
                    </div>
                  </div>
                </div>

                {/* 操作按鈕群組：複製ID、變更角色、踢除 */}
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                  {/* 【📋 複製 user_id】按鈕 */}
                  <button
                    onClick={() => handleCopyUserId(u.id)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      isCopied
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700'
                    }`}
                    title="點擊複製 user_id"
                  >
                    {isCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span>{isCopied ? '已複製！' : '複製 ID'}</span>
                  </button>

                  {/* 變更角色下拉選單 */}
                  {isSuperAdmin ? (
                    <span className="px-3 py-1.5 bg-stone-100 text-stone-400 rounded-xl text-xs font-bold">
                      總管固定
                    </span>
                  ) : (
                    <select
                      value={u.role || 'member'}
                      disabled={isLoading}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as 'member' | 'admin')}
                      className="px-2.5 py-1.5 border border-stone-200 rounded-xl text-xs font-bold bg-white text-stone-800 focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
                    >
                      <option value="member">一般成員 (Member)</option>
                      <option value="admin">協同管理員 (Admin)</option>
                    </select>
                  )}

                  {/* 踢除成員 (軟刪除) */}
                  {!isSuperAdmin && (
                    <InlineConfirm
                      onConfirm={() => handleKickMember(u.id)}
                      title={`確定將「${u.name}」軟刪除踢除？`}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
