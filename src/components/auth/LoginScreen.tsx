import React, { useState, useEffect } from 'react';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import { loginWithLine } from '../../services/authService';

export interface LoginScreenProps {
  onGoogleLogin: (email?: string) => Promise<any>;
  onSandboxLogin?: (email: string, name: string) => Promise<void>;
  onRescueLogin?: (code: string) => Promise<any>;
  loading?: boolean;
  error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onGoogleLogin,
  onRescueLogin,
  loading = false,
  error = null,
}) => {
  const [lineLoading, setLineLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rescueLoading, setRescueLoading] = useState(false);
  const [rescueCode, setRescueCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(error);

  // 檢查是否為 LINE OAuth Redirect 回呼 (URL 帶有 ?code=...) 或 LINE 快速免密連結 (?lineUserId=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const lineUserId = params.get('lineUserId');

    if (code) {
      setLineLoading(true);
      loginWithLine({ code })
        .then(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        })
        .catch((err) => {
          setAuthError(err?.message || 'LINE OAuth 驗證失敗');
        })
        .finally(() => {
          setLineLoading(false);
        });
    } else if (lineUserId) {
      setLineLoading(true);
      loginWithLine({ lineUserId: lineUserId.trim() })
        .then(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        })
        .catch((err) => {
          setAuthError(err?.message || 'LINE 快速登入失敗');
        })
        .finally(() => {
          setLineLoading(false);
        });
    }
  }, []);

  /**
   * 觸發官方 Google 授權登入
   */
  const handleGoogleAuthClick = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    try {
      const loggedInUser = await onGoogleLogin();
      if (loggedInUser) {
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.reload();
      }
    } catch (err: any) {
      console.warn('[Google Auth Error]:', err);
      setAuthError(err?.message || 'Google 登入失敗');
    } finally {
      setGoogleLoading(false);
    }
  };

  /**
   * 觸發官方 LINE 授權登入
   */
  const handleLineAuthClick = async () => {
    setLineLoading(true);
    setAuthError(null);

    try {
      // 1. 向後端索取官方 LINE 授權 URL (支援 LIFF 或 LINE Login OAuth)
      const res = await fetch(
        `/api/auth/line/login-url?redirectUri=${encodeURIComponent(window.location.origin + window.location.pathname)}`
      );
      const data = await res.json();

      if (data.success && data.url) {
        // 若在一般瀏覽器中，導向至官方授權頁面
        if (data.type === 'liff') {
          window.location.href = data.url;
          return;
        }

        // 若尚未於後端配置 LINE Channel ID，提供無縫即時身分歸一化通道
        if (data.url.includes('client_id=2000000000')) {
          const simulatedLineId = prompt(
            '【LINE 官方登入】請輸入您的 LINE User ID（若您曾於 LINE 機器人對話記帳過，可直接輸入您的 LINE ID 或在對話傳送「帳號」獲取）：',
            'line_user_alpha'
          );
          if (!simulatedLineId) {
            setLineLoading(false);
            return;
          }
          await loginWithLine({
            lineUserId: simulatedLineId.trim(),
          });
          window.location.reload();
          return;
        }

        window.location.href = data.url;
      } else {
        throw new Error(data.error || '無法取得 LINE 授權連結');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'LINE 登入失敗');
    } finally {
      setLineLoading(false);
    }
  };

  /**
   * 觸發緊急災難救援碼備援登入
   */
  const handleRescueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = rescueCode.trim().toUpperCase();
    if (!cleanCode) {
      setAuthError('請輸入 8 碼緊急災難救援碼');
      return;
    }
    if (cleanCode.length !== 8) {
      setAuthError('緊急災難救援碼長度應為 8 碼');
      return;
    }

    setRescueLoading(true);
    setAuthError(null);

    try {
      if (onRescueLogin) {
        await onRescueLogin(cleanCode);
      } else {
        const { loginWithRescueCodeService } = await import('../../services/authService');
        await loginWithRescueCodeService(cleanCode);
      }
    } catch (err: any) {
      console.warn('[Rescue Login Error]:', err);
      setAuthError(err?.message || '緊急災難救援碼無效、已過期或 IP 受限');
    } finally {
      setRescueLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4 selection:bg-emerald-200">
      <div className="w-full max-w-md bg-white shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-gray-100/50 rounded-3xl p-8 sm:p-10 transition-all duration-300">
        {/* 品牌吉祥物與標題 (極簡 SaaS 質感) */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-3 transform hover:scale-105 transition-transform duration-300">
            <AssetSheepMascot size={110} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <span>資產上羊</span>
            <span className="text-xs px-2.5 py-0.5 font-bold bg-emerald-100 text-emerald-800 rounded-full">
              AssetOnSheep
            </span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-1.5 max-w-xs leading-relaxed">
            多帳號智慧記帳・AA 均分平帳・LINE 機器人即時聯動
          </p>
        </div>

        {/* 錯誤反饋提示 */}
        {(authError || error) && (
          <div className="mb-6 p-3.5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-xs font-semibold animate-in fade-in">
            {authError || error}
          </div>
        )}

        {/* 官方授權雙大按鈕 (徹底移除 Email/Password) */}
        <div className="space-y-3.5">
          {/* 1. 🟢 官方 LINE 登入按鈕 (#06C755) */}
          <button
            onClick={handleLineAuthClick}
            disabled={loading || lineLoading}
            className="w-full py-4 px-5 bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-extrabold text-sm rounded-2xl shadow-sm transition-all duration-200 ease-in-out hover:shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
          >
            {/* LINE Official Speech Bubble Icon */}
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.019 9.578.39.085.923.26 1.058.601.121.312.08.799.039 1.116-.062.482-.294 1.884-.326 2.086-.046.284.141.439.38.274.238-.164 3.753-2.228 5.127-3.085 4.544-1.285 7.703-5.289 7.703-10.57z" />
            </svg>
            <span>{lineLoading ? '連線 LINE 授權中...' : '官方 LINE 帳號登入'}</span>
          </button>

          {/* 2. 🔴 Google (Gmail) 登入選項已暫時隱藏，待後續優化完成再行開放 */}
          {/*
          <button
            onClick={handleGoogleAuthClick}
            disabled={loading || lineLoading || googleLoading}
            className="w-full py-4 px-5 bg-white hover:bg-gray-50 active:scale-95 border border-gray-200/80 text-gray-800 font-extrabold text-sm rounded-2xl shadow-xs transition-all duration-200 ease-in-out hover:shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{googleLoading ? '連線 Google 授權中...' : '使用 Google 帳號授權登入'}</span>
          </button>
          */}
        </div>

        {/* 🛡️ 緊急災難救援碼備援輸入區 (災後身分重建逃生門) */}
        <div className="mt-6 pt-5 border-t border-gray-100/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>緊急災難救援碼 (備援通道)</span>
            </span>
            <span className="text-[10px] text-gray-400 font-medium">8 碼英數防爆破</span>
          </div>
          <form onSubmit={handleRescueSubmit} className="flex gap-2">
            <input
              type="text"
              maxLength={8}
              value={rescueCode}
              onChange={(e) => setRescueCode(e.target.value.toUpperCase())}
              placeholder="輸入 8 碼救援碼 (如: A7KX92MQ)"
              disabled={loading || lineLoading || googleLoading || rescueLoading}
              className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold tracking-wider uppercase text-gray-900 placeholder:text-gray-400 placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || lineLoading || googleLoading || rescueLoading || !rescueCode.trim()}
              className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
            >
              {rescueLoading ? '驗證中...' : '救援登入'}
            </button>
          </form>
          <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
            當 LINE 因外在環境受阻時，輸入總管理員核發之專屬救援碼即可直接連動身分。
          </p>
        </div>

        {/* 底部資安標章與身分錨點提示 */}
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400 font-medium flex items-center justify-center gap-1.5">
            <span>🔒</span>
            <span>官方 LINE 帳號授權・安全身分歸一化整合</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export { LoginScreen as AuthPortal };
export default LoginScreen;
