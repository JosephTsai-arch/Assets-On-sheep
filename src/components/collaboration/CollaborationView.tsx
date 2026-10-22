import React, { useState } from 'react';
import { Ledger, Transaction, Friend, SheepPost, AssetAccount } from '../../types';
import { TravelTeamMascot } from '../../utils/mascotSvgs';
import { formatCurrency } from '../../utils/formatters';
import { calculateLedgerSettlement, executeSettlementPayment } from '../../services/settlementService';
import { resolveLedgerMembers } from '../../services/memberResolverService';
import { InviteFriendModal } from '../modals/InviteFriendModal';
import { Users, UserPlus, CheckCircle2, UserX, ArrowRight, Share2, Edit3, Loader2, AlertCircle, Trash2, LogOut } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';
import { EmptyState } from '../common/EmptyState';
import { SheepWall } from './SheepWall';
import { MinCashFlowModal } from './MinCashFlowModal';

interface CollaborationViewProps {
  ledgers: Ledger[];
  transactions: Transaction[];
  friends: Friend[];
  sheepPosts: SheepPost[];
  assetAccounts?: AssetAccount[];
  currentUserId: string;
  currentUserName: string;
  onOpenAddLedger: () => void;
  onEditLedger?: (ledger: Ledger) => void;
  onDeleteLedger: (ledgerId: string) => Promise<void>;
  onKickMember: (ledgerId: string, memberId: string) => Promise<any>;
  onAddMemberToLedger?: (ledgerId: string, memberId: string) => Promise<any>;
  onCreatePost: (content: string) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onToggleLike: (postId: string) => Promise<void>;
  onDeleteFriend: (friendId: string) => Promise<void>;
  onAddFriend?: (name: string) => Promise<any>;
  onReload: () => void;
}

