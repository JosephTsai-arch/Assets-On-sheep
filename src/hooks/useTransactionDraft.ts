import { useState, useEffect, useCallback } from 'react';
import { TransactionType } from '../types';

export interface SingleTransactionDraft {
  type: TransactionType;
  amount: string;
  title: string;
  date: string;
  ledgerId: string;
  accountId: string;
  subAccountId?: string;
  categoryId: string;
  note?: string;
  aiInputText?: string;
  updatedAt: number;
}

const DRAFT_PREFIX = 'aos_tx_modal_draft_';
const DRAFT_EXPIRY_MS = 30 * 60 * 1000; // 30 分鐘後視為放太久自動清除

export function useTransactionDraft(currentUserId: string, isOpen: boolean, isEditingExisting: boolean) {
  const [draft, setDraft] = useState<SingleTransactionDraft | null>(null);

  const getStorageKey = useCallback(() => {
    return `${DRAFT_PREFIX}${currentUserId || 'default'}`;
  }, [currentUserId]);

  // 當開啟視窗且為「新增」記帳時，檢查是否有有效草稿
  useEffect(() => {
    if (isOpen && !isEditingExisting) {
      try {
        const key = getStorageKey();
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as SingleTransactionDraft;
          const ageMs = Date.now() - (parsed.updatedAt || 0);
          if (ageMs > DRAFT_EXPIRY_MS) {
            // 過太久自動清除
            localStorage.removeItem(key);
            setDraft(null);
          } else if (parsed.title?.trim() || parsed.amount?.trim() || parsed.aiInputText?.trim()) {
            setDraft(parsed);
          }
        } else {
          setDraft(null);
        }
      } catch (e) {
        console.warn('[useTransactionDraft] 讀取草稿失敗:', e);
      }
    } else if (!isOpen) {
      setDraft(null);
    }
  }, [isOpen, isEditingExisting, getStorageKey]);

  // 儲存草稿
  const saveDraft = useCallback(
    (data: Omit<SingleTransactionDraft, 'updatedAt'>) => {
      if (isEditingExisting) return; // 編輯歷史明細不存入新增草稿
      try {
        const key = getStorageKey();
        if (data.title?.trim() || data.amount?.trim() || data.aiInputText?.trim()) {
          const payload: SingleTransactionDraft = {
            ...data,
            updatedAt: Date.now(),
          };
          localStorage.setItem(key, JSON.stringify(payload));
          setDraft(payload);
        }
      } catch (e) {
        console.warn('[useTransactionDraft] 儲存草稿失敗:', e);
      }
    },
    [isEditingExisting, getStorageKey]
  );

  // 清除草稿 (成功入帳或手動捨棄)
  const clearDraft = useCallback(() => {
    try {
      const key = getStorageKey();
      localStorage.removeItem(key);
      setDraft(null);
    } catch (e) {
      console.warn('[useTransactionDraft] 清除草稿失敗:', e);
    }
  }, [getStorageKey]);

  return {
    draft,
    saveDraft,
    clearDraft,
  };
}
