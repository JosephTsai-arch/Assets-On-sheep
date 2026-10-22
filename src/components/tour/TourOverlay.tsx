import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TourStep, TourTopicId } from '../../types';
import { TOUR_TOPIC_CONFIGS } from '../../services/tourService';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Play,
  RotateCcw,
} from 'lucide-react';

interface TourOverlayProps {
  currentStep: TourStep | null;
  currentTopicId: TourTopicId | null;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onAutoAction?: (step: TourStep) => void;
}

export const TourOverlay: React.FC<TourOverlayProps> = ({
  currentStep,
  currentTopicId,
  onNext,
  onPrev,
  onClose,
  onAutoAction,
}) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<'top' | 'bottom' | 'left' | 'right' | 'center'>('bottom');
  const popoverRef = useRef<HTMLDivElement>(null);

  const topicConfig = TOUR_TOPIC_CONFIGS.find((t) => t.id === currentTopicId);

  // 定位並計算目標元素座標
  const updatePosition = useCallback(() => {
    if (!currentStep) return;

    if (!currentStep.targetSelector) {
      setTargetRect(null);
      setPlacement('center');
      return;
    }

    const el = document.querySelector(currentStep.targetSelector);
    if (!el) {
      setTargetRect(null);
      setPlacement('center');
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    // 平滑滾動至可視區域
    const inView =
      rect.top >= 80 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) - 80;
    if (!inView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 計算 Popover 浮動位置
    const popoverWidth = 360;
    const popoverHeight = 220;
    const padding = 16;
    const preferred = currentStep.placement || 'bottom';

    let top = 0;
    let left = 0;
    let actualPlacement = preferred;

    if (preferred === 'bottom') {
      top = rect.bottom + padding;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      // 溢出下方則轉為上方
      if (top + popoverHeight > window.innerHeight) {
        top = Math.max(10, rect.top - popoverHeight - padding);
        actualPlacement = 'top';
      }
    } else if (preferred === 'top') {
      top = rect.top - popoverHeight - padding;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      // 溢出上方則轉為下方
      if (top < 10) {
        top = rect.bottom + padding;
        actualPlacement = 'bottom';
      }
    } else if (preferred === 'right') {
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.right + padding;
      // 溢出右側則轉為下方
      if (left + popoverWidth > window.innerWidth) {
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - popoverWidth / 2;
        actualPlacement = 'bottom';
      }
    } else if (preferred === 'left') {
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left - popoverWidth - padding;
      // 溢出左側則轉為下方
      if (left < 10) {
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - popoverWidth / 2;
        actualPlacement = 'bottom';
      }
    } else {
      actualPlacement = 'center';
    }

    // 水平防溢出邊界校正
    left = Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, left));
    top = Math.max(16, Math.min(window.innerHeight - popoverHeight - 16, top));

    setPlacement(actualPlacement);
    setPopoverPos({ top, left });
  }, [currentStep]);

  useEffect(() => {
    updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    const timer = setTimeout(updatePosition, 150);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      clearTimeout(timer);
    };
  }, [updatePosition]);

  if (!currentStep) return null;

  const isCenter = placement === 'center' || !targetRect;
  const isLastStep = currentStep.stepNumber === currentStep.totalSteps;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto overflow-hidden animate-in fade-in duration-200">
      {/* SVG 聚光燈遮罩 (Cutout Overlay) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <mask id="tour-spotlight-mask">
            {/* 白色表示完全遮蔽（暗色背景） */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* 黑色鏤空高亮目標元素 */}
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="14"
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* 半透明調暗背景 */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.72)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* 目標元素的呼吸動態邊框光暈 */}
      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-2xl ring-4 ring-amber-400/80 shadow-[0_0_25px_rgba(251,191,36,0.6)] animate-pulse transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* 浮動導覽指引卡 (Tooltip Popover) */}
      <div
        ref={popoverRef}
        className={`absolute z-[10000] w-[90vw] max-w-[370px] bg-white rounded-3xl p-5 shadow-2xl border-2 border-amber-300 text-stone-800 transition-all duration-200 select-text ${
          isCenter
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : ''
        }`}
        style={!isCenter ? { top: popoverPos.top, left: popoverPos.left } : {}}
      >
        {/* 卡片頂部：吉祥物、主題標籤與進度 */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0">
              <AssetSheepMascot size={26} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-full inline-block">
                {topicConfig?.title || '新手引導'}
              </span>
              <p className="text-[11px] font-bold text-stone-500 mt-0.5">
                步驟 {currentStep.stepNumber} / {currentStep.totalSteps}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all cursor-pointer"
            title="隨時結束導覽"
          >
            <X size={16} />
          </button>
        </div>

        {/* 卡片本體：標題與精確好懂文字 */}
        <div className="py-3 space-y-2">
          <h3 className="text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5">
            <span>{currentStep.title}</span>
          </h3>
          <p className="text-xs text-stone-600 leading-relaxed font-medium">
            {currentStep.description}
          </p>

          {/* 行動提示標籤 */}
          {currentStep.actionPrompt && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-extrabold mt-1">
              <span>{currentStep.actionPrompt}</span>
            </div>
          )}
        </div>

        {/* 底部導覽按鈕群 */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-stone-400 hover:text-stone-600 px-2 py-1 transition-colors cursor-pointer"
          >
            暫停導覽
          </button>

          <div className="flex items-center gap-2">
            {currentStep.stepNumber > 1 && (
              <button
                onClick={onPrev}
                className="flex items-center gap-0.5 px-2.5 py-1.5 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all cursor-pointer"
                title="上一步"
              >
                <ChevronLeft size={14} />
                <span>上一步</span>
              </button>
            )}

            {/* 一鍵代填/幫我操作按鈕 (提升流暢度) */}
            {currentStep.autoActionText && onAutoAction && (
              <button
                onClick={() => onAutoAction(currentStep)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-black text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
                title="幫我自動示範操作"
              >
                <Sparkles size={13} className="text-amber-700" />
                <span>{currentStep.autoActionText}</span>
              </button>
            )}

            <button
              onClick={onNext}
              className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>{isLastStep ? '完成主題 🎉' : '下一步'}</span>
              {!isLastStep && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
