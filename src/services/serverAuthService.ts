import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc } from 'firebase/firestore';
import {
  db,
  cleanForFirestore,
  isSuperAdminUser,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_LINE_USER_ID,
  SUPER_ADMIN_LINE_UID,
  SUPER_ADMIN_GOOGLE_UID,
} from '../firebase/config';
import { User, Friend } from '../types';
import {
  fetchLineUserProfile,
  exchangeLineAuthCode,
  fetchLineProfileWithUserToken,
} from './lineProfileService';
import { getAccountsMergeSummary } from './accountMergeService';
import { parseInviteCode, LiffInvitePayload, LiffInviteResult } from './liffInviteService';
import crypto from 'crypto';

/**
 * 簽發高相容性全域 JWT Session Token (防禦 Cloud Run IAM SignBlob 權限限制)
 */
function createSignedSessionJwt(uid: string, user: User): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      uid,
      user_id: uid,
      email: user.email,
      name: user.name,
      role: user.role,
      super_admin: user.role === 'super_admin',
      lineUserId: user.lineUserId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    })
  ).toString('base64url');
  const secret = process.env.SESSION_SECRET || 'asseton_sheep_super_admin_secret_key';
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/**
 * 後端身分歸一化發證核心 (Backend Core)：
 * 1. 驗證取得 line_user_id
 * 2. 檢索 Firestore users 是否已存在該 line_user_id (例如機器人 Webhook 預建)
 * 3. 歸一化使用既有 Document UID 或新建實體
 * 4. 呼叫 Firebase Admin 產生自訂憑證 (Custom Token)
 */
