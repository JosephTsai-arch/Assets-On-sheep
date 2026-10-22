import React, { useEffect, useState } from 'react';
import liff from '@line/liff';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { initializeLiff } from '../../services/liffService';
import { AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';
import { User } from '../../types';

interface InviteLandingPageProps {
  onSuccess?: (user: User) => void;
}

/**
 * 深入解析 URL 中的 inviteCode (支援標準 query, hash 與 liff.state)
 */
export function extractInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const urlParams = new URLSearchParams(window.location.search);
  let code = urlParams.get('inviteCode');
  if (code) return code;

  // LINE 於跳轉時常將原始參數編碼至 liff.state
  const liffState = urlParams.get('liff.state');
  if (liffState) {
    try {
      const decoded = decodeURIComponent(liffState);
      const subParams = new URLSearchParams(decoded.startsWith('?') ? decoded.slice(1) : decoded);
      code = subParams.get('inviteCode');
      if (code) return code;
    } catch {
      // ignore
    }
  }

  // 檢查 URL Hash
  if (window.location.hash) {
    const hashStr = window.location.hash.replace(/^#\/?/, '?');
    const hashParams = new URLSearchParams(hashStr);
    code = hashParams.get('inviteCode');
    if (code) return code;
  }

  return null;
}

export const InviteLandingPage: React.FC<InviteLandingPageProps> = ({ onSuccess }) => {
  const [statusText, setStatusText] = useState('🔄 正在為您綁定好友與初始化帳號...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inviterName, setInviterName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const processLiffInvitation = async () => {
      try {
        const inviteCode = extractInviteCodeFromUrl();
        if (!inviteCode) {
          throw new Error('未偵測到有效的邀請碼，請重新點擊好友分享的專屬連結。');
        }

        setStatusText('🔄 正在連接 LINE 服務...');

        // 1. 初始化 LIFF SDK
        const initSuccess = await initializeLiff();
        if (!initSuccess) {
          throw new Error('LIFF 初始化失敗。請確保在 LINE 應用程式內點擊邀請連結。');
        }

        // 2. 若尚未登入 LINE，呼叫 liff.login() 進行授權
        if (!liff.isLoggedIn()) {
          setStatusText('🔄 正在引導 LINE 身分授權...');
          liff.login({ redirectUri: window.location.href });
          return;
        }

        // 3. 呼叫 liff.getProfile() 取得真實的 LINE 使用者資料
        setStatusText('🔄 正在讀取您的 LINE 個人檔案...');
        const profile = await liff.getProfile();
        if (!profile?.userId) {
          throw new Error('無法取得 LINE 用戶識別碼 (User ID)。');
        }

        // 4. 發送至後端專屬綁定路由 /api/auth/liff-invite
        setStatusText('🔄 正在為您綁定好友與初始化帳號...');
        const response = await fetch('/api/auth/liff-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            line_user_id: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
            inviteCode,
          }),
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || '好友綁定與帳號初始化失敗');
        }

        if (data.inviter?.name) {
          setInviterName(data.inviter.name);
        }

        // 5. 核發通行證並登入系統
        setStatusText('🎉 綁定成功！即刻進入系統首頁...');

        if (data.customToken) {
          try {
            await signInWithCustomToken(auth, data.customToken);
          } catch (tokenErr: any) {
            console.warn('[CustomToken Sign-In Notice]:', tokenErr?.message);
          }
        }

        if (data.user) {
          try {
            localStorage.setItem('aos_sandbox_user', JSON.stringify(data.user));
          } catch {}
          if (onSuccess) {
            onSuccess(data.user);
          }
        }

        // 清理 URL 邀請參數並轉導首頁 (攜帶 lineUserId 作為防丟失身分錨點)
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const targetLineId = profile.userId || data.user?.lineUserId;
            const dest = targetLineId ? `/?lineUserId=${encodeURIComponent(targetLineId)}` : '/';
            window.location.href = dest;
          }
        }, 1200);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[InviteLandingPage Error]:', err);
        setErrorMsg(err?.message || '發生未預期的錯誤，請於 LINE 內重新嘗試。');
      }
    };

    processLiffInvitation();

    return () => {
      isMounted = false;
    };
  }, [onSuccess]);

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl border border-stone-200 p-8 flex flex-col items-center text-center space-y-5">
        {/* Mascot */}
        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-3xl shadow-xs">
          🐑
        </div>

        <div>
          <h1 className="text-lg font-black text-stone-900">資產上羊</h1>
          <p className="text-xs text-stone-500 font-medium mt-0.5">LINE LIFF 好友共管無感入駐</p>
        </div>

        {errorMsg ? (
          <div className="space-y-4 w-full">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-left">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-800 leading-relaxed font-medium">
                {errorMsg}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>重新嘗試載入</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                回首頁
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 w-full">
            {/* Loading Indicator */}
            <div className="py-4 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-extrabold text-stone-800 transition-all">
                {statusText}
              </p>
              {inviterName && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-[11px] font-bold border border-emerald-200/80 animate-in fade-in">
                  <MessageSquare size={12} />
                  <span>已成功與 {inviterName} 互加好友！</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100 text-[11px] text-stone-500 leading-relaxed">
              🌱 全自動身分對齊防碎裂機制運行中，無需手動填寫註冊資料。
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
