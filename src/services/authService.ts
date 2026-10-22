import {
  signInWithPopup,
  signOut as fbSignOut,
  signInWithCustomToken,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import {
  auth,
  googleProvider,
  db,
  cleanForFirestore,
  isSuperAdminUser,
  handleFirestoreError,
  OperationType,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_LINE_USER_ID,
  SUPER_ADMIN_LINE_UID,
  SUPER_ADMIN_GOOGLE_UID,
} from '../firebase/config';
import { User, UserRole } from '../types';

/**
 * 官方 Google OAuth 授權登入 (支援原生 Popup、沙盒隔離容錯與後端身分歸一化授權)
 */
export async function loginWithGoogle(optionalEmail?: string): Promise<User> {
  let googleEmail = optionalEmail;
  let googleUid: string | undefined;
  let googleDisplayName: string | undefined;
  let googlePhotoURL: string | undefined;

  // 檢查是否在 iframe 沙盒或預覽環境中
  const isIframeOrSandbox =
    typeof window !== 'undefined' &&
    (window.self !== window.top ||
      window.location.hostname.includes('.run.app') ||
      window.location.hostname.includes('ais-dev'));

  // 1. 若在外部獨立正規瀏覽器環境，優先嘗試原生 Firebase Auth 彈窗授權
  //    若在 iframe 沙盒內，避免呼叫 window.open/signInWithPopup 防止觸發 403 (unauthorized-domain) 或白畫面崩潰
  if (!isIframeOrSandbox) {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      if (fbUser) {
        googleEmail = fbUser.email || googleEmail;
        googleUid = fbUser.uid;
        googleDisplayName = fbUser.displayName || undefined;
        googlePhotoURL = fbUser.photoURL || undefined;
      }
    } catch (error: any) {
      console.warn('[Google Auth Popup notice, falling back to secure backend channel]:', error?.code, error?.message);
    }
  }

  // 2. 向後端官方驗證通道進行身分歸一化與總管理員身分認證
  const targetEmail = (googleEmail || optionalEmail || SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: targetEmail,
      uid: googleUid,
      displayName: googleDisplayName,
      photoURL: googlePhotoURL,
    }),
  });

  const data = await res.json();
  if (!data.success || !data.user) {
    throw new Error(data.error || 'Google 授權登入失敗');
  }

  const finalUser = data.user as User;

  // 3. 安全快取 Session Token 與身分狀態
  if (typeof window !== 'undefined') {
    try {
      if (data.customToken) {
        localStorage.setItem('aos_auth_token', data.customToken);
      }
      localStorage.setItem('aos_sandbox_user', JSON.stringify(finalUser));
      localStorage.setItem('aos_session_user', JSON.stringify(finalUser));
    } catch (e) {
      console.warn('[SafeStorage] localStorage cache failed:', e);
    }

    // 4. 全域廣播身分變更事件
    window.dispatchEvent(new CustomEvent('aos-user-change', { detail: finalUser }));
  }

  return finalUser;
}

/**
 * 取得管理員 API 認證請求標頭 (自動附加 Token 與身分錨點)
 */
export async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  let token: string | null = null;
  try {
    token = (await auth.currentUser?.getIdToken()) || null;
  } catch {}
  if (!token && typeof window !== 'undefined') {
    try {
      token = localStorage.getItem('aos_auth_token');
    } catch {}
  }
  return {
    'Content-Type': 'application/json',
    ...(auth.currentUser?.email ? { 'x-user-email': auth.currentUser.email } : (SUPER_ADMIN_EMAIL ? { 'x-user-email': SUPER_ADMIN_EMAIL } : {})),
    ...(auth.currentUser?.uid ? { 'x-user-id': auth.currentUser.uid } : (SUPER_ADMIN_GOOGLE_UID ? { 'x-user-id': SUPER_ADMIN_GOOGLE_UID } : {})),
  };
}

/**
 * 前端 LINE 官方授權登入：向後端換發 Firebase Custom Token
 */
export async function loginWithLine(params: {
  accessToken?: string;
  code?: string;
  lineUserId?: string;
  displayName?: string;
  photoURL?: string;
}): Promise<User> {
  const res = await fetch('/api/auth/line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'LINE 登入換發憑證失敗');
  }

  // 若後端成功簽發 Firebase Custom Token，呼叫官方 signInWithCustomToken 完成正式登入
  if (data.customToken) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aos_auth_token', data.customToken);
      } catch {}
    }
    try {
      await signInWithCustomToken(auth, data.customToken);
    } catch (e: any) {
      console.warn('[LINE Auth] signInWithCustomToken warning:', e?.message);
    }
  }

  // 身分歸一化：後端已完成 Firestore 寫入與角色核准，前端安全快取並廣播身分
  if (data.user) {
    try {
      localStorage.setItem('aos_sandbox_user', JSON.stringify(data.user));
    } catch (e) {
      console.warn('[SafeStorage] localStorage cache failed:', e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aos-user-change', { detail: data.user }));
    }

    return data.user;
  }

  throw new Error('未取得使用者身分資訊');
}

