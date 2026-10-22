import React, { useState, useRef } from 'react';
import {
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
  List,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { UseCashFlowProjectionReturn } from '../../hooks/useCashFlowProjection';
import { MonthProjection } from '../../utils/projectionMath';

interface OverdraftRadarSectionProps {
  projection: UseCashFlowProjectionReturn;
  currentBalance: number;
}

export const OverdraftRadarSection: React.FC<OverdraftRadarSectionProps> = ({
  projection,
  currentBalance,
}) => {
  const [radarViewMode, setRadarViewMode] = useState<'both' | 'balance' | 'expense'>('both');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(0);
  // 手機版雷達展現樣式：'list' (直向好讀雙長條圖) | 'chart' (橫向柱狀走勢圖)
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'list' | 'chart'>('list');
  const chartScrollRef = useRef<HTMLDivElement>(null);

  const scrollMonths = (target: 'first' | 'second') => {
    if (!chartScrollRef.current) return;
    const scrollAmount = chartScrollRef.current.scrollWidth / 2;
    chartScrollRef.current.scrollTo({
      left: target === 'first' ? 0 : scrollAmount,
      behavior: 'smooth',
    });
  };

  const maxAsset = Math.max(
    ...projection.monthlyProjections.map((p) => Math.abs(p.projectedBalance)),
    10000
  );

  const maxExpense = Math.max(
    ...projection.monthlyProjections.map((p) => p.dueExpenses || 0),
    1000
  );

  const selectedMonth =
    projection.monthlyProjections[selectedMonthIndex] || projection.monthlyProjections[0];

  const formatCompactAmount = (num: number): string => {
    if (Math.abs(num) >= 1000000) {
      return `${(num / 10000).toFixed(0)}萬`;
    }
    if (Math.abs(num) >= 10000) {
      return `${(num / 10000).toFixed(1)}萬`;
    }
    return formatCurrency(num);
  };

  return (
    <div id="radar-section" data-tour="overview-radar-card" className="bg-white rounded-3xl p-4 sm:p-6 border border-stone-200 shadow-xs space-y-4 max-w-full overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <TrendingDown size={18} className="text-indigo-600" />
            <span>未來 12 個月資金預測與透支雷達圖</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            逐月模擬未來 12 個月：包含每月預測固定支出與預測資產總額對比；結餘 &lt; 0 標示為危險紅色透支預警
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {/* 顯示型態切換：長條清單 (手機推薦) vs 柱狀全覽 */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setMobileDisplayMode('list')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                mobileDisplayMode === 'list'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <List size={13} />
              <span>📱 長條清單</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileDisplayMode('chart')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                mobileDisplayMode === 'chart'
                  ? 'bg-white text-indigo-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <BarChart3 size={13} />
              <span>📊 柱狀全覽</span>
            </button>
          </div>

          {/* 視圖篩選 (雙柱/資產/固定支出) */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setRadarViewMode('both')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                radarViewMode === 'both' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              雙長條
            </button>
            <button
              type="button"
              onClick={() => setRadarViewMode('balance')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                radarViewMode === 'balance' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              預測資產
            </button>
            <button
              type="button"
              onClick={() => setRadarViewMode('expense')}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                radarViewMode === 'expense' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              固定支出
            </button>
          </div>

          <span className="text-[11px] font-bold px-2.5 py-1 bg-stone-100 text-stone-700 rounded-xl shrink-0">
            初始資產：{formatCurrency(currentBalance)}
          </span>
        </div>
      </div>

      {/* 模式 A：手機版推薦直向雙長條圖清單 (100% 響應式，數值、長條比例與透支警示清晰，絕不破圖) */}
      {mobileDisplayMode === 'list' && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projection.monthlyProjections.map((m, idx) => {
              const isSelected = selectedMonthIndex === idx;
              const isOver = m.isWarning || m.projectedBalance < 0;
              const isDropping = m.isWaterLevelDropping || m.projectedBalance < m.startingBalance;
              const isRed = isOver || isDropping;

              // 資產長條寬度百分比 (有最小寬度 6% 保證視覺可讀)
              const assetWidthPercent = Math.max(
                6,
                Math.min(100, Math.round((Math.abs(m.projectedBalance) / maxAsset) * 100))
              );

              // 固定支出長條寬度百分比
              const expenseWidthPercent = m.dueExpenses > 0
                ? Math.max(6, Math.min(100, Math.round((m.dueExpenses / maxExpense) * 100)))
                : 0;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedMonthIndex(idx)}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-200 shadow-xs'
                      : isRed
                      ? 'bg-red-50/30 border-red-200 hover:border-red-300'
                      : 'bg-stone-50/60 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  {/* 月份標頭與預警徽章 */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-extrabold text-sm text-stone-900 truncate">
                        📅 {m.monthStr} ({m.monthDisplay})
                      </span>
                      <span className="text-[10px] font-bold text-stone-500 bg-white border border-stone-200 px-1.5 py-0.5 rounded-md shrink-0">
                        第 {idx + 1} 個月
                      </span>
                    </div>
                    {isOver ? (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-red-100 text-red-700 rounded-lg flex items-center gap-1 shrink-0">
                        <AlertTriangle size={12} />
                        <span>⚠️ 透支警戒</span>
                      </span>
                    ) : isDropping ? (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-rose-100 text-rose-700 rounded-lg flex items-center gap-1 shrink-0">
                        <TrendingDown size={12} />
                        <span>⚠️ 資產水位下降</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg flex items-center gap-1 shrink-0">
                        <ShieldCheck size={12} />
                        <span>✓ 資金安全</span>
                      </span>
                    )}
                  </div>

                  {/* 長條圖 1：預測資產總額 */}
                  {(radarViewMode === 'both' || radarViewMode === 'balance') && (
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-600 font-bold flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${isRed ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          <span>預測資產總額</span>
                        </span>
                        <span className={`font-black tabular-nums text-xs sm:text-sm ${isRed ? 'text-red-600' : 'text-emerald-700'}`}>
                          {formatCurrency(m.projectedBalance)}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-stone-200/80 rounded-full overflow-hidden p-0.5">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isRed
                              ? 'bg-gradient-to-r from-red-500 to-rose-400'
                              : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          }`}
                          style={{ width: `${assetWidthPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 長條圖 2：每月的預測固定支出 */}
                  {(radarViewMode === 'both' || radarViewMode === 'expense') && (
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-600 font-bold flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
                          <span>預測固定支出</span>
                        </span>
                        <span className="font-black text-amber-700 tabular-nums text-xs sm:text-sm">
                          {m.dueExpenses > 0 ? `-${formatCurrency(m.dueExpenses)}` : 'NT$ 0'}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-stone-200/80 rounded-full overflow-hidden p-0.5">
                        {m.dueExpenses > 0 ? (
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                            style={{ width: `${expenseWidthPercent}%` }}
                          />
                        ) : (
                          <div className="h-full w-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 當月數據摘要 (日常變動支出與排程扣款標籤) */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-stone-200/60 text-[11px] text-stone-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-stone-600">
                        變動支出均值：-{formatCurrency(m.averageVariableExpense)}
                      </span>
                      {(m.dueIncomes || 0) > 0 && (
                        <span className="text-teal-700 font-bold">
                          固定收入：+{formatCurrency(m.dueIncomes || 0)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isDropping && !isOver && (
                        <span className="text-rose-600 font-bold flex items-center gap-0.5">
                          <TrendingDown size={11} />
                          <span>資產水位下降</span>
                        </span>
                      )}
                      {m.dueFunds && m.dueFunds.filter((f) => f.type !== 'income').length > 0 && (
                        <span className="text-stone-400 text-[10px]">
                          {m.dueFunds.filter((f) => f.type !== 'income').length} 筆固定支出
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 展開當月固定支出項目小徽章 */}
                  {m.dueFunds && m.dueFunds.filter((f) => f.type !== 'income').length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-stone-200/40 flex flex-wrap gap-1">
                      {m.dueFunds
                        .filter((f) => f.type !== 'income')
                        .map((item, fIdx) => (
                          <span
                            key={fIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-stone-200 rounded-md text-[10px] font-bold text-stone-700"
                          >
                            <span className="truncate max-w-[100px]">{item.title}</span>
                            <span className="text-amber-700 tabular-nums">-{formatCurrency(item.amount)}</span>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 模式 B：橫向柱狀走勢圖 (支援手機平滑滾動、前後6個月快速跳轉與點選即看明細) */}
      {mobileDisplayMode === 'chart' && (
        <div className="space-y-3 pt-1">
          {/* 手機快速導航按鈕列 */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[11px] text-stone-500 font-medium">
              👉 左右滑動查閱完整 12 個月或快速跳轉：
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollMonths('first')}
                className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
              >
                1 ~ 6 月
              </button>
              <button
                type="button"
                onClick={() => scrollMonths('second')}
                className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 rounded-lg text-[11px] font-bold cursor-pointer transition-all"
              >
                7 ~ 12 月
              </button>
            </div>
          </div>

          {/* 12 個月份直向長條走勢容器 */}
          <div ref={chartScrollRef} className="w-full overflow-x-auto pb-2 scrollbar-thin">
            <div className="min-w-[640px] sm:min-w-0 grid grid-cols-12 gap-1.5 sm:gap-2.5 items-end h-56 pt-8 pb-3 border-b border-stone-200">
              {projection.monthlyProjections.map((m, idx) => {
                const isSelected = selectedMonthIndex === idx;
                const isOver = m.isWarning || m.projectedBalance < 0;
                const isDropping = m.isWaterLevelDropping || m.projectedBalance < m.startingBalance;
                const isRed = isOver || isDropping;

                // 資產長條高度百分比
                const assetHeightPercent = Math.max(
                  14,
                  Math.min(100, Math.round((Math.abs(m.projectedBalance) / maxAsset) * 100))
                );

                // 固定支出長條高度百分比
                const expenseHeightPercent = m.dueExpenses > 0
                  ? Math.max(10, Math.min(95, Math.round((m.dueExpenses / maxExpense) * 100)))
                  : 4;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedMonthIndex(idx)}
                    className={`flex flex-col items-center justify-end h-full group relative cursor-pointer p-1 rounded-2xl transition-all ${
                      isSelected ? 'bg-indigo-50/70 ring-2 ring-indigo-400' : 'hover:bg-stone-50'
                    }`}
                  >
                    {/* 懸浮 Tooltip (桌面版) */}
                    <div className={`opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 z-30 pointer-events-none bg-stone-900 text-white text-[10px] p-2.5 rounded-xl max-w-[220px] shadow-xl break-words ${idx < 3 ? 'left-0' : idx > 8 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                      <p className="font-bold text-xs">{m.monthStr} ({m.monthDisplay})</p>
                      <p className={`${isRed ? 'text-red-400' : 'text-emerald-400'} mt-1`}>預測資產總額: {formatCurrency(m.projectedBalance)}</p>
                      <p className="text-amber-400">預測固定支出: -{formatCurrency(m.dueExpenses)}</p>
                      {(m.dueIncomes || 0) > 0 && (
                        <p className="text-teal-300">固定收入進帳: +{formatCurrency(m.dueIncomes || 0)}</p>
                      )}
                      <p className="text-stone-300">變動支出均值: -{formatCurrency(m.averageVariableExpense)}</p>
                      {isOver ? (
                        <p className="text-red-400 font-bold mt-1">⚠️ 透支警告 (赤字風險)！</p>
                      ) : isDropping ? (
                        <p className="text-rose-300 font-bold mt-1">📉 資產水位下降 (低於上月)</p>
                      ) : (
                        <p className="text-emerald-300 font-bold mt-1">📈 資金安全 (水位上升)</p>
                      )}
                    </div>

                    {/* 頂部簡易金額標籤 (防文字折行與破圖) */}
                    <div className="w-full text-center mb-1.5 space-y-0.5">
                      {(radarViewMode === 'both' || radarViewMode === 'expense') && m.dueExpenses > 0 && (
                        <span className="block text-[9px] font-bold text-amber-800 bg-amber-100/90 px-1 py-0.5 rounded truncate max-w-full">
                          -{formatCompactAmount(m.dueExpenses)}
                        </span>
                      )}
                      {(radarViewMode === 'both' || radarViewMode === 'balance') && (
                        <span className={`block text-[9px] font-bold px-1 py-0.5 rounded truncate max-w-full ${
                          isRed ? 'text-red-700 bg-red-100/90' : 'text-stone-700 bg-stone-100/90'
                        }`}>
                          {formatCompactAmount(m.projectedBalance)}
                        </span>
                      )}
                    </div>

                    {/* 雙柱體或單柱體容器 */}
                    <div className="flex items-end justify-center gap-1 w-full flex-1 min-h-[90px]">
                      {/* 長條 1: 預測資產總額 */}
                      {(radarViewMode === 'both' || radarViewMode === 'balance') && (
                        <div
                          className={`flex-1 max-w-[16px] sm:max-w-[20px] rounded-t-md transition-all duration-300 ${
                            isRed
                              ? 'bg-red-500 ring-2 ring-red-300'
                              : 'bg-emerald-500/85 hover:bg-emerald-600'
                          }`}
                          style={{ height: `${assetHeightPercent}%` }}
                          title={`預測資產總額: ${formatCurrency(m.projectedBalance)} (${isRed ? '水位下降/赤字' : '水位上升/安全'})`}
                        />
                      )}

                      {/* 長條 2: 預測固定支出 */}
                      {(radarViewMode === 'both' || radarViewMode === 'expense') && (
                        <div
                          className={`flex-1 max-w-[16px] sm:max-w-[20px] rounded-t-md transition-all duration-300 ${
                            m.dueExpenses > 0
                              ? 'bg-amber-500 hover:bg-amber-600'
                              : 'bg-stone-200'
                          }`}
                          style={{ height: `${expenseHeightPercent}%` }}
                          title={`預測固定支出: ${formatCurrency(m.dueExpenses)}`}
                        />
                      )}
                    </div>

                    {/* X 軸月份標籤 */}
                    <div className="text-center mt-2">
                      <span className={`block text-[10px] font-bold ${
                        isSelected
                          ? 'text-indigo-600 font-black'
                          : isRed
                          ? 'text-red-600 font-black'
                          : 'text-stone-600'
                      }`}>
                        {m.monthDisplay}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 圖例說明 */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-stone-500 pt-1">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span>預測資產總額 (結餘上升/資金安全)</span>
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            <span className="text-red-600 font-bold">預測資產總額 (水位下降 / 透支預警)</span>
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            <span className="text-amber-800 font-bold">每月份預測固定支出</span>
          </span>
        </div>
        <span className="text-[10px] text-stone-400">※ 點選任意月份可展開當月精算卡</span>
      </div>

      {/* 點選月份之精算詳情卡 (保證各螢幕尺寸 100% 易讀且絕不破圖) */}
      {selectedMonth && (
        <div className="p-3.5 sm:p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3 mt-2">
          <div className="flex items-center justify-between gap-2 border-b border-indigo-100/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-indigo-950">
                📅 {selectedMonth.monthStr} ({selectedMonth.monthDisplay}) 資金預測明細
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ${
                selectedMonth.isWarning || selectedMonth.projectedBalance < 0
                  ? 'bg-red-100 text-red-700'
                  : selectedMonth.isWaterLevelDropping || selectedMonth.projectedBalance < selectedMonth.startingBalance
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {selectedMonth.isWarning || selectedMonth.projectedBalance < 0 ? (
                  <>
                    <AlertTriangle size={11} />
                    <span>⚠️ 透支警戒</span>
                  </>
                ) : selectedMonth.isWaterLevelDropping || selectedMonth.projectedBalance < selectedMonth.startingBalance ? (
                  <>
                    <TrendingDown size={11} />
                    <span>⚠️ 資產水位下降</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={11} />
                    <span>✓ 資金安全 (水位上升)</span>
                  </>
                )}
              </span>
            </div>
            <span className="text-[11px] text-indigo-700 font-bold">
              第 {selectedMonthIndex + 1} 個月預測
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-stone-200/80">
              <p className="text-[10px] text-stone-400 font-bold">預測資產總額</p>
              <p className={`text-sm sm:text-base font-black mt-0.5 tabular-nums ${
                selectedMonth.isWarning || selectedMonth.projectedBalance < selectedMonth.startingBalance ? 'text-red-600' : 'text-emerald-700'
              }`}>
                {formatCurrency(selectedMonth.projectedBalance)}
              </p>
            </div>

            <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-stone-200/80">
              <p className="text-[10px] text-stone-400 font-bold">預測固定支出</p>
              <p className="text-sm sm:text-base font-black text-amber-700 mt-0.5 tabular-nums">
                -{formatCurrency(selectedMonth.dueExpenses)}
              </p>
            </div>

            <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-stone-200/80">
              <p className="text-[10px] text-stone-400 font-bold">變動支出均值</p>
              <p className="text-sm sm:text-base font-black text-rose-700 mt-0.5 tabular-nums">
                -{formatCurrency(selectedMonth.averageVariableExpense)}
              </p>
            </div>

            <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-stone-200/80">
              <p className="text-[10px] text-stone-400 font-bold">預測固定收入進帳</p>
              <p className="text-sm sm:text-base font-black text-teal-700 mt-0.5 tabular-nums">
                +{formatCurrency(selectedMonth.dueIncomes || 0)}
              </p>
            </div>
          </div>

          {/* 當月固定支出明細項目 */}
          {selectedMonth.dueFunds && selectedMonth.dueFunds.filter((f) => f.type !== 'income').length > 0 && (
            <div className="pt-1">
              <p className="text-[11px] font-bold text-stone-600 mb-1.5">
                當月預計扣款項目 ({selectedMonth.dueFunds.filter((f) => f.type !== 'income').length} 項)：
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedMonth.dueFunds
                  .filter((f) => f.type !== 'income')
                  .map((item, fIdx) => (
                    <span
                      key={fIdx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-stone-200 rounded-lg text-[11px] font-bold text-stone-700"
                    >
                      <span>{item.title}</span>
                      <span className="text-amber-700 tabular-nums">-{formatCurrency(item.amount)}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