export async function authenticateLineUserAndIssueCustomToken(params: {
  accessToken?: string;
  code?: string;
  redirectUri?: string;
  lineUserId?: string;
  displayName?: string;
  photoURL?: string;
  currentUserId?: string;
}): Promise<{
  customToken: string | null;
  user: User;
  uid: string;
  needMerge?: boolean;
  mergeSummary?: any;
}> {
  let lineUserId = (params.lineUserId || '').replace(/^line_/, '').trim();
  let displayName = (params.displayName || '').trim();
  let photoURL = (params.photoURL || '').trim();

  // 1. 若收到 OAuth code，向 LINE 換取 User Access Token
  if (params.code) {
    try {
      const redirectUri = params.redirectUri || 'https://localhost:3000/';
      const tokenResult = await exchangeLineAuthCode(params.code, redirectUri);
      if (tokenResult?.accessToken) {
        const userProf = await fetchLineProfileWithUserToken(tokenResult.accessToken);
        if (userProf) {
          lineUserId = userProf.userId;
          displayName = displayName || userProf.displayName;
          photoURL = photoURL || userProf.pictureUrl;
        }
      }
    } catch (codeErr: any) {
      console.warn('[LINE Auth Code Exchange Error]:', codeErr?.message);
    }
  }

  // 2. 若傳入 LINE User Access Token，向官方 Profile API 驗證
  if (params.accessToken && !lineUserId) {
    try {
      const userProf = await fetchLineProfileWithUserToken(params.accessToken);
      if (userProf) {
        lineUserId = userProf.userId;
        displayName = displayName || userProf.displayName;
        photoURL = photoURL || userProf.pictureUrl;
      }
    } catch (e: any) {
      console.warn('[LINE Profile API Error]:', e?.message);
    }
  }

  // 3. 若有 lineUserId 但仍缺乏名稱或大頭貼，透過 Messaging Bot API 精準獲取官方資料
  if (lineUserId && (!displayName || !photoURL || photoURL.includes('unsplash'))) {
    try {
      const botProf = await fetchLineUserProfile(lineUserId);
      if (botProf) {
        displayName = displayName || botProf.displayName;
        photoURL =
          photoURL && !photoURL.includes('unsplash') ? photoURL : botProf.pictureUrl;
      }
    } catch (e: any) {
      console.warn('[LINE Bot Profile API Fallback]:', e?.message);
    }
  }

  if (!lineUserId) {
    throw new Error('缺少有效之 LINE User ID (line_user_id)，無法進行身分認證');
  }

  // 4. 支援帳號鉤稽模式 (Account Correlation)：當現有 Google 登入者綁定 LINE 帳號時
  if (params.currentUserId) {
    try {
      const currentUserDoc = await getDoc(doc(db, 'users', params.currentUserId));
      if (currentUserDoc.exists()) {
        const currentUserData = currentUserDoc.data() as User;

        // 檢查此 LINE 帳號是否已有歷史記帳或資產數據需要三選一融合
        const mergeSummary = await getAccountsMergeSummary(params.currentUserId, lineUserId);
        if (
          mergeSummary.lineStats.transactionCount > 0 ||
          mergeSummary.lineStats.totalAssets > 0
        ) {
          return {
            customToken: null,
            user: currentUserData,
            uid: params.currentUserId,
            needMerge: true,
            mergeSummary,
          };
        }

        // 若無歷史衝突，直接原子關聯綁定
        const now = new Date().toISOString();
        await setDoc(
          doc(db, 'users', params.currentUserId),
          {
            lineUserId,
            updatedAt: now,
          },
          { merge: true }
        );

        // 同步更新或標記 LINE 專用影子 Document
        const shadowUid = `line_${lineUserId}`;
        await setDoc(
          doc(db, 'users', shadowUid),
          {
            id: shadowUid,
            lineUserId,
            name: displayName || currentUserData.name,
            avatarUrl: photoURL || currentUserData.avatarUrl,
            email: `${lineUserId}@line.me`,
            mergedIntoUserId: params.currentUserId,
            updatedAt: now,
          },
          { merge: true }
        );

        return {
          customToken: null,
          user: { ...currentUserData, lineUserId },
          uid: params.currentUserId,
          needMerge: false,
        };
      }
    } catch (linkErr: any) {
      console.warn('[Account Linking Error]:', linkErr?.message);
    }
  }

  // 5. 身分錨點：優先自資料庫搜尋包含此 line_user_id 的存續主帳號 (Database-driven mapping)
  let targetUid = `line_${lineUserId}`;

  if (lineUserId && lineUserId === SUPER_ADMIN_LINE_USER_ID) {
    targetUid = SUPER_ADMIN_LINE_UID;
  }

  const isSuper = isSuperAdminUser({
    id: targetUid,
    lineUserId,
    name: displayName,
    email: targetUid === SUPER_ADMIN_LINE_UID ? SUPER_ADMIN_EMAIL : `${lineUserId}@line.me`,
  });

  let finalUser: User = {
    id: targetUid,
    email: targetUid === SUPER_ADMIN_LINE_UID ? SUPER_ADMIN_EMAIL : `${lineUserId}@line.me`,
    name: displayName || 'LINE 使用者',
    avatarUrl:
      photoURL ||
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    role: isSuper ? 'super_admin' : 'member',
    lineUserId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  try {
    let isExisting = false;
    if (targetUid === SUPER_ADMIN_LINE_UID) {
      // 註銷第二個臨時帳號 line_...
      try {
        await setDoc(
          doc(db, 'users', `line_${SUPER_ADMIN_LINE_USER_ID}`),
          cleanForFirestore({
            deletedAt: new Date().toISOString(),
            mergedIntoUserId: SUPER_ADMIN_LINE_UID,
            status: 'decommissioned',
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (decomErr) {
        console.warn('[Decommission second line user notice]:', decomErr);
      }

      const v4Snap = await getDoc(doc(db, 'users', SUPER_ADMIN_LINE_UID));
      if (v4Snap.exists()) {
        finalUser = v4Snap.data() as User;
        finalUser.lineUserId = SUPER_ADMIN_LINE_USER_ID;
        finalUser.role = 'super_admin';
        isExisting = true;
      }
    } else {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('lineUserId', '==', lineUserId));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const matchedDoc = snap.docs[0];
        targetUid = matchedDoc.id;
        finalUser = matchedDoc.data() as User;

        if ((finalUser as any).mergedIntoUserId) {
          const survivingId = (finalUser as any).mergedIntoUserId;
          const survivingSnap = await getDoc(doc(db, 'users', survivingId));
          if (survivingSnap.exists()) {
            targetUid = survivingId;
            finalUser = survivingSnap.data() as User;
          }
        }
        isExisting = true;
      }
    }

    if (isExisting) {
      if (
        displayName &&
        (finalUser.name === 'LINE 夥伴' ||
          finalUser.name === 'LINE 使用者' ||
          !finalUser.name ||
          displayName !== finalUser.name)
      ) {
        finalUser.name = displayName;
      }
      if (
        photoURL &&
        (finalUser.avatarUrl?.includes('unsplash') ||
          !finalUser.avatarUrl ||
          photoURL !== finalUser.avatarUrl)
      ) {
        finalUser.avatarUrl = photoURL;
      }

      if (isSuper || isSuperAdminUser(finalUser)) {
        finalUser.role = 'super_admin';
        finalUser.email = finalUser.email || SUPER_ADMIN_EMAIL;
        finalUser.googleUid = finalUser.googleUid || SUPER_ADMIN_GOOGLE_UID;
        finalUser.lineUserId = finalUser.lineUserId || SUPER_ADMIN_LINE_USER_ID;
        finalUser.aliasUserIds = Array.from(
          new Set([
            ...(finalUser.aliasUserIds || []),
            SUPER_ADMIN_LINE_UID,
            `line_${SUPER_ADMIN_LINE_USER_ID}`,
            SUPER_ADMIN_LINE_USER_ID,
            SUPER_ADMIN_EMAIL,
          ])
        ).filter(Boolean) as string[];
      }
      finalUser.updatedAt = new Date().toISOString();
      await setDoc(doc(db, 'users', targetUid), cleanForFirestore(finalUser), { merge: true });
    } else {
      await setDoc(doc(db, 'users', targetUid), cleanForFirestore(finalUser));
      try {
        const { initializeUserDefaultLedgers } = await import('./ledgerService');
        const { initializeDefaultAssets } = await import('./walletService');
        await Promise.allSettled([
          initializeUserDefaultLedgers(targetUid, lineUserId),
          initializeDefaultAssets(targetUid, lineUserId),
        ]);
      } catch (initErr) {
        console.warn('[LINE New User Env Init Error]:', initErr);
      }
    }
  } catch (err: any) {
    console.warn('[Firestore sync fallback in server]:', err?.message);
  }

  // 6. 呼叫 Firebase Admin 簽發 Custom Token
  let customToken: string | null = null;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    const adminApp = getApps().length
      ? getApp()
      : initializeApp({
          projectId:
            process.env.VITE_FIREBASE_PROJECT_ID ||
            'ai-studio-6645a07f-ae6f-431a-b871-2b2cdd68960f',
        });

    customToken = await getAuth(adminApp).createCustomToken(targetUid, {
      lineUserId,
      email: finalUser.email,
      role: finalUser.role,
      super_admin: finalUser.role === 'super_admin',
    });
  } catch (err: any) {
    console.warn('[Firebase Admin createCustomToken]:', err?.message);
  }

  if (!customToken) {
    customToken = createSignedSessionJwt(targetUid, finalUser);
  }

  return {
    customToken,
    user: finalUser,
    uid: targetUid,
  };
}

/**
 * 後端身分歸一與好友綁定 (LIFF 無感註冊核心 Service)
 */
export async function handleLiffInviteRegistration(
  payload: LiffInvitePayload
): Promise<LiffInviteResult> {
  const rawLineUserId = (payload.line_user_id || payload.lineUserId || '').trim();
  if (!rawLineUserId) {
    throw new Error('缺少必要之 LINE User ID');
  }

  const cleanLineId = rawLineUserId.replace(/^line_/, '');
  const displayName = (payload.displayName || payload.name || '').trim();
  const avatarUrl = (payload.pictureUrl || payload.avatarUrl || '').trim();
  const now = new Date().toISOString();

  // 1. 身分歸一化：查詢 DB 中是否已有此 line_user_id
  let targetUid = `line_${cleanLineId}`;
  let matchedUser: User | null = null;

  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('lineUserId', '==', cleanLineId));
    const snap = await getDocs(q);

    if (!snap.empty) {
      matchedUser = snap.docs[0].data() as User;
      targetUid = snap.docs[0].id;
    } else {
      const directSnap = await getDoc(doc(db, 'users', targetUid));
      if (directSnap.exists()) {
        matchedUser = directSnap.data() as User;
      }
    }
  } catch (err: any) {
    console.warn('[LIFF Invite] 查詢既有用戶警告:', err?.message);
  }

  if (matchedUser && (matchedUser as any).mergedIntoUserId) {
    const survivingId = (matchedUser as any).mergedIntoUserId;
    const survivingSnap = await getDoc(doc(db, 'users', survivingId));
    if (survivingSnap.exists()) {
      targetUid = survivingId;
      matchedUser = survivingSnap.data() as User;
    }
  }

  const isSuper = isSuperAdminUser({
    id: targetUid,
    lineUserId: cleanLineId,
    name: displayName,
  });

  let finalUser: User;
  if (matchedUser) {
    finalUser = {
      ...matchedUser,
      name: displayName || matchedUser.name || 'LINE 使用者',
      avatarUrl: avatarUrl || matchedUser.avatarUrl,
      lineUserId: cleanLineId,
      role: isSuper ? 'super_admin' : matchedUser.role,
      updatedAt: now,
    };
    await setDoc(doc(db, 'users', targetUid), cleanForFirestore(finalUser), { merge: true });
  } else {
    finalUser = {
      id: targetUid,
      email: `${cleanLineId}@line.me`,
      name: displayName || 'LINE 新朋友',
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role: isSuper ? 'super_admin' : 'member',
      lineUserId: cleanLineId,
      friendIds: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await setDoc(doc(db, 'users', targetUid), cleanForFirestore(finalUser));
    try {
      const { initializeUserDefaultLedgers } = await import('./ledgerService');
      await initializeUserDefaultLedgers(targetUid);
    } catch { /* 容錯 */ }
  }

  // 2. 好友雙向綁定：解析 inviteCode 對應的發起人 (Inviter)
  const inviterInfo = parseInviteCode(payload.inviteCode);
  let inviterUser: User | null = null;

  if (inviterInfo?.inviterId && inviterInfo.inviterId !== targetUid) {
    const inviterId = inviterInfo.inviterId;
    try {
      const inviterDoc = await getDoc(doc(db, 'users', inviterId));
      if (inviterDoc.exists()) {
        inviterUser = inviterDoc.data() as User;

        const inviterFriendIds = Array.from(new Set([...(inviterUser.friendIds || []), targetUid]));
        const inviteeFriendIds = Array.from(new Set([...(finalUser.friendIds || []), inviterId]));

        await Promise.all([
          updateDoc(doc(db, 'users', inviterId), {
            friendIds: inviterFriendIds,
            updatedAt: now,
          }),
          updateDoc(doc(db, 'users', targetUid), {
            friendIds: inviteeFriendIds,
            updatedAt: now,
          }),
        ]);

        finalUser.friendIds = inviteeFriendIds;

        const friendDocA: Friend = {
          id: `friend_${inviterId}_${targetUid}`,
          userId: inviterId,
          friendUserId: targetUid,
          name: finalUser.name,
          avatarUrl: finalUser.avatarUrl,
          isDummy: false,
          ownerId: inviterId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        const friendDocB: Friend = {
          id: `friend_${targetUid}_${inviterId}`,
          userId: targetUid,
          friendUserId: inviterId,
          name: inviterUser.name || inviterInfo.inviterName || '好友',
          avatarUrl: inviterUser.avatarUrl,
          isDummy: false,
          ownerId: targetUid,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        await Promise.all([
          setDoc(doc(db, 'friends', friendDocA.id), cleanForFirestore(friendDocA), { merge: true }),
          setDoc(doc(db, 'friends', friendDocB.id), cleanForFirestore(friendDocB), { merge: true }),
        ]);

        // 若邀請碼指定了特定共管帳本，自動將新加入好友納入該帳本成員名單
        if (inviterInfo && (inviterInfo as any).ledgerId) {
          try {
            const { addMemberToLedger } = await import('./ledgerService');
            await addMemberToLedger((inviterInfo as any).ledgerId, targetUid);
          } catch (ledgerJoinErr: any) {
            console.warn('[LIFF Invite ledger join notice]:', ledgerJoinErr?.message);
          }
        }
      }
    } catch (bindErr: any) {
      console.warn('[LIFF Invite] 好友綁定容錯警告:', bindErr?.message);
    }
  }

  // 3. 簽發 Firebase Custom Token
  let customToken: string | null = null;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    const adminApp = getApps().length
      ? getApp()
      : initializeApp({
          projectId:
            process.env.VITE_FIREBASE_PROJECT_ID ||
            'ai-studio-6645a07f-ae6f-431a-b871-2b2cdd68960f',
        });

    customToken = await getAuth(adminApp).createCustomToken(targetUid, {
      lineUserId: cleanLineId,
      email: finalUser.email,
      role: finalUser.role,
      super_admin: finalUser.role === 'super_admin',
    });
  } catch (err: any) {
    console.warn('[LIFF Invite createCustomToken]:', err?.message);
  }

  return {
    success: true,
    customToken,
    user: finalUser,
    inviter: inviterUser
      ? { id: inviterUser.id, name: inviterUser.name }
      : inviterInfo
      ? { id: inviterInfo.inviterId, name: inviterInfo.inviterName }
      : undefined,
  };
}

/**
 * 官方 Google/Gmail 登入核心認證：
 * 支援資料庫主帳號動態歸併與環境變數總管理員認證
 */
export async function authenticateGoogleUser(params: {
  email?: string;
  uid?: string;
  displayName?: string;
  photoURL?: string;
}): Promise<{
  success: boolean;
  user: User;
  uid: string;
  customToken: string | null;
}> {
  let email = (params.email || '').trim().toLowerCase();
  let displayName = (params.displayName || '').trim();
  let photoURL = (params.photoURL || '').trim();
  let inputUid = (params.uid || '').trim();

  // 若未傳入 email，預設為唯一總管理員備援
  if (!email && SUPER_ADMIN_EMAIL) {
    email = SUPER_ADMIN_EMAIL.toLowerCase();
  }

  const isSuper =
    (email && email === SUPER_ADMIN_EMAIL.toLowerCase()) ||
    (inputUid && inputUid === SUPER_ADMIN_GOOGLE_UID) ||
    isSuperAdminUser(email) ||
    isSuperAdminUser(inputUid);

  let targetUid = isSuper ? SUPER_ADMIN_GOOGLE_UID : (inputUid || email.replace(/[@.]/g, '_'));

  // 查詢既有資料庫使用者 (跨管道多憑證支援：直查 targetUid, email, googleUid, lineUserId, aliasUserIds)
  let userDoc: User | null = null;
  let userRef = doc(db, 'users', targetUid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      userDoc = snap.data() as User;
    } else {
      const candidateQueries: any[] = [];
      if (email) {
        candidateQueries.push(query(collection(db, 'users'), where('email', '==', email.toLowerCase())));
      }
      if (inputUid || targetUid) {
        candidateQueries.push(query(collection(db, 'users'), where('googleUid', '==', inputUid || targetUid)));
        candidateQueries.push(query(collection(db, 'users'), where('aliasUserIds', 'array-contains', inputUid || targetUid)));
        candidateQueries.push(query(collection(db, 'users'), where('mergedIntoUserId', '==', inputUid || targetUid)));
      }
      for (const q of candidateQueries) {
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          userDoc = qSnap.docs[0].data() as User;
          targetUid = qSnap.docs[0].id;
          userRef = doc(db, 'users', targetUid);
          break;
        }
      }
    }
  } catch (err: any) {
    console.warn('[Google Auth DB Fetch Notice]:', err?.message);
  }

  const now = new Date().toISOString();

  let finalUser: User;
  if (userDoc) {
    finalUser = {
      ...userDoc,
      email: isSuper ? (userDoc.email || SUPER_ADMIN_EMAIL) : (email || userDoc.email),
      name: displayName || userDoc.name || (isSuper ? '系統總管理員' : 'Google 使用者'),
      avatarUrl: photoURL || userDoc.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      role: isSuper ? 'super_admin' : (userDoc.role || 'member'),
      googleUid: targetUid,
      lineUserId: isSuper ? (userDoc.lineUserId || SUPER_ADMIN_LINE_USER_ID) : userDoc.lineUserId,
      aliasUserIds: isSuper
        ? Array.from(new Set([...(userDoc.aliasUserIds || []), `line_${SUPER_ADMIN_LINE_USER_ID}`, SUPER_ADMIN_LINE_USER_ID, SUPER_ADMIN_EMAIL, targetUid])).filter(Boolean) as string[]
        : Array.from(new Set([...(userDoc.aliasUserIds || []), targetUid, inputUid])).filter(Boolean) as string[],
      updatedAt: now,
      deletedAt: null,
    };
  } else {
    finalUser = {
      id: targetUid,
      email: isSuper ? SUPER_ADMIN_EMAIL : email,
      name: displayName || (isSuper ? '系統總管理員' : 'Google 使用者'),
      avatarUrl: photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      role: isSuper ? 'super_admin' : 'member',
      googleUid: targetUid,
      lineUserId: isSuper ? SUPER_ADMIN_LINE_USER_ID : undefined,
      aliasUserIds: isSuper
        ? Array.from(new Set([`line_${SUPER_ADMIN_LINE_USER_ID}`, SUPER_ADMIN_LINE_USER_ID, SUPER_ADMIN_EMAIL, targetUid])).filter(Boolean) as string[]
        : undefined,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  try {
    await setDoc(userRef, cleanForFirestore(finalUser), { merge: true });
    // 若為真正全新用戶，初始化帳本 (嚴格防禦：若名下已有明細、帳本或資產，絕不覆寫)
    if (!userDoc) {
      try {
        const [txSnap, assetSnap, ledgerSnap] = await Promise.all([
          getDocs(query(collection(db, 'transactions'), where('userId', '==', targetUid))),
          getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', targetUid))),
          getDocs(query(collection(db, 'ledgers'), where('userId', '==', targetUid))),
        ]);
        if (txSnap.empty && assetSnap.empty && ledgerSnap.empty) {
          const { initializeUserDefaultLedgers } = await import('./ledgerService');
          const { initializeDefaultAssets } = await import('./walletService');
          await Promise.allSettled([
            initializeUserDefaultLedgers(targetUid),
            initializeDefaultAssets(targetUid),
          ]);
        }
      } catch (initErr) {
        console.warn('[New Google User Init Notice]:', initErr);
      }
    }
  } catch (writeErr: any) {
    console.warn('[Google Auth User Save Warning]:', writeErr?.message);
  }

  // 簽發 Firebase Custom Token (使前端無論在沙盒或正規瀏覽器皆能完成 signInWithCustomToken)
  let customToken: string | null = null;
  try {
    const { initializeApp, getApps, getApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');

    const adminApp = getApps().length
      ? getApp()
      : initializeApp({
          projectId:
            process.env.VITE_FIREBASE_PROJECT_ID ||
            'ai-studio-6645a07f-ae6f-431a-b871-2b2cdd68960f',
        });

    customToken = await getAuth(adminApp).createCustomToken(targetUid, {
      email: finalUser.email,
      role: finalUser.role,
      super_admin: finalUser.role === 'super_admin',
      lineUserId: finalUser.lineUserId,
    });
  } catch (err: any) {
    console.warn('[Firebase Admin createCustomToken in Google Auth]:', err?.message);
  }

  if (!customToken) {
    customToken = createSignedSessionJwt(targetUid, finalUser);
  }

  return {
    success: true,
    user: finalUser,
    uid: targetUid,
    customToken,
  };
}
