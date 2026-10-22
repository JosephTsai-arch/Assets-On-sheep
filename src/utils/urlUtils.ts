/**
 * 網址與 LIFF 動態解析工具 (支援雲端環境變數、動態配置與本機開發兜底)
 */

export function getAppBaseUrl(overrideUrl?: string): string {
  if (overrideUrl && typeof overrideUrl === 'string' && overrideUrl.startsWith('http')) {
    return overrideUrl.replace(/\/+$/, '');
  }
  if (typeof process !== 'undefined' && process.env) {
    const envUrl = process.env.APP_URL || process.env.VITE_DEV_APP_URL || process.env.VITE_APP_URL;
    if (envUrl && envUrl.startsWith('http')) {
      return envUrl.trim().replace(/\/+$/, '');
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export function getLiffId(overrideLiffId?: string): string {
  if (overrideLiffId && typeof overrideLiffId === 'string' && overrideLiffId.trim()) {
    return overrideLiffId.trim();
  }
  if (typeof process !== 'undefined' && process.env) {
    const envId = process.env.LINE_LIFF_ID || process.env.VITE_LINE_LIFF_ID;
    if (envId && envId.trim()) {
      return envId.trim();
    }
  }
  return '';
}

export function getLiffUrl(liffId?: string, appUrl?: string): string {
  const resolvedId = getLiffId(liffId);
  if (resolvedId) {
    return `https://liff.line.me/${resolvedId}`;
  }
  return getAppBaseUrl(appUrl);
}
