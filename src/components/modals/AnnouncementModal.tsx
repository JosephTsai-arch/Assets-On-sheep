import React, { useState } from 'react';
import { Announcement, AnnouncementCategory, User } from '../../types';
import {
  X,
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Wrench,
  Info,
  Calendar,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import { markAnnouncementAsRead, markAllAnnouncementsAsRead } from '../../services/announcementService';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcements: Announcement[];
  readIds: string[];
  currentUser: User;
  onMarkRead: (announcementId: string) => void;
  onMarkAllRead: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  isOpen,
  onClose,
  announcements,
  readIds,
  currentUser,
  onMarkRead,
  onMarkAllRead,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const readSet = new Set(readIds);
  const unreadCount = announcements.filter((a) => !readSet.has(a.id)).length;

  const filteredList = announcements.filter((ann) => {
    const isRead = readSet.has(ann.id);
    if (filter === 'unread') return !isRead;
    if (filter === 'read') return isRead;
    return true;
  });

  const toggleExpand = async (annId: string) => {
    const next = new Set(expandedIds);
    const isExpanding = !next.has(annId);

    if (isExpanding) {
      next.add(annId);
      // 點開卡片看全文時，若未讀則自動轉為已讀
      if (!readSet.has(annId)) {
        onMarkRead(annId);
        await markAnnouncementAsRead(currentUser.id, annId);
      }
    } else {
      next.delete(annId);
    }
    setExpandedIds(next);
  };

  const handleMarkAllRead = async () => {
    const unreadIds = announcements.filter((a) => !readSet.has(a.id)).map((a) => a.id);
    if (!unreadIds.length) return;
    onMarkAllRead();
    await markAllAnnouncementsAsRead(currentUser.id, unreadIds);
  };

  const getCategoryBadge = (category: AnnouncementCategory) => {
    switch (category) {
      case 'feature':
        return {
          icon: <Sparkles size={12} className="text-emerald-600" />,
          label: '新功能上線',
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'system':
        return {
          icon: <Layers size={12} className="text-indigo-600" />,
          label: '系統重要公告',
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        };
      case 'maintenance':
        return {
          icon: <Wrench size={12} className="text-amber-600" />,
          label: '維護通知',
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'notice':
      default:
        return {
          icon: <Info size={12} className="text-blue-600" />,
          label: '溫馨提醒',
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
        };
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d
        .getDate()
        .toString()
        .padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FAF7F2] rounded-3xl shadow-2xl border border-stone-200 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-white border-b border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shadow-xs">
              <Bell size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-stone-900 tracking-tight">系統全域公告</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-rose-500 text-white shadow-xs animate-pulse">
                    {unreadCount} 則未讀
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                掌握資產上羊最新功能、維護排程與重大公告
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Filter & Mark All Read */}
        <div className="px-5 py-3 bg-white/70 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              全部 ({announcements.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filter === 'unread'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <span>未讀</span>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'read'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              已讀 ({announcements.length - unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              <CheckCheck size={14} />
              <span>全部標為已讀</span>
            </button>
          )}
        </div>

        {/* Announcements List */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {filteredList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-stone-100 flex items-center justify-center text-stone-300 mb-3">
                <CheckCircle2 size={32} />
              </div>
              <p className="text-sm font-bold text-stone-700">
                {filter === 'unread' ? '太棒了！所有公告都已讀完囉' : '目前尚無公告發布'}
              </p>
              <p className="text-xs text-stone-400 mt-1">
                若有新功能或重要消息，會即時在此為您呈現
              </p>
            </div>
          ) : (
            filteredList.map((ann) => {
              const isRead = readSet.has(ann.id);
              const isExpanded = expandedIds.has(ann.id);
              const catBadge = getCategoryBadge(ann.category);

              return (
                <div
                  key={ann.id}
                  onClick={() => toggleExpand(ann.id)}
                  className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer p-4 sm:p-5 ${
                    isRead
                      ? 'bg-white border-stone-200/80 hover:border-stone-300 shadow-xs opacity-90 hover:opacity-100'
                      : 'bg-white border-amber-300/80 shadow-md ring-2 ring-amber-400/20 hover:border-amber-400'
                  }`}
                >
                  {/* Card Header: 標籤、時間與未讀狀態 */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${catBadge.bg}`}
                      >
                        {catBadge.icon}
                        <span>{catBadge.label}</span>
                      </span>

                      {ann.broadcastLine && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                          <MessageSquare size={10} />
                          <span>LINE推播</span>
                        </span>
                      )}

                      {ann.popupInApp && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                          <Bell size={10} />
                          <span>視窗通知</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-stone-400 flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(ann.createdAt)}
                      </span>

                      {!isRead ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-600 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                          <span>未讀</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-400 font-medium">
                          已讀
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-black text-stone-900 mt-2.5 tracking-tight group-hover:text-amber-800 transition-colors">
                    {ann.title}
                  </h3>

                  {/* Body: 縮文或全文 */}
                  <div className="mt-2 text-stone-600 text-xs sm:text-sm leading-relaxed">
                    {isExpanded ? (
                      <div className="space-y-3 pt-1 border-t border-stone-100 mt-2 text-stone-700 whitespace-pre-wrap animate-in fade-in duration-150 select-text">
                        {ann.content}
                        <div className="pt-2 text-[11px] text-stone-400 border-t border-stone-100 flex items-center justify-between">
                          <span>發布者：{ann.authorName || '首席管理員'}</span>
                          <span>點擊卡片可收合</span>
                        </div>
                      </div>
                    ) : (
                      <p className="line-clamp-2 text-stone-500 text-xs sm:text-sm">
                        {ann.content}
                      </p>
                    )}
                  </div>

                  {/* Bottom Indicator */}
                  <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-amber-600 font-bold flex items-center gap-1 group-hover:underline">
                      {isExpanded ? (
                        <>
                          <span>收合內容</span>
                          <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          <span>點開看全文</span>
                          <ChevronDown size={14} />
                        </>
                      )}
                    </span>

                    {!isRead && (
                      <span className="text-[11px] text-stone-400">
                        點開即標記已讀
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-stone-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-stone-400">
            資產上羊・公告與即時推播中心
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
