import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isSuperAdminUser } from '../firebase/config';
import { User, UserRole } from '../types';
import {
  loginWithGoogle,
  loginWithSandboxFallback,
  signOutUser,
  syncOrCreateUserDoc,
  updateUserProfile,
} from '../services/authService';
import { invalidateCandidateIdsCache } from '../services/identityService';

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('[SafeStorage] localStorage setItem failed:', e);
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch (e) {
    console.warn('[SafeStorage] sessionStorage setItem failed:', e);
  }
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const cached = safeGetItem('aos_sandbox_user');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as User;
        if (isSuperAdminUser(parsed)) {
          parsed.role = 'super_admin';
        }
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    // 若本機已有有效快取使用者，直接以 0ms 呈現畫面（背景進行靜默校驗同步），避免每次開網頁或重整都強制白屏轉圈
    return !safeGetItem('aos_sandbox_user');
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    // 全域監聽自訂身分同步事件 (如 LIFF 登入或帳號切換)
    const handleUserChange = (e: any) => {
      if (e?.detail) {
        const u = e.detail as User;
        if (isSuperAdminUser(u)) u.role = 'super_admin';
        setCurrentUser(u);
        setLoading(false);
      }
    };
    window.addEventListener('aos-user-change', handleUserChange);

    // 0. 優先檢查 URL 參數或 LINE LIFF 容器環境
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlLineUserId = urlParams?.get('lineUserId')?.trim();
    const urlCode = urlParams?.get('code')?.trim();
    const isLineClient = typeof navigator !== 'undefined' && /Line\//i.test(navigator.userAgent);
    const hasLiffQuery = urlParams?.has('liff.state') || (typeof window !== 'undefined' && window.location.href.includes('liff.state'));
    const isLiffEnv = isLineClient || hasLiffQuery;

    // 容錯防禦：設定 3.5 秒絕對超時守護，永不讓使用者陷入無限轉圈圈
    const emergencyTimeout = setTimeout(() => {
      if (!isCancelled) {
        setLoading(false);
      }
    }, 3500);

    if (urlLineUserId || urlCode || isLiffEnv) {
      // 若本機快取身分剛好符合，立即預載入以實現 0ms 極速呈現
      const savedFallback = safeGetItem('aos_sandbox_user');
      if (savedFallback) {
        try {
          const parsed = JSON.parse(savedFallback) as User;
          if (
            (!urlLineUserId && isLiffEnv) ||
            parsed.lineUserId === urlLineUserId ||
            parsed.id === `line_${urlLineUserId}`
          ) {
            if (isSuperAdminUser(parsed)) parsed.role = 'super_admin';
            setCurrentUser(parsed);
            setLoading(false);
          }
        } catch {}
      }

      import('../services/liffService').then(async ({ initializeLiff, getLiffUserProfile, lockNavigationInsideLine }) => {
        lockNavigationInsideLine();
        let targetLineUserId = urlLineUserId;
        let displayName: string | undefined;
        let photoURL: string | undefined;

        if (!targetLineUserId && !urlCode) {
          try {
            const initSuccess = await initializeLiff();
            if (initSuccess) {
              const profile = await getLiffUserProfile();
              if (profile?.userId) {
                targetLineUserId = profile.userId;
                displayName = profile.displayName;
                photoURL = profile.pictureUrl;
              }
            }
          } catch (liffInitErr) {
            console.warn('[LIFF Early Init Warning]:', liffInitErr);
          }
        }

        if (targetLineUserId || urlCode) {
          const { loginWithLine } = await import('../services/authService');
          loginWithLine({
            lineUserId: targetLineUserId || undefined,
            code: urlCode || undefined,
            displayName,
            photoURL,
          })
            .then((res: any) => {
              if (!isCancelled && res) {
                const finalUser: User = (res as any)?.user || res;
                if (isSuperAdminUser(finalUser)) {
                  finalUser.role = 'super_admin';
                }
                setCurrentUser(finalUser);
                safeSetItem('aos_sandbox_user', JSON.stringify(finalUser));
                invalidateCandidateIdsCache(finalUser.id);
                if (targetLineUserId) {
                  safeSessionSet('aos_active_line_uid', finalUser.id);
                }
                // 清理 URL 敏感參數避免重整反覆觸發
                try {
                  const cleanUrl = new URL(window.location.href);
                  cleanUrl.searchParams.delete('lineUserId');
                  cleanUrl.searchParams.delete('code');
                  cleanUrl.searchParams.delete('state');
                  window.history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : ''));
                } catch {}
              }
            })
            .catch((err) => {
              console.warn('[LINE Auto-Login Notice]:', err?.message);
              if (!isCancelled) {
                // 容錯降級：若已提供 targetLineUserId 但因暫態網路失敗，建立即時受保證之身分
                if (targetLineUserId) {
                  const cleanId = targetLineUserId.replace(/^line_/, '').trim();
                  const emergencyUser: User = {
                    id: `line_${cleanId}`,
                    email: `${cleanId}@line.me`,
                    name: displayName || 'LINE 夥伴',
                    role: isSuperAdminUser(cleanId) ? 'super_admin' : 'member',
                    lineUserId: cleanId,
                    avatarUrl: photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null,
                  };
                  setCurrentUser(emergencyUser);
                  safeSetItem('aos_sandbox_user', JSON.stringify(emergencyUser));
                  invalidateCandidateIdsCache(emergencyUser.id);
                } else {
                  fallbackFromStorage();
                }
              }
            })
            .finally(() => {
              if (!isCancelled) {
                setLoading(false);
                clearTimeout(emergencyTimeout);
              }
            });
        } else {
          fallbackFromStorage();
          if (!isCancelled) {
            setLoading(false);
            clearTimeout(emergencyTimeout);
          }
        }
      });

      return () => {
        isCancelled = true;
        clearTimeout(emergencyTimeout);
        window.removeEventListener('aos-user-change', handleUserChange);
      };
    }

    function fallbackFromStorage() {
      const savedFallback = safeGetItem('aos_sandbox_user');
      if (savedFallback) {
        try {
          const parsed = JSON.parse(savedFallback) as User;
          if (isSuperAdminUser(parsed)) {
            parsed.role = 'super_admin';
          }
          if (!isCancelled) {
            setCurrentUser(parsed);
            setLoading(false);
          }
        } catch {
          try { localStorage.removeItem('aos_sandbox_user'); } catch {}
        }
      }
    }

    fallbackFromStorage();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const userDoc = await syncOrCreateUserDoc({
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || '羊羊好朋友',
            photoURL:
              fbUser.photoURL ||
              'https://images.unsplash.com/photo-1484557052118-f32bd25b45b5?w=150&auto=format&fit=crop&q=80',
            googleUid: fbUser.uid,
          });
          if (!isCancelled && userDoc) {
            setCurrentUser(userDoc);
            safeSetItem('aos_sandbox_user', JSON.stringify(userDoc));
          }
        } catch (err: any) {
          console.warn('Sync user failed:', err);
        }
      } else {
        const cached = safeGetItem('aos_sandbox_user') || safeGetItem('aos_session_user');
        if (!cached) {
          if (!isCancelled) {
            setCurrentUser(null);
          }
        } else {
          try {
            const parsed = JSON.parse(cached) as User;
            if (isSuperAdminUser(parsed)) {
              parsed.role = 'super_admin';
            }
            if (!isCancelled) {
              setCurrentUser(parsed);
            }
          } catch {}
        }
      }
      if (!isCancelled) {
        setLoading(false);
        clearTimeout(emergencyTimeout);
      }
    });

    return () => {
      isCancelled = true;
      clearTimeout(emergencyTimeout);
      unsubscribe();
      window.removeEventListener('aos-user-change', handleUserChange);
    };
  }, []);

  const handleGoogleLogin = async (email?: string) => {
    setError(null);
    try {
      const user = await loginWithGoogle(email);
      if (user) {
        if (isSuperAdminUser(user)) {
          user.role = 'super_admin';
        }
        setCurrentUser(user);
        safeSetItem('aos_sandbox_user', JSON.stringify(user));
      }
      return user;
    } catch (err: any) {
      setError(err?.message || 'Google 登入失敗');
      throw err;
    }
  };

  const handleSandboxLogin = async (email: string, name: string) => {
    setError(null);
    try {
      const user = await loginWithSandboxFallback(email, name);
      setCurrentUser(user);
      localStorage.setItem('aos_sandbox_user', JSON.stringify(user));
    } catch (err: any) {
      setError(err?.message || '備援登入失敗');
      throw err;
    }
  };

  const handleRescueLogin = async (code: string) => {
    setError(null);
    try {
      const { loginWithRescueCodeService } = await import('../services/authService');
      const user = await loginWithRescueCodeService(code);
      setCurrentUser(user);
      return user;
    } catch (err: any) {
      setError(err?.message || '救援碼登入失敗');
      throw err;
    }
  };

  const handleLogout = async () => {
    invalidateCandidateIdsCache();
    localStorage.removeItem('aos_sandbox_user');
    await signOutUser();
    setCurrentUser(null);
  };

  const handleUpdateProfile = async (name: string, avatarUrl: string) => {
    if (!currentUser) return;
    await updateUserProfile(currentUser.id, { name, avatarUrl });
    invalidateCandidateIdsCache(currentUser.id);
    const updated = { ...currentUser, name, avatarUrl };
    setCurrentUser(updated);
    if (localStorage.getItem('aos_sandbox_user')) {
      localStorage.setItem('aos_sandbox_user', JSON.stringify(updated));
    }
  };

  return {
    currentUser,
    loading,
    error,
    loginWithGoogle: handleGoogleLogin,
    loginWithSandbox: handleSandboxLogin,
    loginWithRescueCode: handleRescueLogin,
    logout: handleLogout,
    updateProfile: handleUpdateProfile,
    isSuperAdmin: currentUser?.role === 'super_admin' || isSuperAdminUser(currentUser),
  };
}
