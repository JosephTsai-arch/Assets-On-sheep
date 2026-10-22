import React from 'react';
import {
  Sparkles,
  Check,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

export type WorkflowStep = 'INPUT' | 'PARSING' | 'REVIEW';

interface AiWorkflowBannerProps {
  initialData?: any;
  workflowStep: WorkflowStep;
  aiInputText: string;
  setAiInputText: (val: string) => void;
  onParse: () => void;
  onReset: () => void;
  parsedSummary: {
    amount?: number;
    title?: string;
    categoryName?: string;
    type?: string;
    splitWithNames?: string[];
  } | null;
  parseErrorMessage: string | null;
  currency: string;
}

export const AiWorkflowBanner: React.FC<AiWorkflowBannerProps> = ({
  initialData,
  workflowStep,
  aiInputText,
  setAiInputText,
  onParse,
  onReset,
  parsedSummary,
  parseErrorMessage,
  currency,
}) => {
  if (initialData) return null;

  return (
    <div className="space-y-3">
      {/* 🌟 工作流程可視化進度條 (Workflow Step Bar) 🌟 */}
      <div className="px-3.5 py-2 bg-stone-50/90 border border-stone-200/80 rounded-2xl">
        <div className="flex items-center justify-between text-[11px] font-bold">
          {/* Step 1 */}
          <div
            className={`flex items-center gap-1.5 transition-colors ${
              workflowStep === 'INPUT' ? 'text-emerald-700 font-extrabold' : 'text-stone-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                workflowStep === 'INPUT'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-stone-200 text-stone-600'
              }`}
            >
              1
            </span>
            <span>語意輸入</span>
          </div>

          <ArrowRight size={12} className="text-stone-300" />

          {/* Step 2 */}
          <div
            className={`flex items-center gap-1.5 transition-colors ${
              workflowStep === 'PARSING'
                ? 'text-emerald-700 font-extrabold animate-pulse'
                : 'text-stone-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                workflowStep === 'PARSING'
                  ? 'bg-emerald-600 text-white animate-spin'
                  : 'bg-stone-200 text-stone-600'
              }`}
            >
              {workflowStep === 'PARSING' ? <Loader2 size={11} /> : '2'}
            </span>
            <span>AI 智能解析</span>
          </div>

          <ArrowRight size={12} className="text-stone-300" />

          {/* Step 3 */}
          <div
            className={`flex items-center gap-1.5 transition-colors ${
              workflowStep === 'REVIEW' ? 'text-emerald-700 font-extrabold' : 'text-stone-400'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                workflowStep === 'REVIEW'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-stone-200 text-stone-600'
              }`}
            >
              {workflowStep === 'REVIEW' ? <Check size={11} strokeWidth={3} /> : '3'}
            </span>
            <span>審核與微調</span>
          </div>
        </div>
      </div>

      {/* 狀態 A: INPUT 階段 (語意輸入區塊) */}
      {workflowStep === 'INPUT' && (
        <div className="p-3.5 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border border-emerald-200/90 rounded-2xl space-y-2.5 transition-all shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
              <Sparkles size={15} className="text-emerald-600 animate-pulse" />
              <span>Gemini AI 語意快填</span>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              支援民國年、大額與分帳
            </span>
          </div>

          <div className="flex gap-2">
            <input
              data-tour="tx-ai-input-box"
              type="text"
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={aiInputText}
              onChange={(e) => setAiInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onParse();
                }
              }}
              placeholder="例如: 晚餐吃牛排現金250、買冰箱5萬"
              className="flex-1 px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-stone-400"
            />
            <button
              data-tour="tx-ai-parse-btn"
              type="button"
              onClick={onParse}
              disabled={!aiInputText.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm disabled:opacity-40 cursor-pointer flex items-center gap-1.5 transition active:scale-95"
            >
              <Sparkles size={13} />
              <span>一鍵解析</span>
            </button>
          </div>

          {/* 快速示範語句 */}
          <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-emerald-700/80 overflow-x-auto pb-0.5">
            <span className="shrink-0 font-bold text-stone-400">💡 試試看：</span>
            <button
              type="button"
              onClick={() => setAiInputText('買冰箱 5萬')}
              className="shrink-0 underline hover:text-emerald-900 cursor-pointer"
            >
              買冰箱 5萬
            </button>
            <span>・</span>
            <button
              type="button"
              onClick={() => setAiInputText('吃和牛 15000日幣跟媽媽分帳')}
              className="shrink-0 underline hover:text-emerald-900 cursor-pointer"
            >
              吃和牛跟媽媽分帳
            </button>
            <span>・</span>
            <button
              type="button"
              onClick={() => setAiInputText('高鐵票 1490')}
              className="shrink-0 underline hover:text-emerald-900 cursor-pointer"
            >
              高鐵票 1490
            </button>
          </div>
        </div>
      )}

      {/* 狀態 B: PARSING 階段 (解析中動態反饋) */}
      {workflowStep === 'PARSING' && (
        <div className="p-4 bg-emerald-50/90 border-2 border-emerald-400/80 rounded-2xl space-y-2 animate-pulse transition-all">
          <div className="flex items-center gap-2.5">
            <Loader2 size={18} className="text-emerald-600 animate-spin" />
            <div>
              <h4 className="text-xs font-extrabold text-emerald-950">
                Gemini AI 正在解析您的語意...
              </h4>
              <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                「{aiInputText}」➔ 正在提取金額、會計分類、幣別與分帳名單
              </p>
            </div>
          </div>
          <div className="w-full bg-emerald-200/60 h-1.5 rounded-full overflow-hidden mt-2">
            <div className="bg-emerald-600 h-full w-2/3 rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {/* 狀態 C: REVIEW / EDIT 階段 (成功解析即時視覺回饋) */}
      {workflowStep === 'REVIEW' && (
        <div className="p-3.5 bg-gradient-to-br from-emerald-50/90 to-blue-50/50 border border-emerald-300 rounded-2xl space-y-2 transition-all shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>
                {parsedSummary ? '🎉 AI 辨識完成！已自動填入各欄位' : '📝 審核與手動微調模式'}
              </span>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-stone-600 hover:text-stone-900 bg-white/80 hover:bg-white rounded-lg border border-stone-200 transition cursor-pointer active:scale-95"
            >
              <RotateCcw size={11} />
              <span>重新輸入</span>
            </button>
          </div>

          {parsedSummary && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {parsedSummary.amount && (
                <span className="px-2 py-0.5 bg-white text-emerald-800 text-[11px] font-extrabold rounded-md border border-emerald-200 shadow-2xs">
                  💰 {currency} {parsedSummary.amount.toLocaleString()}
                </span>
              )}
              {parsedSummary.categoryName && (
                <span className="px-2 py-0.5 bg-white text-blue-800 text-[11px] font-extrabold rounded-md border border-blue-200 shadow-2xs">
                  📂 {parsedSummary.categoryName}
                </span>
              )}
              {parsedSummary.title && (
                <span className="px-2 py-0.5 bg-white text-stone-700 text-[11px] font-bold rounded-md border border-stone-200 shadow-2xs">
                  📌 {parsedSummary.title}
                </span>
              )}
              {parsedSummary.splitWithNames && parsedSummary.splitWithNames.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[11px] font-extrabold rounded-md border border-amber-200 shadow-2xs">
                  👥 分帳: {parsedSummary.splitWithNames.join('、')}
                </span>
              )}
            </div>
          )}

          <p className="text-[11px] text-stone-500 font-medium">
            👉 系統已高亮標示 AI 快填欄位，您可在下方直接審核、點擊或修改任何數值。
          </p>
        </div>
      )}

      {/* 異常反饋 */}
      {parseErrorMessage && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900 font-medium">
          <AlertCircle size={15} className="text-amber-600 shrink-0" />
          <span>{parseErrorMessage}</span>
        </div>
      )}
    </div>
  );
};
