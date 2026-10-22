import React, { useState } from 'react';
import { User } from '../../types';
import { X, Check, Link2, RefreshCw, Unlink, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSave: (name: string, avatarUrl: string) => Promise<void>;
  onOpenMergeModal?: (summary: any) => void;
  onReloadUser?: () => Promise<void>;
}

const PRESET_AVATARS = [
  // 羊咩咩系列
  {
    name: '綿羊一號',
    url: 'https://images.unsplash.com/photo-1484557052118-f32bd25b45b5?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: '草原小羊',
    url: 'https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=150&auto=format&fit=crop&q=80',
  },
  {
    name: '捲毛羊羊',
    url: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=150&auto=format&fit=crop&q=80',
  },
  // 機器人系列
  {
    name: '智慧管家',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=AssetSheep1',
  },
  {
    name: '算盤機器人',
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=AssetSheep2',
  },
  // 親和人物系列
  {
    name: '紳士理財家',
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  },
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSave,
  onOpenMergeModal,
  onReloadUser,
}) => {
  const [name, setName] = useState(currentUser?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || PRESET_AVATARS[0].url);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingLine, setIsSyncingLine] = useState(false);
  const [isLinkingLine, setIsLinkingLine] = useState(false);
  const [lineMessage, setLineMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  // 1. 同步 LINE 官方最新大頭貼與暱稱
  const handleSyncLineProfile = async () => {
    if (!currentUser?.lineUserId) return;
    setIsSyncingLine(true);
    setLineMessage(null);

    try {
      const res = await fetch(`/api/line/profile/${currentUser.lineUserId}`);
      const data = await res.json();

      if (data.success && data.profile) {
        if (data.profile.displayName) setName(data.profile.displayName);
        if (data.profile.pictureUrl) setAvatarUrl(data.profile.pictureUrl);
        setLineMessage({
          type: 'success',
          text: `🎉 已成功從 LINE 官方擷取最新資料：暱稱「${data.profile.displayName}」！`,
        });
      } else {
        setLineMessage({
          type: 'error',
          text: data.error || '無法自 LINE 擷取大頭貼，請確認 Channel Access Token 是否有效。',
        });
      }
    } catch (e: any) {
      setLineMessage({ type: 'error', text: `同步失敗: ${e?.message || '網路異常'}` });
    } finally {
      setIsSyncingLine(false);
    }
  };

  // 2. 帳號鉤稽：綁定 LINE 帳號
  const handleLinkLineAccount = async () => {
    if (!currentUser) return;
    const inputLineId = prompt('【LINE 帳號鉤稽綁定】請輸入欲綁定的 LINE User ID (例如 U12345678...)：');
    if (!inputLineId || !inputLineId.trim()) return;

    setIsLinkingLine(true);
    setLineMessage(null);

    try {
      const res = await fetch('/api/auth/line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: inputLineId.trim(),
          currentUserId: currentUser.id,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '綁定失敗');
      }

      // 若兩端帳號皆有歷史交易，觸發三選一原子融合彈窗
      if (data.needMerge && data.mergeSummary) {
        onClose();
        if (onOpenMergeModal) {
          onOpenMergeModal(data.mergeSummary);
        }
        return;
      }

      // 若直接關聯成功
      setLineMessage({ type: 'success', text: '✅ LINE 帳號鉤稽成功！未來在 LINE 的記帳將即時同步至本帳戶。' });
      if (onReloadUser) await onReloadUser();
    } catch (e: any) {
      setLineMessage({ type: 'error', text: `綁定失敗: ${e?.message || '網路異常'}` });
    } finally {
      setIsLinkingLine(false);
    }
  };

  // 3. 解除 LINE 綁定
  const handleUnlinkLineAccount = async () => {
    if (!currentUser || !currentUser.lineUserId) return;
    if (!confirm('確定要解除與 LINE 帳號的連結嗎？解除後 LINE 機器人記帳將不再自動同步至本帳號。')) return;

    try {
      await updateDoc(doc(db, 'users', currentUser.id), {
        lineUserId: null,
        updatedAt: new Date().toISOString(),
      });
      setLineMessage({ type: 'success', text: '已解除 LINE 帳號連結。' });
      if (onReloadUser) await onReloadUser();
    } catch (e: any) {
      setLineMessage({ type: 'error', text: `解除失敗: ${e?.message}` });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave(name.trim(), avatarUrl);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-stone-900">🐑 個人資料與 LINE 帳號鉤稽</h2>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* 🌟 核心增強：LINE 官方帳號鉤稽與同步面板 🌟 */}
          <div className="p-4 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 rounded-2xl border border-emerald-200/90 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                <Link2 size={15} className="text-emerald-600" />
                <span>LINE 官方帳號串接與鉤稽狀態</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  currentUser?.lineUserId
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {currentUser?.lineUserId ? '🟢 已鉤稽綁定' : '⚪ 尚未綁定'}
              </span>
            </div>

            {currentUser?.lineUserId ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-700 bg-white/80 p-2.5 rounded-xl border border-emerald-100 gap-2">
                  <span className="font-medium text-stone-500 text-[11px] shrink-0">LINE User ID：</span>
                  <span className="font-mono font-bold text-xs truncate min-w-0 flex-1 text-right" title={currentUser.lineUserId}>{currentUser.lineUserId}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSyncLineProfile}
                    disabled={isSyncingLine}
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 min-w-0"
                  >
                    <RefreshCw size={12} className={`shrink-0 ${isSyncingLine ? 'animate-spin' : ''}`} />
                    <span className="truncate">{isSyncingLine ? '同步中...' : '同步 LINE 最新頭貼與名稱'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUnlinkLineAccount}
                    className="py-1.5 px-2.5 bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                    title="解除 LINE 綁定"
                  >
                    <Unlink size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  綁定 LINE 後，您在 LINE 官方機器人發送的記帳指令將自動歸入本帳號，並支援多裝置無縫同步！
                </p>
                <button
                  type="button"
                  onClick={handleLinkLineAccount}
                  disabled={isLinkingLine}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  <span>{isLinkingLine ? '驗證鉤稽中...' : '🔗 立即鉤稽綁定 LINE 帳號'}</span>
                </button>
              </div>
            )}

            {lineMessage && (
              <div
                className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 ${
                  lineMessage.type === 'success'
                    ? 'bg-emerald-100/80 text-emerald-900 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {lineMessage.type === 'success' ? (
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle size={14} className="text-rose-600 shrink-0" />
                )}
                <span className="break-words min-w-0 flex-1">{lineMessage.text}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">顯示暱稱 *</label>
            <input
              type="text"
              required
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：羊羊管家"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 mb-2">精選頭貼選擇 (羊咩咩 / 機器人系列)</label>
            <div className="grid grid-cols-3 gap-2.5">
              {PRESET_AVATARS.map((av, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(av.url)}
                  className={`relative p-1.5 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    avatarUrl === av.url ? 'border-emerald-600 bg-emerald-50/50 scale-102' : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <img src={av.url} alt={av.name} className="w-12 h-12 rounded-full object-cover" />
                  <span className="text-[10px] font-semibold text-stone-600">{av.name}</span>
                  {avatarUrl === av.url && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-600 rounded-full flex items-center justify-center text-white">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">或自訂頭貼網址 (URL)</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-1.5 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSaving ? '儲存中...' : '確認更新'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
