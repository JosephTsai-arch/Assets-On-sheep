import React, { useState } from 'react';
import { Transaction, Category, HealthReport } from '../../types';
import { formatCurrency, getCurrentYearMonth } from '../../utils/formatters';
import { getUserExpenseForTransaction, getUserIncomeForTransaction } from '../../utils/mathUtils';
import { PieChart, BarChart3, Tag, Activity, FileText, ChevronRight } from 'lucide-react';

interface AnalyticsViewProps {
  currentUserId?: string;
  transactions: Transaction[];
  categories: Category[];
  healthReports: HealthReport[];
  onOpenCategoryModal: () => void;
  onStartHealthCheck: () => Promise<void>;
  onViewReport: (report: HealthReport) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  currentUserId = '',
  transactions,
  categories,
  healthReports,
  onOpenCategoryModal,
  onStartHealthCheck,
  onViewReport,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth());
  const [chartView, setChartView] = useState<'category' | 'trend'>('category');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const monthTxs = transactions.filter(
    (t) => t.date.startsWith(selectedMonth) && !t.deletedAt
  );

  const expenses = monthTxs.filter((t) => t.type === 'expense');
  const totalExpense = expenses.reduce((sum, t) => sum + getUserExpenseForTransaction(t, currentUserId), 0);

  // Group by category (嚴格僅計算本人份額)
  const categoryMap = new Map<string, number>();
  for (const t of expenses) {
    const myShare = getUserExpenseForTransaction(t, currentUserId);
    if (myShare > 0) {
      const key = t.categoryName || '其他';
      categoryMap.set(key, (categoryMap.get(key) || 0) + myShare);
    }
  }

  const categoryStats = Array.from(categoryMap.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const handleStartCheck = async () => {
    setIsAnalyzing(true);
    try {
      await onStartHealthCheck();
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 頂部操作列與分類管理入口 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-stone-900 flex items-center gap-2">
            <span>📊 統計分析與財務健檢</span>
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            收支結構佔比、歷史趨勢與特許金融架構之健康評估
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 border border-stone-200 rounded-xl text-xs font-bold bg-white"
          />
          {/* 自訂分類管理獨立入口 */}
          <button
            onClick={onOpenCategoryModal}
            className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Tag size={14} />
            <span>🏷️ 收/支類別設定</span>
          </button>
        </div>
      </div>

      {/* 圓餅圖與趨勢切換區塊 */}
      <div data-tour="analytics-chart-card" className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
            {chartView === 'category' ? <PieChart size={16} className="text-emerald-600" /> : <BarChart3 size={16} className="text-indigo-600" />}
            <span>{chartView === 'category' ? '支出分類佔比' : '近月收支趨勢'}</span>
          </span>

          <div className="flex bg-stone-100 p-0.5 rounded-xl text-xs font-bold">
            <button
              onClick={() => setChartView('category')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${
                chartView === 'category' ? 'bg-white shadow-2xs text-stone-900' : 'text-stone-500'
              }`}
            >
              分類佔比
            </button>
            <button
              onClick={() => setChartView('trend')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${
                chartView === 'trend' ? 'bg-white shadow-2xs text-stone-900' : 'text-stone-500'
              }`}
            >
              趨勢圖
            </button>
          </div>
        </div>

        {/* 分類佔比長條統計 UI */}
        {chartView === 'category' ? (
          <div className="space-y-3">
            {categoryStats.length === 0 ? (
              <p className="text-xs text-stone-400 py-6 text-center">本月尚無支出數據</p>
            ) : (
              categoryStats.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <span className="font-bold text-stone-800 truncate min-w-0 flex-1" title={item.name}>{item.name}</span>
                    <span className="font-semibold text-stone-600 shrink-0">
                      {formatCurrency(item.amount)} ({item.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* 簡易近 3 個月趨勢視覺化 */
          <div className="py-4 grid grid-cols-3 gap-3 text-center">
            {['2026-08', '2026-09', '2026-10'].map((m) => {
              const mTxs = transactions.filter((t) => t.date.startsWith(m) && !t.deletedAt);
              const exp = mTxs.reduce((s, t) => s + getUserExpenseForTransaction(t, currentUserId), 0);
              const inc = mTxs.reduce((s, t) => s + getUserIncomeForTransaction(t, currentUserId), 0);
              return (
                <div key={m} className="p-3 bg-stone-50 rounded-2xl border border-stone-100 min-w-0">
                  <p className="text-[11px] font-bold text-stone-500 mb-1">{m}</p>
                  <p className="text-xs font-bold text-emerald-600 truncate" title={`入 ${formatCurrency(inc)}`}>入 {formatCurrency(inc)}</p>
                  <p className="text-xs font-bold text-rose-600 mt-0.5 truncate" title={`支 ${formatCurrency(exp)}`}>支 {formatCurrency(exp)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部滿版按鈕： 「🩺 開始 AI 財務健檢」 */}
      <button
        data-tour="analytics-health-btn"
        onClick={handleStartCheck}
        disabled={isAnalyzing}
        className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 active:scale-99 text-white font-black text-sm rounded-3xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        <Activity size={18} />
        <span>{isAnalyzing ? 'AI 正在計算恩格爾係數與會計模型中...' : '🩺 開始 AI 財務健檢 (生成經濟學與會計評估)'}</span>
      </button>

      {/* 歷史健檢存檔報告列表 */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
          <FileText size={16} className="text-amber-600" />
          <span>歷史健檢存檔報告 ({healthReports.length} 份)</span>
        </h3>

        {healthReports.length === 0 ? (
          <p className="text-xs text-stone-400 py-3 text-center">尚未生成任何健檢報告，點擊上方按鈕開始！</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {healthReports.map((report) => (
              <div
                key={report.id}
                onClick={() => onViewReport(report)}
                className="py-3 flex items-center justify-between hover:bg-stone-50 px-2 rounded-xl transition-colors cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900">{report.month} 財務健全報告</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                      評分 {report.score} 分
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">
                    恩格爾係數: {report.engelCoefficient}% • 固定支出比: {report.fixedExpenseRatio}%
                  </p>
                </div>
                <ChevronRight size={16} className="text-stone-400" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
