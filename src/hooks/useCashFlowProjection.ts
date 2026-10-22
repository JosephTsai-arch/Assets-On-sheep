import { useMemo } from 'react';
import { Transaction, SinkingFund } from '../types';
import {
  calculate12MonthCashProjection,
  ProjectionRadarResult,
  RecurringItemLike,
  MonthProjection,
} from '../utils/projectionMath';
import { getCurrentYearMonth } from '../utils/formatters';

export interface UseCashFlowProjectionOptions {
  initialBalance: number; // 初始系統總資產 (當前所有帳戶餘額總和)
  transactions: Transaction[]; // 真實歷史交易清單 (自動回推近半年)
  recurringItems: (RecurringItemLike | SinkingFund)[]; // 固定收支排程項目清單
  currentYearMonth?: string; // 基準計算月份 (預設當月: YYYY-MM)
}

export interface UseCashFlowProjectionReturn extends ProjectionRadarResult {
  firstWarningMonth: MonthProjection | null; // 第一個發生透支的月份物件
  safeMonthsCount: number; // 未來 12 個月中處於安全邊界 (>= 0) 的月數
  netMonthlyBurnRate: number; // 當月日常收支淨損耗 (若為負數代表每月淨消耗資產)
  radarStatusText: string; // 雷達狀態文案
  radarSeverity: 'safe' | 'warning' | 'danger'; // 風險嚴重程度
}

/**
 * Dashboard 專屬 React Hook：未來 12 個月現金流預測與透支雷達
 *
 * - 純計算記憶化封裝 (Side-effect free / useMemo)
 * - 調用 projectionMath 演算法，納入「近半年平均日常浮動結餘」
 * - 提供儀表板圖表與預警狀態燈所需之衍生欄位
 */
export function useCashFlowProjection({
  initialBalance,
  transactions,
  recurringItems,
  currentYearMonth,
}: UseCashFlowProjectionOptions): UseCashFlowProjectionReturn {
  const baseMonth = useMemo(
    () => currentYearMonth || getCurrentYearMonth(),
    [currentYearMonth]
  );

  // 核心純函式計算：未來 12 個月遞迴現金流
  const projectionResult = useMemo(() => {
    return calculate12MonthCashProjection(
      initialBalance,
      transactions,
      recurringItems,
      baseMonth
    );
  }, [initialBalance, transactions, recurringItems, baseMonth]);

  // 衍生指標分析 (無副作用)
  const analysis = useMemo(() => {
    const { monthlyProjections, hasAnyWarning, averageFloatingBalance } = projectionResult;

    // 找出首個透支月份
    const firstWarning = monthlyProjections.find((m) => m.isWarning) || null;

    // 統計安全月份數量
    const safeCount = monthlyProjections.filter((m) => !m.isWarning).length;

    // 判斷風險層級與文案
    let severity: 'safe' | 'warning' | 'danger' = 'safe';
    let statusText = '🌱 資金鏈充裕：未來 12 個月餘額均在安全邊界';

    if (hasAnyWarning) {
      if (firstWarning && monthlyProjections.indexOf(firstWarning) <= 2) {
        severity = 'danger';
        statusText = `🚨 緊急預警：預計將於 ${firstWarning.monthDisplay} 出現透支赤字！`;
      } else {
        severity = 'warning';
        statusText = `⚠️ 透支警示：預計將於 ${firstWarning?.monthDisplay || '下半年'} 出現透支風險`;
      }
    }

    return {
      firstWarningMonth: firstWarning,
      safeMonthsCount: safeCount,
      netMonthlyBurnRate: averageFloatingBalance,
      radarStatusText: statusText,
      radarSeverity: severity,
    };
  }, [projectionResult]);

  return {
    ...projectionResult,
    ...analysis,
  };
}