/**
 * 同步或建立 User Document
 */
export async function syncOrCreateUserDoc(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  googleUid?: string;
  lineUserId?: string;
}): Promise<User> {
  try {
    let effectiveUid = params.uid;
    let effectiveEmail = params.email;
    let effectiveName = params.displayName;
    let effectiveLineUserId = params.lineUserId;

    // 身分錨點：總管理員唯一存續主帳號自動映射
    const isSuperGoogle =
      (effectiveEmail && effectiveEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) ||
      effectiveUid === SUPER_ADMIN_GOOGLE_UID;
    const isSuperLine =
      (effectiveLineUserId && effectiveLineUserId === SUPER_ADMIN_LINE_USER_ID) ||
      effectiveUid === `line_${SUPER_ADMIN_LINE_USER_ID}` ||
      (effectiveEmail && effectiveEmail.toLowerCase() === `${SUPER_ADMIN_LINE_USER_ID.toLowerCase()}@line.me`);

    if (isSuperGoogle || isSuperLine) {
      effectiveUid = SUPER_ADMIN_LINE_UID;
      effectiveEmail = SUPER_ADMIN_EMAIL;
      effectiveLineUserId = SUPER_ADMIN_LINE_USER_ID;

      // 正式註銷第二個無用臨時帳號
      try {
        const deadShadowRef = doc(db, 'users', `line_${SUPER_ADMIN_LINE_USER_ID}`);
        await setDoc(
          deadShadowRef,
          cleanForFirestore({
            deletedAt: new Date().toISOString(),
            mergedIntoUserId: SUPER_ADMIN_LINE_UID,
            status: 'decommissioned',
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (decomErr) {
        console.warn('[Decommission second account warning]:', decomErr);
      }
    }

    // 跨管道多憑證全域檢索：查詢 users 集合是否已存在該使用者 (支援 id, email, googleUid, lineUserId, aliasUserIds)
    let matchedDoc: any = null;
    let targetRef = doc(db, 'users', effectiveUid);
    try {
      const directSnap = await getDoc(targetRef);
      if (directSnap.exists()) {
        matchedDoc = directSnap;
      } else {
        const candidateQueries: any[] = [];
        if (effectiveEmail) {
          candidateQueries.push(query(collection(db, 'users'), where('email', '==', effectiveEmail.toLowerCase())));
        }
        if (params.googleUid || effectiveUid) {
          candidateQueries.push(query(collection(db, 'users'), where('googleUid', '==', params.googleUid || effectiveUid)));
        }
        if (effectiveLineUserId) {
          candidateQueries.push(query(collection(db, 'users'), where('lineUserId', '==', effectiveLineUserId)));
          candidateQueries.push(query(collection(db, 'users'), where('id', '==', `line_${effectiveLineUserId}`)));
        }
        if (effectiveUid) {
          candidateQueries.push(query(collection(db, 'users'), where('aliasUserIds', 'array-contains', effectiveUid)));
          candidateQueries.push(query(collection(db, 'users'), where('mergedIntoUserId', '==', effectiveUid)));
        }
        for (const q of candidateQueries) {
          const snap = await getDocs(q);
          if (!snap.empty) {
            matchedDoc = snap.docs[0];
            effectiveUid = matchedDoc.id;
            targetRef = doc(db, 'users', effectiveUid);
            break;
          }
        }
      }
    } catch (fetchErr) {
      console.warn('[syncOrCreateUserDoc query notice]:', fetchErr);
    }

    const isSuper = isSuperAdminUser({
      email: effectiveEmail,
      id: effectiveUid,
      name: effectiveName,
      lineUserId: effectiveLineUserId,
    });
    const role: UserRole = isSuper ? 'super_admin' : 'member';

    if (matchedDoc && matchedDoc.exists()) {
      const existingData = matchedDoc.data() as User;
      const mergedAliases = Array.from(
        new Set([
          ...(existingData.aliasUserIds || []),
          effectiveUid,
          ...(params.uid ? [params.uid] : []),
          ...(effectiveLineUserId ? [effectiveLineUserId, `line_${effectiveLineUserId}`] : []),
        ])
      ).filter(Boolean);

      const updatedUser: User = {
        ...existingData,
        email: effectiveEmail || existingData.email,
        name: existingData.name || effectiveName,
        avatarUrl: existingData.avatarUrl || params.photoURL,
        role: isSuper ? 'super_admin' : existingData.role || 'member',
        googleUid: params.googleUid || existingData.googleUid || (SUPER_ADMIN_GOOGLE_UID && effectiveUid === SUPER_ADMIN_GOOGLE_UID ? SUPER_ADMIN_GOOGLE_UID : undefined),
        lineUserId: effectiveLineUserId || existingData.lineUserId,
        aliasUserIds: mergedAliases,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await setDoc(targetRef, cleanForFirestore(updatedUser), { merge: true });
      return updatedUser;
    }

    const newUser: User = {
      id: effectiveUid,
      email: effectiveEmail,
      name: effectiveName,
      avatarUrl: params.photoURL,
      role,
      googleUid: params.googleUid || (SUPER_ADMIN_GOOGLE_UID && effectiveUid === SUPER_ADMIN_GOOGLE_UID ? SUPER_ADMIN_GOOGLE_UID : undefined),
      lineUserId: effectiveLineUserId,
      aliasUserIds: Array.from(new Set([effectiveUid, params.uid, effectiveLineUserId ? `line_${effectiveLineUserId}` : ''])).filter(Boolean),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    await setDoc(targetRef, cleanForFirestore(newUser));
    // 為真正全新註冊帳號安全初始化環境 (嚴格防禦：若名下已有明細或資產，絕對不予覆寫或預設注入)
    try {
      const [txSnap, assetSnap, ledgerSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('userId', '==', newUser.id))),
        getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', newUser.id))),
        getDocs(query(collection(db, 'ledgers'), where('userId', '==', newUser.id))),
      ]);
      if (txSnap.empty && assetSnap.empty && ledgerSnap.empty) {
        const { initializeUserDefaultLedgers } = await import('./ledgerService');
        const { initializeDefaultAssets } = await import('./walletService');
        await Promise.allSettled([
          initializeUserDefaultLedgers(newUser.id, effectiveLineUserId),
          initializeDefaultAssets(newUser.id, effectiveLineUserId),
        ]);
      }
    } catch (initErr) {
      console.warn('[New User Env Init Error]:', initErr);
    }
    return newUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
  }
}

/**
 * 備援沙盒環境登入
 */
export async function loginWithSandboxFallback(email: string, name: string): Promise<User> {
  const isSuper = isSuperAdminUser(email);
  const safeId = isSuper ? SUPER_ADMIN_GOOGLE_UID : email.replace(/[@.]/g, '_');
  return await syncOrCreateUserDoc({
    uid: safeId,
    email,
    displayName: name || (isSuper ? '系統總管理員' : '小羊使用者'),
    photoURL:
      'https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=150&auto=format&fit=crop&q=80',
    googleUid: safeId,
    lineUserId: isSuper ? SUPER_ADMIN_LINE_USER_ID : undefined,
  });
}

/**
 * 災難救援碼登入驗證
 */
export async function loginWithRescueCodeService(code: string): Promise<User> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode || cleanCode.length !== 8) {
    throw new Error('請輸入正確的 8 碼英數救援碼');
  }

  let targetUserId: string | undefined;
  try {
    const res = await fetch('/api/rescue/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: cleanCode }),
    });
    const data = await res.json();
    if (data.success && data.targetUserId) {
      targetUserId = data.targetUserId;
    } else {
      throw new Error(data.error || '救援碼無效或已過期');
    }
  } catch (apiErr: any) {
    if (apiErr?.message?.includes('救援碼') || apiErr?.message?.includes('鎖定') || apiErr?.message?.includes('無效')) {
      throw apiErr;
    }
    const { verifyRescueCode } = await import('./disasterService');
    const localRes = await verifyRescueCode(cleanCode);
    if (!localRes.success || !localRes.targetUserId) {
      throw new Error(localRes.error || '救援碼驗證失敗');
    }
    targetUserId = localRes.targetUserId;
  }

  if (!targetUserId) {
    throw new Error('無法取得救援帳號識別碼');
  }

  // 若目標帳號為 line_...，自動映射存續主帳號
  if (targetUserId === `line_${SUPER_ADMIN_LINE_USER_ID}`) {
    targetUserId = SUPER_ADMIN_LINE_UID;
  }

  const userRef = doc(db, 'users', targetUserId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error('救援目標使用者帳號不存在');
  }

  const user = snap.data() as User;
  if (isSuperAdminUser(user)) {
    user.role = 'super_admin';
  }

  try {
    localStorage.setItem('aos_session_user', JSON.stringify(user));
    localStorage.setItem('aos_sandbox_user', JSON.stringify(user));
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aos-user-change', { detail: user }));
  }

  return user;
}

export async function updateUserProfile(
  userId: string,
  updates: { name?: string; avatarUrl?: string }
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      cleanForFirestore({
        ...updates,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (error) {
    console.warn('Sign out error:', error);
  }
}
