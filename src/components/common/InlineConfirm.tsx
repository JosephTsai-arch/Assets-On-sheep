import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface InlineConfirmProps {
  onConfirm: () => void | Promise<void>;
  title?: string;
  confirmText?: string;
  triggerButton?: React.ReactNode;
  className?: string;
}

export const InlineConfirm: React.FC<InlineConfirmProps> = ({
  onConfirm,
  title = '確定要刪除嗎？此操作將進行軟刪除並同步回滾資產。',
  confirmText = '確定軟刪除',
  triggerButton,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting]);

  const handleConfirm = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await onConfirm();
      setIsOpen(false);
    } catch (err) {
      console.error('軟刪除操作失敗:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 觸發按鈕：保持固定尺寸，點擊時不改變父層排版寬度，絕不破圖 */}
      {triggerButton ? (
        <span onClick={handleTriggerClick}>{triggerButton}</span>
      ) : (
        <button
          type="button"
          onClick={handleTriggerClick}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isOpen
              ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
              : 'text-stone-400 hover:text-rose-600 hover:bg-rose-50/60'
          }`}
          title="軟刪除"
        >
          <Trash2 size={14} />
        </button>
      )}

      {/* 透過 React Portal 掛載至 document.body，徹底脫離任何父層卡片、圖框或對話框的 overflow-hidden 裁切與 stacking context 遮擋 */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-150"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDeleting) {
                setIsOpen(false);
              }
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="w-full max-w-sm sm:max-w-md bg-white border border-stone-200 shadow-2xl rounded-3xl p-5 sm:p-6 text-left space-y-4 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl shrink-0 mt-0.5">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm sm:text-base font-black text-rose-950 break-words leading-snug">
                    {title}
                  </h4>
                  <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                    此操作為軟刪除，可保障歷史對帳紀錄與資產安全。若日後需要亦可在災難中心深度復原。
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
                  title="關閉"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition-all disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirm}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? '處理中...' : confirmText}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
