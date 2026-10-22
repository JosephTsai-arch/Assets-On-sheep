import liff from '@line/liff';

export interface LiffUserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

let isLiffInitialized = false;

/**
 * 初始化 LINE LIFF SDK
 * 確保網頁完全「焊死」在 LINE 應用程式內，永不跳出至外部 Safari / Chrome 瀏覽器
 */
export async function initializeLiff(liffId?: string): Promise<boolean> {
  let targetId = (liffId || (typeof process !== 'undefined' && process.env?.VITE_LINE_LIFF_ID) || '').trim();

  // 若前端未傳入，嘗試向伺服器動態索取公開配置之 LIFF ID
  if (!targetId && typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/system/public-config');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.liffId) {
          targetId = data.liffId.trim();
        }
      }
    } catch {
      // 容錯靜默
    }
  }

  if (!targetId) {
    return false;
  }

  if (isLiffInitialized) {
    return true;
  }

  try {
    await liff.init({ liffId: targetId });
    isLiffInitialized = true;
    return true;
  } catch (err: any) {
    console.warn('[LIFF Init Notice]:', err?.message || 'LIFF 未能成功初始化，系統將無縫使用內嵌 Webview 正常提供服務');
    return false;
  }
}

/**
 * 檢查當前是否運行在 LINE 官方 App 內部容器
 */
export function isInLineClient(): boolean {
  if (isLiffInitialized) {
    return liff.isInClient();
  }
  return typeof navigator !== 'undefined' && /Line\//i.test(navigator.userAgent);
}

/**
 * 取得當前 LIFF 使用者官方 Profile
 */
export async function getLiffUserProfile(): Promise<LiffUserProfile | null> {
  if (!isLiffInitialized) return null;

  try {
    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      return {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
        statusMessage: profile.statusMessage,
      };
    }
  } catch (err: any) {
    console.warn('[LIFF GetProfile Warning]:', err?.message);
  }
  return null;
}

/**
 * 安全關閉 LINE 內嵌視窗
 */
export function closeLiffWindow(): void {
  if (isLiffInitialized && liff.isInClient()) {
    liff.closeWindow();
  }
}

/**
 * 焊死在 LINE 內部：攔截所有外部彈窗與新分頁跳轉
 * 1. 攔截所有 <a> 標籤，強制移除 target="_blank"，永遠在當前 LINE 容器內轉導
 * 2. 攔截 window.open，防止 Safari / Chrome 外部瀏覽器被喚醒
 * 3. 攔截未授權的外部跳轉
 */
export function lockNavigationInsideLine(): void {
  if (typeof window === 'undefined') return;

  // 1. 全域攔截點擊事件，消除 target="_blank"
  document.addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (target) {
        if (target.getAttribute('target') === '_blank') {
          target.removeAttribute('target');
        }
        const href = target.getAttribute('href') || '';
        // 若為外部跳轉連結且在 LINE 內，避免被系統外部瀏覽器攔截
        if (href.startsWith('http') && !href.includes(window.location.host)) {
          e.preventDefault();
          window.location.href = href;
        }
      }
    },
    { capture: true }
  );

  // 2. 封鎖 window.open，永遠改由當前 Webview 容器處置
  if (typeof window.open === 'function') {
    const originalOpen = window.open;
    window.open = function (
      url?: string | URL,
      target?: string,
      features?: string
    ): Window | null {
      if (url) {
        const dest = typeof url === 'string' ? url : url.toString();
        window.location.href = dest;
        return window;
      }
      return null;
    };
  }
}
