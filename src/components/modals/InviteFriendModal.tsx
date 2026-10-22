import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Share2, Sparkles, MessageCircle, AlertTriangle, UserPlus, Users, Loader2 } from 'lucide-react';
import { generateLiffInviteUrl } from '../../services/liffInviteService';
import { Ledger, Friend } from '../../types';

interface InviteFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  targetLedger?: Ledger | null;
  friends?: Friend[];
  onAddMemberToLedger?: (ledgerId: string, memberId: string) => Promise<any>;
}

export const InviteFriendModal: React.FC<InviteFriendModalProps> = ({
  isOpen,
  onClose,
  currentUserId,
  currentUserName,
  targetLedger,
  friends = [],
  onAddMemberToLedger,
}) => {
  const [liffId, setLiffId] = useState<string>('');
  const [inviteUrl, setInviteUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const [addedFriendIds, setAddedFriendIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setError('');
    setAddedFriendIds(new Set());

    const resolveLiffId = async () => {
      let resolvedId = (import.meta.env.VITE_LINE_LIFF_ID || '').trim();

      // 若前端環境變數未設置，動態由公開安全配置端點拉取
      if (!resolvedId) {
        try {
          const res = await fetch('/api/system/public-config');
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.liffId) {
              resolvedId = data.liffId.trim();
            }
          }
        } catch (fetchErr: any) {
          console.warn('[InviteModal] 獲取 LIFF ID 降級:', fetchErr?.message);
        }
      }

      if (!isMounted) return;

      if (!resolvedId) {
        setError('系統尚未設定 LINE LIFF ID。請聯繫管理員於系統配置完成設定。');
        setIsLoading(false);
        return;
      }

      setLiffId(resolvedId);
      // 格式鐵律：https://liff.line.me/{lineLiffId}?inviteCode={生成的唯一邀請碼}
      const url = generateLiffInviteUrl(
        resolvedId,
        currentUserId,
        currentUserName,
        targetLedger?.id,
        targetLedger?.name
      );
      setInviteUrl(url);
      setIsLoading(false);
    };

    resolveLiffId();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUserId, currentUserName, targetLedger]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShareToLine = () => {
    if (!inviteUrl) return;
    const ledgerNotice = targetLedger ? `加入「${targetLedger.name}」共管帳本` : '加入「資產上羊」好友共管記帳';
    const shareText = `🐑 ${currentUserName} 邀請您${ledgerNotice}！\n✨ 我們的超強功能 ✨\n💬 聊天記帳｜對著 LINE 打字，AI 自動幫你記\n🤝 一鍵分帳｜出遊、合租代墊，爛帳秒結清\n🔮 財務雷達｜大筆開銷提早均攤，預警透支\n🩺 AI 健檢｜每個月專屬理財顧問幫你抓漏\n\n點擊下方專屬連結，即可在 LINE 內一秒自動加入：\n${inviteUrl}`;
    const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;
    window.location.href = lineShareUrl;
  };

  const handleQuickAddFriendToLedger = async (friend: Friend) => {
    if (!targetLedger || !onAddMemberToLedger) return;
    const targetMemberId = friend.friendUserId || friend.id;
    setAddingFriendId(friend.id);
    try {
      await onAddMemberToLedger(targetLedger.id, targetMemberId);
      setAddedFriendIds((prev) => new Set([...prev, friend.id, targetMemberId]));
    } catch (err: any) {
      console.error('Quick add member failed:', err);
    } finally {
      setAddingFriendId(null);
    }
  };

  const ledgerMembersSet = new Set<string>([
    ...(targetLedger?.memberIds || []),
    ...Array.from(addedFriendIds),
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 to-teal-50/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              {targetLedger ? '🤝' : '🐑'}
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-stone-900">
                {targetLedger ? `邀請好友加入「${targetLedger.name}」` : '邀請好友加入記帳'}
              </h2>
              <p className="text-[10px] text-stone-500 font-medium">
                {targetLedger ? `共管帳本協作 (${targetLedger.currency})` : 'LIFF 專屬無感綁定防碎裂連結'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* 若為指定帳本，優先提供現有好友快速加入 */}
          {targetLedger && friends.length > 0 && onAddMemberToLedger && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2">
              <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Users size={14} className="text-amber-700" />
                <span>從現有好友名單直接加入此帳本：</span>
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {friends.map((f) => {
                  const friendUid = f.friendUserId || f.id;
                  const isAlreadyIn =
                    ledgerMembersSet.has(f.id) ||
                    ledgerMembersSet.has(friendUid) ||
                    (f.friendUserId && ledgerMembersSet.has(`line_${f.friendUserId}`)) ||
                    (f.friendUserId && ledgerMembersSet.has(f.friendUserId.replace(/^line_/, '')));

                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-2 bg-white rounded-xl border border-amber-200/60 text-xs"
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="font-bold text-stone-800 truncate" title={f.name}>
                          {f.name} {f.isDummy ? '(虛擬專屬)' : ''}
                        </span>
                      </div>
                      {isAlreadyIn ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md shrink-0">
                          ✓ 已在帳本中
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={addingFriendId === f.id}
                          onClick={() => handleQuickAddFriendToLedger(f)}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg shrink-0 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {addingFriendId === f.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <UserPlus size={12} />
                          )}
                          <span>加入</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-stone-600">正在生成 LIFF 專屬邀請連結...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">{error}</p>
            </div>
          ) : (
            <>
              {/* LIFF 連結展示方塊 */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-emerald-600" />
                  <span>LINE LIFF 專屬邀請連結</span>
                </label>
                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 font-mono text-[11px] text-stone-700 break-all select-all focus:outline-emerald-500">
                  {inviteUrl}
                </div>
              </div>

              {/* 核心說明卡 */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-1.5 text-xs text-emerald-950">
                <div className="font-extrabold flex items-center gap-1.5">
                  <Check size={14} className="text-emerald-600" />
                  <span>無感註冊與唯一身分對齊保障</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  好友點擊此連結將直接於 LINE 內部開啟，自動擷取真實 LINE Profile 並完成好友綁定與帳本加入，【免手動填寫表單】，杜絕身分碎裂！
                </p>
              </div>

              {/* 操作按鈕組 */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? '✅ 已複製專屬邀請連結！' : '📋 複製專屬邀請連結'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareToLine}
                  className="w-full py-2.5 px-4 bg-[#06C755] hover:bg-[#05b04c] active:scale-98 text-white rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <MessageCircle size={15} />
                  <span>💬 直接轉傳至 LINE 好友或群組</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-stone-50 border-t border-stone-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-200/60 transition cursor-pointer"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
