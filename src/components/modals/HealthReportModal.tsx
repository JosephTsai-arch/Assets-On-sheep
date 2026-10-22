import React from 'react';
import { HealthReport } from '../../types';
import { X, Award, PieChart, Activity, TrendingUp, ShieldCheck } from 'lucide-react';

interface HealthReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: HealthReport | null;
}

export const HealthReportModal: React.FC<HealthReportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!isOpen || !report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🩺</span>
            <div>
              <h2 className="text-base font-extrabold text-stone-900">個體財務結構健全度評估報告</h2>
              <p className="text-[10px] text-stone-400 font-medium">
                經濟學與會計學架構分析・分析週期：{report.month}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-stone-800">
          {/* Top Score Banner */}
          <div className="p-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl text-white flex items-center justify-between shadow-md">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold opacity-90">財務穩健綜合指數</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-4xl font-black">{report.score}</span>
                <span className="text-xs opacity-75">/ 100</span>
              </div>
              <p className="text-xs opacity-90 mt-1">{report.savingsHealthEvaluation}</p>
            </div>
            <Award size={48} className="opacity-80 shrink-0" />
          </div>

          {/* 3 Core Economic Ratios Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-stone-50 border border-stone-200/70 rounded-2xl">
              <div className="flex items-center gap-2 text-stone-500 mb-1">
                <PieChart size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-stone-700">恩格爾係數 (Engel's Coeff.)</span>
              </div>
              <p className="text-2xl font-black text-stone-900">{report.engelCoefficient}%</p>
              <p className="text-[10px] text-stone-400 mt-1">食品消費佔總消費比率 (國際富裕標準 &lt; 30%)</p>
            </div>

            <div className="p-3.5 bg-stone-50 border border-stone-200/70 rounded-2xl">
              <div className="flex items-center gap-2 text-stone-500 mb-1">
                <Activity size={16} className="text-indigo-600" />
                <span className="text-xs font-bold text-stone-700">固定資本支出比率</span>
              </div>
              <p className="text-2xl font-black text-stone-900">{report.fixedExpenseRatio}%</p>
              <p className="text-[10px] text-stone-400 mt-1">沉澱基金與常態固定開銷對營收之承擔率</p>
            </div>
          </div>

          {/* Summary Box */}
          <div className="p-4 bg-amber-50/60 border border-amber-200/70 rounded-2xl">
            <h4 className="text-xs font-bold text-amber-900 mb-1.5 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-amber-700" />
              <span>經濟與流動性分析摘要</span>
            </h4>
            <p className="text-xs text-stone-700 leading-relaxed break-words">{report.summary}</p>
          </div>

          {/* CFA / Accounting Recommendations */}
          <div>
            <h4 className="text-xs font-bold text-stone-700 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>資產負債與邊際配置優化建議</span>
            </h4>
            <div className="space-y-1.5">
              {report.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 bg-stone-50 rounded-xl border border-stone-100 text-xs text-stone-700">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="break-words leading-relaxed min-w-0 flex-1">{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
