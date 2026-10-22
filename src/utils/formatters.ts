import { LedgerCurrency } from '../types';

export const EXCHANGE_RATES: Record<string, number> = {
  TWD: 1,
  JPY: 0.21,
  USD: 31,
  EUR: 34,
  CNY: 4.4,
  KRW: 0.024,
  GBP: 40,
};

/**
 * 輕量級預設匯率轉換邏輯：若明細幣別非 TWD，乘上匯率轉換為基準幣別 (TWD)
 */
export function convertToTWD(amount: number, currency: string = 'TWD'): number {
  const rate = EXCHANGE_RATES[currency] ?? 1;
  return amount * rate;
}

export function formatCurrency(amount: number, currency: LedgerCurrency = 'TWD'): string {
  const rounded = Math.round(amount);
  switch (currency) {
    case 'TWD':
      return `NT$ ${rounded.toLocaleString()}`;
    case 'JPY':
      return `¥ ${rounded.toLocaleString()}`;
    case 'USD':
      return `$ ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    case 'EUR':
      return `€ ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    case 'CNY':
      return `¥ ${rounded.toLocaleString()}`;
    case 'KRW':
      return `₩ ${rounded.toLocaleString()}`;
    case 'GBP':
      return `£ ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    default:
      return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatMonthDisplay(yearMonth: string): string {
  if (!yearMonth) return '';
  const [y, m] = yearMonth.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

export function getCurrentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getTodayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 台灣語境 OCR 民國年轉西元年
 * 例如：113年 或 113/05/12 轉為 2024年 或 2024/05/12
 */
export function rocToCeYear(text: string): string {
  if (!text) return text;
  // Match patterns like "113年", "114年", "民國113", "113/05/20", "113-05-20"
  let converted = text.replace(/民國\s*(\d{2,3})[年\/\-\.]/g, (_, rocYear) => {
    const ceYear = 1911 + parseInt(rocYear, 10);
    return `${ceYear}年`;
  });

  converted = converted.replace(/(^|[^0-9])(\d{2,3})年/g, (match, prefix, rocYear) => {
    const num = parseInt(rocYear, 10);
    if (num >= 70 && num <= 150) {
      return `${prefix}${1911 + num}年`;
    }
    return match;
  });

  converted = converted.replace(/(^|[^0-9])(\d{2,3})[\/\-](\d{1,2})[\/\-](\d{1,2})/g, (match, prefix, rocYear, month, day) => {
    const num = parseInt(rocYear, 10);
    if (num >= 70 && num <= 150) {
      const ceYear = 1911 + num;
      const mm = String(parseInt(month, 10)).padStart(2, '0');
      const dd = String(parseInt(day, 10)).padStart(2, '0');
      return `${prefix}${ceYear}-${mm}-${dd}`;
    }
    return match;
  });

  return converted;
}
