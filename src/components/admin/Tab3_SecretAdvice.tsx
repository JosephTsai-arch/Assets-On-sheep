import React, { useState, useMemo } from 'react';
import { HealthReport } from '../../types';
import { useConfidentialReports, UserReportGroup } from '../../hooks/useConfidentialReports';
import {
  ShieldAlert,
  ChevronDown,
  Search,
  RefreshCw,
  ExternalLink,
  Award,
  Calendar,
  Activity,
  PieChart,
} from 'lucide-react';

interface Tab3SecretAdviceProps {
  onViewReport: (report: HealthReport) => void;
}

export const Tab3_SecretAdvice: React.FC<Tab3SecretAdviceProps> = ({ onViewReport }) => {
  const { groupedReports, loading, error, reload } = useConfidentialReports();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleAccordion = (userId: string) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedReports;
    const q = searchQuery.toLowerCase().trim();
    return groupedReports.filter(
      (g) =>
        g.userName.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.userId.toLowerCase().includes(q)
    );
  }, [groupedReports, searchQuery]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-5">
      {/* 頂部標題與特權警示列 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-700 rounded-xl">
              <ShieldAlert size={18} />
            </span>
            <h3 className="text-base font-extrabold text-stone-900">
              全站機密財務診斷報告 (Secret Advice)
            </h3>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            特權全域視圖：無限制調閱全體註冊會員歷次 AI 健檢歸檔，嚴格隔離並動態 Join 真實姓名
          </p>
        </div>

        <button
          onClick={reload}
          disabled={loading}
          className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>重新整理</span>
        </button>
      </div>

      {/* 搜尋過濾器 */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          lang="zh-TW"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜尋會員姓名、Email 或 ID..."
          className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
        />
      </div>

      {/* 載入中骨架屏 */}
      {loading && (
        <div className="space-y-3 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-stone-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* 錯誤提示 */}
      {error && !loading && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold">
          ⚠️ {error}
        </div>
      )}

      {/* 無資料空狀態 */}
      {!loading && filteredGroups.length === 0 && (
        <div className="py-12 text-center bg-stone-50 rounded-2xl border border-stone-100 space-y-2">
          <p className="text-sm font-extrabold text-stone-700">查無機密健檢報告</p>
          <p className="text-xs text-stone-400">目前全站尚未有會員執行 AI 財務健全診斷</p>
        </div>
      )}

      {/* 手風琴摺疊介面 (Accordion Group by User) */}
      {!loading && filteredGroups.length > 0 && (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedUserId === group.userId;

            return (
              <div
                key={group.userId}
                className="border border-stone-200/90 rounded-2xl overflow-hidden transition-all bg-white hover:border-stone-300"
              >
                {/* 手風琴摺疊標頭 (點擊展開/收合) */}
                <button
                  type="button"
                  onClick={() => toggleAccordion(group.userId)}
                  className={`w-full p-4 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    isExpanded ? 'bg-amber-50/50' : 'bg-white hover:bg-stone-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* 使用者頭貼 */}
                    {group.userAvatar ? (
                      <img
                        src={group.userAvatar}
                        alt={group.userName}
                        className="w-10 h-10 rounded-full border border-stone-200 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-sm shrink-0 border border-emerald-200">
                        {group.userName.charAt(0) || '羊'}
                      </div>
                    )}

                    <div className="truncate min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-stone-900 truncate max-w-[120px] sm:max-w-[200px]" title={group.userName}>
                          {group.userName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md shrink-0">
                          {group.reportCount} 份診斷存檔
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400 truncate mt-0.5">
                        {group.email ? group.email : `UID: ${group.userId.slice(0, 14)}...`}
                      </p>
                    </div>
                  </div>

                  {/* 標頭右側指標與旋轉 Chevron 圖示 */}
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-stone-400 font-semibold block">均值評分</span>
                      <span className="text-sm font-black text-emerald-700">{group.averageScore} 分</span>
                    </div>

                    <div
                      className={`p-1.5 rounded-xl bg-stone-100 text-stone-600 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 bg-amber-200 text-amber-900' : ''
                      }`}
                    >
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </button>

                {/* 手風琴摺疊內容 (該成員歷來報告列表) */}
                {isExpanded && (
                  <div className="p-4 bg-stone-50/70 border-t border-stone-100 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 px-1">
                      <span>歷次歸檔週期 ({group.reports.length} 筆)</span>
                      <span>點擊卡片調閱完整 CFA 專業報告</span>
                    </div>

                    {group.reports.map((rep) => {
                      const scoreBadgeColor =
                        rep.score >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : rep.score >= 60
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800';

                      return (
                        <div
                          key={rep.id}
                          onClick={() => onViewReport(rep)}
                          className="p-3.5 bg-white rounded-xl border border-stone-200 hover:border-amber-400 hover:shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 text-xs font-black text-stone-900">
                                <Calendar size={13} className="text-stone-400" />
                                <span>{rep.month} 週期健檢</span>
                              </span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${scoreBadgeColor}`}>
                                指數 {rep.score} / 100
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md">
                                {rep.savingsHealthEvaluation || '評估完成'}
                              </span>
                            </div>

                            <p className="text-xs text-stone-600 line-clamp-1 group-hover:text-stone-900">
                              {rep.summary}
                            </p>

                            <div className="flex items-center gap-3 text-[10px] text-stone-400">
                              <span className="flex items-center gap-1">
                                <PieChart size={11} /> 恩格爾係數: {rep.engelCoefficient}%
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Activity size={11} /> 固定支出比: {rep.fixedExpenseRatio}%
                              </span>
                              <span>•</span>
                              <span>{new Date(rep.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-xs font-bold text-amber-700 group-hover:text-amber-800 shrink-0 self-end sm:self-center">
                            <span>調閱詳情</span>
                            <ExternalLink size={13} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
