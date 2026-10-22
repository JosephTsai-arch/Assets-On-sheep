import React from 'react';
import { TourTopicId, UserTourProgress } from '../../types';
import { TOUR_TOPIC_CONFIGS } from '../../services/tourService';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import {
  X,
  Sparkles,
  CheckCircle2,
  Play,
  RotateCcw,
  Compass,
  ArrowRight,
  Award,
  BookOpen,
} from 'lucide-react';

interface TourHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: UserTourProgress;
  onStartTopic: (topicId: TourTopicId) => void;
  onStartFullTour: () => void;
  onResetProgress: () => void;
}

export const TourHubModal: React.FC<TourHubModalProps> = ({
  isOpen,
  onClose,
  progress,
  onStartTopic,
  onStartFullTour,
  onResetProgress,
}) => {
  if (!isOpen) return null;

  const completedCount = progress.completedTopics.length;
  const totalCount = TOUR_TOPIC_CONFIGS.length;
  const percent = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FAF7F2] rounded-3xl shadow-2xl border border-stone-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header 橫幅 */}
        <div className="p-5 sm:p-6 bg-white border-b border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-xs">
              <AssetSheepMascot size={38} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-stone-900 tracking-tight">
                  新手操作導覽學院
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  互動實戰指南
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                親自操作資產上羊各大功能，點亮引導、即時演練，隨時可按需求重複學習！
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

        {/* 進度條與快捷全套導覽按鈕 */}
        <div className="p-4 sm:px-6 bg-amber-50/50 border-b border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-stone-700">
              <span className="flex items-center gap-1.5">
                <Award size={14} className="text-amber-600" />
                <span>學習進度：{completedCount} / {totalCount} 主題已解鎖</span>
              </span>
              <span className="font-extrabold text-amber-800">{percent}%</span>
            </div>
            <div className="w-full bg-stone-200/80 h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-600 rounded-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onStartTopic('line_bot')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
              title="進入 LINE 官方機器人對話記帳實戰導覽"
            >
              <span>💬 LINE 機器人實戰記帳</span>
            </button>
            <button
              onClick={onStartFullTour}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles size={14} />
              <span>🚀 啟動全套完整導覽</span>
            </button>
          </div>
        </div>

        {/* 5 大主題列表清單 */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-3.5 flex-1">
          {TOUR_TOPIC_CONFIGS.map((topic, index) => {
            const isCompleted = progress.completedTopics.includes(topic.id);

            return (
              <div
                key={topic.id}
                onClick={() => onStartTopic(topic.id)}
                className={`group p-4 sm:p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isCompleted
                    ? 'bg-white border-stone-200/90 hover:border-emerald-300 shadow-xs'
                    : 'bg-white border-stone-200 hover:border-amber-400 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-xs bg-gradient-to-br ${topic.color} text-white`}
                  >
                    {topic.icon}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-black text-stone-400">
                        0{index + 1}
                      </span>
                      <h3 className="text-sm font-black text-stone-900 group-hover:text-amber-900 transition-colors">
                        {topic.title}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                        {topic.stepsCount} 個指引步驟
                      </span>
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={11} />
                          <span>已完成</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 font-medium leading-relaxed">
                      {topic.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartTopic(topic.id);
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      isCompleted
                        ? 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                        : 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                    }`}
                  >
                    {isCompleted ? <RotateCcw size={13} /> : <Play size={13} />}
                    <span>{isCompleted ? '重新複習' : '開始學習'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-stone-200 flex items-center justify-between shrink-0">
          <button
            onClick={() => {
              if (confirm('確定要重設導覽紀錄嗎？您將能從頭體驗所有徽章進度。')) {
                onResetProgress();
              }
            }}
            className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 font-bold transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>重設學習進度</span>
          </button>

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
