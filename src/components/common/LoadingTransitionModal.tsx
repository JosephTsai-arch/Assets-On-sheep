import React, { useState, useEffect, useRef } from 'react';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import { RotateCw, ArrowRight } from 'lucide-react';

interface LoadingTransitionModalProps {
  show: boolean;
  loadingStatus?: 'idle' | 'loading' | 'retrying' | 'ready' | 'stalled';
  onRetry?: () => void;
  onDismiss?: () => void;
  userName?: string;
}

export const LoadingTransitionModal: React.FC<LoadingTransitionModalProps> = ({
  show,
  loadingStatus = 'loading',
  onRetry,
  onDismiss,
  userName,
}) => {
  const [progress, setProgress] = useState(15);
  const [stepText, setStepText] = useState('正在建立安全資料連線...');
  const [isRendered, setIsRendered] = useState(show);
  const [fadeOut, setFadeOut] = useState(false);
  const [autoStalled, setAutoStalled] = useState(false);

  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearAllTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => {
    clearAllTimers();

    if (show) {
      setIsRendered(true);
      setFadeOut(false);
      setAutoStalled(false);
      setProgress(15);
      setStepText('正在建立安全資料連線...');

      // 階段 1：1 秒抵達 45%
      timersRef.current.push(
        setTimeout(() => {
          setProgress(45);
          setStepText('同步個人與共管帳本...');
        }, 1000)
      );

      // 階段 2：2.2 秒抵達 75%
      timersRef.current.push(
        setTimeout(() => {
          setProgress(75);
          setStepText('核算收支與各錢包資產餘額...');
        }, 2200)
      );

      // 階段 3：3.3 秒抵達 92%
      timersRef.current.push(
        setTimeout(() => {
          setProgress(92);
          setStepText('即將完成載入...');
        }, 3300)
      );

      // 階段 4：4.5 秒自動觸發高速重試提示
      timersRef.current.push(
        setTimeout(() => {
          setProgress(95);
          setStepText('⚡ 正在啟用高速通道無縫對齊中...');
        }, 4500)
      );

      // 階段 5：6 秒守護門檻：若仍未完成載入，優雅展開卡住輔助卡片與重整按鈕
      timersRef.current.push(
        setTimeout(() => {
          setAutoStalled(true);
          setProgress(96);
          setStepText('連線時間較長，可立即重新整理或直接進入');
        }, 6000)
      );

      // 階段 6：12 秒逃生門：若長時間未操作，自動放行進入首頁
      timersRef.current.push(
        setTimeout(() => {
          if (onDismiss) {
            onDismiss();
          }
        }, 12000)
      );

      return () => clearAllTimers();
    } else {
      // 成功結束時迅速衝到 100% 並啟動淡出動畫
      setProgress(100);
      setStepText('載入完成！');
      setFadeOut(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [show, onDismiss]);

  // 當核心資料確認就緒，進度條直接衝刺至 100%
  useEffect(() => {
    if (loadingStatus === 'ready' && progress < 100) {
      setProgress(100);
      setStepText('載入完成！');
    }
  }, [loadingStatus, progress]);

  const handleManualRetry = () => {
    setAutoStalled(false);
    setProgress(35);
    setStepText('⚡ 正在重新拉取最新帳本...');
    if (onRetry) {
      onRetry();
    }
  };

  const handleDirectEnter = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  if (!isRendered) return null;

  const isStalled = loadingStatus === 'stalled' || autoStalled;
  const isRetrying = loadingStatus === 'retrying';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#FAF7F2]/95 backdrop-blur-md transition-opacity duration-300 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center text-center max-w-sm w-full mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* 溫馨吉祥物圖示 */}
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-white shadow-lg border border-emerald-100/80 flex items-center justify-center animate-bounce-subtle">
            <AssetSheepMascot size={72} />
          </div>
          <span className="absolute -bottom-1 -right-1 px-2 py-0.5 bg-emerald-600 text-white font-extrabold text-[10px] rounded-full shadow-xs">
            {progress}%
          </span>
        </div>

        {/* 標題與引導語 */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-extrabold text-stone-900 tracking-tight">
            {userName ? `早安，${userName}！` : '資產上羊'}
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            {isRetrying
              ? '⚡ 正在啟動高速專線自動對齊帳本中...'
              : isStalled
              ? '連線似乎稍有延遲，請稍候或手動重試'
              : stepText}
          </p>
        </div>

        {/* 呼吸進度條 */}
        <div className="w-full bg-stone-200/70 h-2 rounded-full overflow-hidden shadow-inner p-0.5 border border-stone-200">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isStalled
                ? 'bg-amber-500'
                : isRetrying
                ? 'bg-indigo-600'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 逾時/卡住時的友善提示卡片 */}
        {isStalled ? (
          <div className="w-full p-4 bg-amber-50/95 border border-amber-200 rounded-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2 shadow-xs">
            <div className="flex items-center gap-2 text-amber-900 text-left">
              <span className="text-lg">🐑</span>
              <p className="text-xs font-bold leading-relaxed">
                資料讀取時間較長，通常重新整理後能在 4 秒內正常載入！
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualRetry}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCw size={13} />
                <span>立即重新整理</span>
              </button>
              <button
                type="button"
                onClick={handleDirectEnter}
                className="px-3.5 py-2.5 bg-white hover:bg-stone-50 active:scale-95 text-stone-700 font-bold text-xs rounded-xl border border-stone-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>直接進入</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-stone-400 font-normal">
            全帳本融合總覽・為您呈現最完整的資產概況
          </p>
        )}
      </div>
    </div>
  );
};
