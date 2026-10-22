import React, { useState, useEffect } from 'react';
import { Announcement, AnnouncementCategory, User } from '../../types';
import {
  fetchAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  fetchAnnouncementReadStats,
} from '../../services/announcementService';
import {
  Megaphone,
  Plus,
  Send,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Bell,
  RefreshCw,
  Users,
  Calendar,
  Sparkles,
  Layers,
  Wrench,
  Info,
  X,
  Eye,
} from 'lucide-react';

interface AnnouncementTabProps {
  currentUser: User;
  onAnnouncementsUpdated?: () => void;
}

export const AnnouncementTab: React.FC<AnnouncementTabProps> = ({
  currentUser,
  onAnnouncementsUpdated,
}) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 新增公告表單狀態
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('feature');
  const [broadcastLine, setBroadcastLine] = useState(true);
  const [popupInApp, setPopupInApp] = useState(true);

  // 編輯模式狀態
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<AnnouncementCategory>('feature');
  const [editBroadcastLine, setEditBroadcastLine] = useState(false);
  const [editPopupInApp, setEditPopupInApp] = useState(true);
  const [editRebroadcastLine, setEditRebroadcastLine] = useState(false);

  // 閱讀統計快取 map
  const [readStatsMap, setReadStatsMap] = useState<Record<string, number>>({});

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const list = await fetchAnnouncements();
      setAnnouncements(list);

      // 異步載入已讀統計
      const statsObj: Record<string, number> = {};
      await Promise.all(
        list.map(async (ann) => {
          const stats = await fetchAnnouncementReadStats(ann.id);
          statsObj[ann.id] = stats.readCount;
        })
      );
      setReadStatsMap(statsObj);
    } catch (err: any) {
      setErrorMsg('無法載入公告列表: ' + (err?.message || '未知錯誤'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setErrorMsg('請填寫公告標題與內容');
      return;
    }
    if (!broadcastLine && !popupInApp) {
      setErrorMsg('請至少勾選一種推播管道（LINE 機器人群發 或 視窗彈出）');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await createAnnouncement(
        {
          title,
          content,
          category,
          broadcastLine,
          popupInApp,
        },
        currentUser
      );

      if (res.success) {
        setSuccessMsg(
          `公告發布成功！${
            broadcastLine ? '（已同步發送 LINE 機器人群發）' : ''
          }${popupInApp ? '（已配置視窗彈出）' : ''}`
        );
        setTitle('');
        setContent('');
        setCategory('feature');
        setBroadcastLine(true);
        setPopupInApp(true);
        await loadData();
        if (onAnnouncementsUpdated) onAnnouncementsUpdated();
      } else {
        setErrorMsg(res.error || '發布失敗');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '發布公告時發生錯誤');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (ann: Announcement) => {
    setEditingAnn(ann);
    setEditTitle(ann.title);
    setEditContent(ann.content);
    setEditCategory(ann.category);
    setEditBroadcastLine(ann.broadcastLine);
    setEditPopupInApp(ann.popupInApp);
    setEditRebroadcastLine(false);
  };

  const handleSaveEdit = async () => {
    if (!editingAnn) return;
    if (!editTitle.trim() || !editContent.trim()) {
      alert('請填寫完整標題與內容');
      return;
    }

    setSubmitting(true);
    try {
      const res = await updateAnnouncement(
        editingAnn.id,
        {
          title: editTitle,
          content: editContent,
          category: editCategory,
          broadcastLine: editBroadcastLine,
          popupInApp: editPopupInApp,
        },
        currentUser,
        editRebroadcastLine
      );

      if (res.success) {
        setSuccessMsg('公告已成功更新！');
        setEditingAnn(null);
        await loadData();
        if (onAnnouncementsUpdated) onAnnouncementsUpdated();
      } else {
        alert(res.error || '更新失敗');
      }
    } catch (err: any) {
      alert(err?.message || '更新失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ann: Announcement) => {
    if (!window.confirm(`確定要刪除公告「${ann.title}」嗎？刪除後所有用戶端將不再顯示此公告。`)) {
      return;
    }

    try {
      const ok = await deleteAnnouncement(ann.id);
      if (ok) {
        setSuccessMsg(`已刪除公告「${ann.title}」`);
        await loadData();
        if (onAnnouncementsUpdated) onAnnouncementsUpdated();
      } else {
        alert('刪除失敗');
      }
    } catch (err: any) {
      alert(err?.message || '刪除失敗');
    }
  };

  const getCategoryBadge = (cat: AnnouncementCategory) => {
    switch (cat) {
      case 'feature':
        return {
          icon: <Sparkles size={12} className="text-emerald-600" />,
          label: '新功能上線',
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'system':
        return {
          icon: <Layers size={12} className="text-indigo-600" />,
          label: '系統公告',
          cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        };
      case 'maintenance':
        return {
          icon: <Wrench size={12} className="text-amber-600" />,
          label: '維護通知',
          cls: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'notice':
      default:
        return {
          icon: <Info size={12} className="text-blue-600" />,
          label: '溫馨提醒',
          cls: 'bg-blue-50 text-blue-800 border-blue-200',
        };
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d
        .getDate()
        .toString()
        .padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* 頂部標題說明 */}
      <div className="bg-gradient-to-r from-amber-900 via-stone-900 to-emerald-950 text-white rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-300">
              <Megaphone size={20} />
            </span>
            <h2 className="text-lg font-black tracking-tight">全域公告廣播中心</h2>
          </div>
          <p className="text-xs text-stone-300 mt-1 max-w-xl leading-relaxed">
            支援<strong>「LINE 機器人群發」</strong>與<strong>「視窗彈出縮文卡片」</strong>雙軌發布管道。全站所有新舊帳號獨立同步已讀狀態，總管可即時全域編輯與刪除。
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/10 active:scale-95"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>重新載入</span>
        </button>
      </div>

      {/* 提示訊息 */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertCircle size={16} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 區塊 1: 發布新公告表單 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-emerald-600" />
            <h3 className="text-sm font-black text-stone-900">撰寫並發布新公告</h3>
          </div>
          <span className="text-[11px] text-stone-400 font-medium">
            首席管理員專屬權限
          </span>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* 標題與類別 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-stone-700">公告標題 *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：【新功能上線】新增AA分帳智能辨識與對帳中心"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700">公告類別</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              >
                <option value="feature">🚀 新功能上線</option>
                <option value="system">⚙️ 系統公告</option>
                <option value="maintenance">🛠️ 維護通知</option>
                <option value="notice">💡 溫馨提醒</option>
              </select>
            </div>
          </div>

          {/* 公告內文 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">
              公告內容全文 * (支援換行、連結與詳細清單)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="請輸入公告全文內容...&#10;使用者點擊縮文卡片後可展開查看此處全文。"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/40 leading-relaxed"
              required
            />
          </div>

          {/* 發布渠道選擇 (支援單選或兩者皆選) */}
          <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-200/80 space-y-2">
            <label className="text-xs font-black text-stone-800 block">
              發布管道選擇 (可單選或一次選中兩個)：
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  broadcastLine
                    ? 'bg-green-50/80 border-green-300 ring-2 ring-green-500/20'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={broadcastLine}
                  onChange={(e) => setBroadcastLine(e.target.checked)}
                  className="mt-0.5 rounded text-green-600 focus:ring-green-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <MessageSquare size={13} className="text-green-600" />
                    <span>1. 在 LINE 機器人裡群發公告</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    透過官方 LINE Messaging API 廣播，預設於訊息下方自動附帶【📱 軟體&功能】、【🔄 修改上一筆】、【👤 我的帳號】狀態機快捷按鈕
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  popupInApp
                    ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/20'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={popupInApp}
                  onChange={(e) => setPopupInApp(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <Bell size={13} className="text-amber-600" />
                    <span>2. 在視窗裡彈出公告</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    用戶進入網頁版時自動以縮文卡片彈窗提醒，點開轉為已讀
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 送出按鈕 */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Send size={14} />
              <span>{submitting ? '廣播發布中...' : '立即發布全域公告'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 區塊 2: 已發布公告全域管理列表 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-amber-600" />
            <h3 className="text-sm font-black text-stone-900">
              全域已發布公告管理 ({announcements.length})
            </h3>
          </div>
          <span className="text-[11px] text-stone-400">
            支援全域編輯與刪除
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center items-center text-stone-400 text-xs">
            <RefreshCw size={16} className="animate-spin mr-2" />
            正在載入公告列表...
          </div>
        ) : announcements.length === 0 ? (
          <div className="py-12 text-center text-stone-400 text-xs font-bold">
            目前尚未發布任何公告
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {announcements.map((ann) => {
              const badge = getCategoryBadge(ann.category);
              const readCount = readStatsMap[ann.id] ?? 0;

              return (
                <div key={ann.id} className="py-4 space-y-2 group">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${badge.cls}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>

                      <h4 className="text-sm font-black text-stone-900">
                        {ann.title}
                      </h4>

                      {ann.broadcastLine && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            ann.lineBroadcastStatus?.success === false
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-green-50 text-green-700 border-green-200'
                          }`}
                          title={ann.lineBroadcastStatus?.error || 'LINE 機器人已群發'}
                        >
                          <MessageSquare size={10} />
                          <span>LINE推播</span>
                          {ann.lineBroadcastStatus?.success === false && (
                            <span className="text-[9px] text-rose-600">(未達)</span>
                          )}
                        </span>
                      )}

                      {ann.popupInApp && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Bell size={10} />
                          <span>視窗彈出</span>
                        </span>
                      )}
                    </div>

                    {/* 操作按鈕群 */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        onClick={() => startEdit(ann)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-all cursor-pointer"
                        title="全域編輯此公告"
                      >
                        <Edit3 size={12} />
                        <span>編輯</span>
                      </button>

                      <button
                        onClick={() => handleDelete(ann)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all cursor-pointer"
                        title="全域刪除此公告"
                      >
                        <Trash2 size={12} />
                        <span>刪除</span>
                      </button>
                    </div>
                  </div>

                  {/* 縮文摘要預覽 */}
                  <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                    {ann.content}
                  </p>

                  {/* 資訊欄 (發布時間、發布者、已讀統計) */}
                  <div className="flex items-center gap-4 text-[11px] text-stone-400 pt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      發布於：{formatDate(ann.createdAt)}
                    </span>
                    <span>發布者：{ann.authorName || '首席管理員'}</span>
                    <span className="flex items-center gap-1 text-emerald-700 font-bold">
                      <Eye size={11} />
                      <span>{readCount} 位帳號已讀</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 編輯公告 Modal */}
      {editingAnn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full border border-stone-200 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 size={18} className="text-amber-600" />
                <h3 className="text-sm font-black text-stone-900">全域編輯已發布公告</h3>
              </div>
              <button
                onClick={() => setEditingAnn(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700">標題</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700">類別</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as AnnouncementCategory)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900"
                >
                  <option value="feature">🚀 新功能上線</option>
                  <option value="system">⚙️ 系統公告</option>
                  <option value="maintenance">🛠️ 維護通知</option>
                  <option value="notice">💡 溫馨提醒</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700">公告內容全文</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 leading-relaxed"
                />
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-2">
                <label className="text-xs font-bold text-stone-800 block">推播設定</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPopupInApp}
                      onChange={(e) => setEditPopupInApp(e.target.checked)}
                      className="rounded text-amber-600"
                    />
                    <span>在視窗裡彈出公告 (網頁版提醒)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editBroadcastLine}
                      onChange={(e) => setEditBroadcastLine(e.target.checked)}
                      className="rounded text-green-600"
                    />
                    <span>記錄為 LINE 推播公告</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-indigo-700 cursor-pointer pt-1 border-t border-stone-200">
                    <input
                      type="checkbox"
                      checked={editRebroadcastLine}
                      onChange={(e) => setEditRebroadcastLine(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>🔄 儲存時同步向 LINE 機器人再次群發更新通知</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingAnn(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 cursor-pointer shadow-md"
              >
                {submitting ? '儲存中...' : '儲存修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