export const CollaborationView: React.FC<CollaborationViewProps> = ({
  ledgers,
  transactions,
  friends,
  sheepPosts,
  assetAccounts,
  currentUserId,
  currentUserName,
  onOpenAddLedger,
  onEditLedger,
  onDeleteLedger,
  onKickMember,
  onAddMemberToLedger,
  onCreatePost,
  onDeletePost,
  onToggleLike,
  onDeleteFriend,
  onAddFriend,
  onReload,
}) => {
  const [activeTab, setActiveTab] = useState<'ledgers' | 'friends'>('ledgers');
  const [selectedLedgerForSettlement, setSelectedLedgerForSettlement] = useState<Ledger | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedLedgerForInvite, setSelectedLedgerForInvite] = useState<Ledger | null>(null);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [customFriendName, setCustomFriendName] = useState('');
  const [isSubmittingFriend, setIsSubmittingFriend] = useState(false);
  const [kickingMemberKey, setKickingMemberKey] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => {
      setActionFeedback((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const handleKickOrLeave = async (ledgerId: string, memberId: string, isLeave: boolean, memberName: string) => {
    const key = `${ledgerId}_${memberId}`;
    if (kickingMemberKey) return; // 防重複點擊
    setKickingMemberKey(key);
    try {
      const res = await onKickMember(ledgerId, memberId);
      if (res && res.success === false) {
        showFeedback('error', res.message || '操作失敗');
      } else {
        if (isLeave && selectedLedgerForSettlement?.id === ledgerId) {
          setSelectedLedgerForSettlement(null);
        }
        showFeedback('success', isLeave ? '已成功退出共管帳本！' : `已將「${memberName}」移出共管帳本！`);
        onReload();
      }
    } catch (e: any) {
      showFeedback('error', e?.message || '操作發生錯誤，請稍後再試');
    } finally {
      setKickingMemberKey(null);
    }
  };

  // 此頁面嚴禁顯示個人的日常私帳！且本人未參與 (不在 memberIds 中或已刪除) 的共管帳本絕對不滯留！
  const sharedLedgers = ledgers.filter((l) => {
    if (!l.isShared || l.deletedAt) return false;
    const isMember = (l.memberIds || []).some(
      (m) =>
        m === currentUserId ||
        (currentUserId.startsWith('line_') && m === currentUserId.replace('line_', '')) ||
        m === `line_${currentUserId}` ||
        (m.length > 5 && (m.includes(currentUserId) || currentUserId.includes(m)))
    );
    return isMember;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 頂部吉祥物與頁面標題 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TravelTeamMascot size={46} />
          <div>
            <h1 className="text-xl font-black text-stone-900 flex items-center gap-1.5">
              <span>🤝 好友與AA共管帳本</span>
            </h1>
            <p className="text-xs text-stone-500">
              多幣別平帳核心、Min-Cash-Flow 最佳清償演算法與羊咩咩心得牆
            </p>
          </div>
        </div>

        <button
          data-tour="collab-add-ledger-btn"
          onClick={onOpenAddLedger}
          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <span>＋ 新增共管帳本</span>
        </button>
      </div>

      {/* 頂部分頁切換 (Tabs) */}
      <div className="flex bg-stone-200/70 p-1 rounded-2xl w-full sm:w-80">
        <button
          onClick={() => setActiveTab('ledgers')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'ledgers' ? 'bg-white text-emerald-800 shadow-xs' : 'text-stone-600'
          }`}
        >
          共管帳本與平帳
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'friends' ? 'bg-white text-emerald-800 shadow-xs' : 'text-stone-600'
          }`}
        >
          好友名單與互動牆
        </button>
      </div>

      {/* Tab 1: 共管帳本區 (嚴禁顯示個人私帳) */}
      {activeTab === 'ledgers' && (
        <div className="space-y-4">
          {/* 即時操作回饋提示條 */}
          {actionFeedback && (
            <div
              className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs font-bold transition-all shadow-xs animate-in fade-in slide-in-from-top-2 ${
                actionFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
              )}
              <span className="flex-1">{actionFeedback.message}</span>
              <button
                onClick={() => setActionFeedback(null)}
                className="text-stone-400 hover:text-stone-600 cursor-pointer ml-auto text-[11px]"
              >
                ✕
              </button>
            </div>
          )}

          {sharedLedgers.length === 0 ? (
            <EmptyState
              title="目前尚無共管帳本"
              description="點擊右上角「＋ 新增共管帳本」，與好友、家人或旅行夥伴一起記帳與 AA 平帳！"
              actionText="建立共管帳本"
              onAction={onOpenAddLedger}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sharedLedgers.map((ledger) => {
                const isCreator =
                  ledger.creatorId === currentUserId ||
                  ledger.userId === currentUserId ||
                  (ledger.creatorId && currentUserId && (
                    ledger.creatorId === `line_${currentUserId}` ||
                    `line_${ledger.creatorId}` === currentUserId
                  )) ||
                  (ledger.userId && currentUserId && (
                    ledger.userId === `line_${currentUserId}` ||
                    `line_${ledger.userId}` === currentUserId
                  )) ||
                  ledger.id.includes(currentUserId) ||
                  (currentUserId.startsWith('line_') && ledger.id.includes(currentUserId.replace('line_', '')));

                const settlement = calculateLedgerSettlement(
                  ledger,
                  transactions,
                  friends,
                  currentUserId,
                  currentUserName
                );

                return (
                  <div
                    key={ledger.id}
                    className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-lg shrink-0">🤝</span>
                          <div className="min-w-0 flex-1">
                            <h3
                              className="text-sm font-bold text-stone-900 truncate"
                              title={ledger.name}
                            >
                              {ledger.name}
                            </h3>
                            <p className="text-[10px] text-stone-400">計價幣別：{ledger.currency}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">
                            {isCreator ? '👑 創建者' : '受邀協作者'}
                          </span>
                          {/* 邀請好友加入帳本 */}
                          <button
                            onClick={() => {
                              setSelectedLedgerForInvite(ledger);
                              setIsInviteModalOpen(true);
                            }}
                            className="p-1.5 text-stone-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold border border-stone-200"
                            title="邀請好友進入此帳本"
                          >
                            <UserPlus size={13} />
                            <span className="hidden sm:inline">邀請</span>
                          </button>
                          {/* 編輯帳本 (修改幣別、參與者、名稱) */}
                          {onEditLedger && (
                            <button
                              onClick={() => onEditLedger(ledger)}
                              className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold border border-stone-200"
                              title="編輯帳本 (幣別、參與者、名稱)"
                            >
                              <Edit3 size={13} />
                              <span className="hidden sm:inline">編輯</span>
                            </button>
                          )}
                          {/* 刪除帳本按鈕 */}
                          {isCreator && (
                            <InlineConfirm
                              onConfirm={() => onDeleteLedger(ledger.id)}
                              title={`確定刪除帳本「${ledger.name}」？此操作將進行軟刪除。`}
                              confirmText="確定刪除"
                              triggerButton={
                                <button
                                  type="button"
                                  title="刪除帳本"
                                  className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold border border-stone-200"
                                >
                                  <Trash2 size={13} />
                                  <span className="hidden sm:inline">刪除</span>
                                </button>
                              }
                            />
                          )}
                          {/* 退出帳本按鈕 */}
                          <InlineConfirm
                            onConfirm={() => handleKickOrLeave(ledger.id, currentUserId, true, currentUserName)}
                            title={`確定退出共管帳本「${ledger.name}」？退出後您將完全看不到此帳本。`}
                            confirmText="確定退出"
                            triggerButton={
                              <button
                                type="button"
                                title="退出此共管帳本"
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold border border-stone-200"
                              >
                                <LogOut size={13} />
                                <span className="hidden sm:inline">退出</span>
                              </button>
                            }
                          />
                        </div>
                      </div>

                      {/* 成員列表與踢除/退出權限控制 */}
                      {(() => {
                        const uniqueMembers = resolveLedgerMembers(
                          ledger.memberIds,
                          friends,
                          currentUserId,
                          currentUserName
                        );

                        return (
                          <div className="my-3 space-y-1.5">
                            <p className="text-[11px] font-bold text-stone-500">
                              共管成員 ({uniqueMembers.length} 人)：
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {uniqueMembers.map((m) => {
                                const isActionInProgress = kickingMemberKey === `${ledger.id}_${m.id}`;

                                return (
                                  <div
                                    key={m.id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-50 border border-stone-200 rounded-xl text-xs max-w-full"
                                  >
                                    <span className="font-semibold text-stone-700 truncate max-w-[110px] sm:max-w-[140px]" title={m.name}>
                                      {m.name}
                                    </span>
                                    {isCreator && !m.isMe && (
                                      <InlineConfirm
                                        title={`確定將「${m.name}」從「${ledger.name}」移出？`}
                                        confirmText="確定移出"
                                        onConfirm={() => handleKickOrLeave(ledger.id, m.id, false, m.name)}
                                        triggerButton={
                                          <button
                                            type="button"
                                            disabled={!!kickingMemberKey}
                                            title="剔除成員"
                                            className="text-stone-400 hover:text-rose-600 ml-0.5 cursor-pointer shrink-0 disabled:opacity-40"
                                          >
                                            {isActionInProgress ? (
                                              <Loader2 size={12} className="animate-spin text-rose-500" />
                                            ) : (
                                              <UserX size={12} />
                                            )}
                                          </button>
                                        }
                                      />
                                    )}
                                    {!isCreator && m.isMe && (
                                      <InlineConfirm
                                        title={`確定主動退出共管帳本「${ledger.name}」？退出後您將無法查閱此帳本。`}
                                        confirmText="確定退出"
                                        onConfirm={() => handleKickOrLeave(ledger.id, m.id, true, m.name)}
                                        triggerButton={
                                          <button
                                            type="button"
                                            disabled={!!kickingMemberKey}
                                            title="主動退出帳本"
                                            className="text-stone-500 hover:text-rose-600 ml-0.5 cursor-pointer shrink-0 font-bold text-[11px] disabled:opacity-40"
                                          >
                                            {isActionInProgress ? (
                                              <span className="flex items-center gap-1 text-rose-500">
                                                <Loader2 size={11} className="animate-spin" />
                                                退出中
                                              </span>
                                            ) : (
                                              '退出'
                                            )}
                                          </button>
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* AA 債務預覽 */}
                      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs my-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-amber-900">最少轉帳次數演算法 (Min-Cash-Flow)</span>
                          <span className="text-[10px] text-amber-700 font-semibold">{settlement.debts.length} 筆待清償</span>
                        </div>
                        {settlement.debts.length > 0 ? (
                          <div className="space-y-1 text-[11px] text-amber-950 mt-1">
                            {settlement.debts.slice(0, 2).map((d, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate" title={`${d.fromName} ➔ ${d.toName}`}>
                                  {d.fromName} ➔ {d.toName}
                                </span>
                                <span className="font-black text-rose-600 shrink-0">{formatCurrency(d.amount, ledger.currency)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-emerald-700 font-medium">✨ 帳目平衡，無未清償債務！</p>
                        )}
                      </div>
                    </div>

                    <button
                      data-tour="collab-settle-btn"
                      onClick={() => setSelectedLedgerForSettlement(ledger)}
                      className="w-full mt-2 py-2 bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      前往平帳中心 (Min-Cash-Flow 最佳路徑與沖銷)
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Min-Cash-Flow 彈窗平帳中心 */}
          {selectedLedgerForSettlement && (
            <MinCashFlowModal
              ledger={selectedLedgerForSettlement}
              transactions={transactions}
              friends={friends}
              assetAccounts={assetAccounts}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onClose={() => setSelectedLedgerForSettlement(null)}
              onReload={onReload}
            />
          )}
        </div>
      )}

      {/* Tab 2: 好友互動區 (左側好友名單 + LINE 專屬加好友連結；右側羊咩咩心得牆) */}
      {activeTab === 'friends' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側好友名單 */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Users size={16} className="text-emerald-600" />
                <span>獨立好友名單 ({friends.length} 人)</span>
              </span>
              <button
                onClick={() => setIsAddingFriend(!isAddingFriend)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer flex items-center gap-1"
              >
                <UserPlus size={14} />
                <span>{isAddingFriend ? '取消' : '＋ 新增好友'}</span>
              </button>
            </div>

            {/* 手動新增好友表單 */}
            {isAddingFriend && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!customFriendName.trim() || !onAddFriend) return;
                  setIsSubmittingFriend(true);
                  try {
                    await onAddFriend(customFriendName.trim());
                    setCustomFriendName('');
                    setIsAddingFriend(false);
                  } finally {
                    setIsSubmittingFriend(false);
                  }
                }}
                className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl space-y-2 animate-in fade-in"
              >
                <label className="block text-[11px] font-bold text-emerald-900">好友姓名或暱稱：</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    lang="zh-TW"
                    inputMode="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={customFriendName}
                    onChange={(e) => setCustomFriendName(e.target.value)}
                    placeholder="例如: 小華、王大明"
                    className="flex-1 px-3 py-1.5 border border-emerald-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingFriend || !customFriendName.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingFriend ? '加入中...' : '確認新增'}
                  </button>
                </div>
              </form>
            )}

            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="w-full py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 active:scale-98 text-emerald-800 font-bold text-xs rounded-2xl border border-emerald-200/80 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Share2 size={14} />
              <span>📱 產生 LINE 專屬加好友連結 (LIFF)</span>
            </button>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {friends.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                  尚未加入任何好友。點擊上方「＋ 新增好友」或產生 LINE 邀請碼！
                </div>
              ) : (
                friends.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-2.5 bg-stone-50 border border-stone-200/70 rounded-2xl gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <img src={f.avatarUrl} alt={f.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-stone-800 truncate" title={f.name}>{f.name}</p>
                        <p className="text-[10px] text-stone-400 truncate">
                          {f.isDummy ? '🐑 專屬虛擬好友' : '專屬好友'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <InlineConfirm
                        onConfirm={() => onDeleteFriend(f.id)}
                        title={`確定移除「${f.name}」？此操作將自您名下獨立好友名單中移除。`}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 右側羊咩咩心得牆 (本人貼文支援雙重確認軟刪除) */}
          <div className="lg:col-span-2">
            <SheepWall
              sheepPosts={sheepPosts}
              currentUserId={currentUserId}
              onCreatePost={onCreatePost}
              onDeletePost={onDeletePost}
              onToggleLike={onToggleLike}
            />
          </div>
        </div>
      )}

      {/* LIFF 好友與帳本專屬邀請彈窗 */}
      <InviteFriendModal
        isOpen={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false);
          setSelectedLedgerForInvite(null);
        }}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        targetLedger={selectedLedgerForInvite}
        friends={friends}
        onAddMemberToLedger={async (lId, mId) => {
          if (onAddMemberToLedger) {
            await onAddMemberToLedger(lId, mId);
          }
          onReload();
        }}
      />
    </div>
  );
};
