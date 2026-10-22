import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_LINE_USER_ID, SUPER_ADMIN_LINE_UID, isSuperAdminUser } from '../firebase/config';

/**
 * 記憶體級別候選身分快取 (快取 60 秒，避免重複並行觸發 20+ 次 Firestore 檢索)
 */
interface CacheEntry {
  data: Set<string>;
  expireAt: number;
}

const candidateCache = new Map<string, CacheEntry>();
const inFlightCandidateRequests = new Map<string, Promise<Set<string>>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分鐘記憶體快取 (大幅降低 users 集合讀取次數)

/**
 * 清除身分候選快取 (在使用者切換帳號、更新個人資料或綁定 LINE 時呼叫)
 */
export function invalidateCandidateIdsCache(userId?: string): void {
  if (!userId) {
    candidateCache.clear();
    return;
  }
  const cleanId = userId.trim();
  for (const key of Array.from(candidateCache.keys())) {
    if (key.includes(cleanId)) {
      candidateCache.delete(key);
    }
  }
}

/**
 * 本人多重身分 (Google UID, LINE ID, 合併帳號等) 候選 ID 解析器
 * 【鐵律規範】：
 * 1. 嚴格僅包含「該使用者本人」名下的登入憑證與帳號 ID！
 * 2. 雙向跨憑證穿透檢索：無論以 Google UID, LINE ID 還是別名查詢，均能完整解析關聯身分，徹底避免身分分裂或重複初始化！
 * 3. 絕對嚴禁加入任何好友文件 ID (friend_...) 或好友的使用者 ID，避免帳本與好友名單跨界污染！
 * 4. 具備高防護並行請求去重 (In-flight Deduplication) 與記憶體快速快取，0ms 極速返回！
 */
export async function getUserCandidateIds(
  userId: string,
  lineUserId?: string
): Promise<Set<string>> {
  if (!userId && !lineUserId) {
    return new Set<string>();
  }

  const cacheKey = `${userId || ''}_${lineUserId || ''}`.trim();
  const now = Date.now();

  // 1. 命中快取且未過期，直接 0ms 返回防禦複本
  const cached = candidateCache.get(cacheKey);
  if (cached && cached.expireAt > now) {
    return new Set(cached.data);
  }

  // 2. 若已有相同的查詢正在進行中，共享 Promise 避免並行衝撞
  if (inFlightCandidateRequests.has(cacheKey)) {
    const existing = await inFlightCandidateRequests.get(cacheKey)!;
    return new Set(existing);
  }

  // 3. 建立執行作業並放入 inFlightCandidateRequests
  const fetchPromise = (async (): Promise<Set<string>> => {
    const candidateIds = new Set<string>();

    if (userId) {
      candidateIds.add(userId);
      if (userId.startsWith('line_')) {
        candidateIds.add(userId.replace(/^line_/, ''));
      } else {
        candidateIds.add(`line_${userId}`);
      }
    }

    if (lineUserId) {
      const cleanLine = lineUserId.trim();
      candidateIds.add(cleanLine);
      candidateIds.add(`line_${cleanLine}`);
    }

    // 總管理員專屬身分特認保障：直接極速賦予已知關聯憑證，省去不必要查詢
    const isSuperPrecheck =
      userId === SUPER_ADMIN_LINE_UID ||
      userId === `line_${SUPER_ADMIN_LINE_USER_ID}` ||
      lineUserId === SUPER_ADMIN_LINE_USER_ID;

    if (isSuperPrecheck) {
      candidateIds.add(SUPER_ADMIN_LINE_UID);
      candidateIds.add(`line_${SUPER_ADMIN_LINE_USER_ID}`);
      candidateIds.add(SUPER_ADMIN_LINE_USER_ID);
    }

    // 1. 直查本人 User Document，提取 lineUserId、googleUid、mergedIntoUserId、email 及 aliasUserIds
    let userEmail: string | undefined;
    if (userId) {
      try {
        const uSnap = await getDoc(doc(db, 'users', userId));
        if (uSnap.exists()) {
          const u = uSnap.data();
          if (u.email) userEmail = u.email.toLowerCase().trim();
          if (u.lineUserId) {
            const lId = u.lineUserId.trim();
            candidateIds.add(lId);
            candidateIds.add(`line_${lId}`);
          }
          if (u.googleUid) candidateIds.add(u.googleUid);
          if (u.id) candidateIds.add(u.id);

          if (u.mergedIntoUserId) {
            candidateIds.add(u.mergedIntoUserId);
            try {
              const mergedSnap = await getDoc(doc(db, 'users', u.mergedIntoUserId));
              if (mergedSnap.exists()) {
                const mData = mergedSnap.data();
                if (mData.email && !userEmail) userEmail = mData.email.toLowerCase().trim();
                if (mData.googleUid) candidateIds.add(mData.googleUid);
                if (mData.lineUserId) {
                  candidateIds.add(mData.lineUserId.trim());
                  candidateIds.add(`line_${mData.lineUserId.trim()}`);
                }
                if (Array.isArray(mData.aliasUserIds)) {
                  mData.aliasUserIds.forEach((id: string) => id && candidateIds.add(id));
                }
              }
            } catch {}
          }
          if (Array.isArray(u.aliasUserIds)) {
            u.aliasUserIds.forEach((id: string) => {
              if (id) candidateIds.add(id);
            });
          }
        }
      } catch (e) {
        console.warn('[getUserCandidateIds userDoc lookup notice]:', e);
      }
    }

    // 2. 雙向反向檢索：查詢所有將此 userId 標註為 mergedIntoUserId、aliasUserIds 或具相同 email/lineUserId 的使用者文件
    try {
      const reverseQueries: any[] = [];
      if (userId) {
        reverseQueries.push(query(collection(db, 'users'), where('mergedIntoUserId', '==', userId)));
        reverseQueries.push(query(collection(db, 'users'), where('aliasUserIds', 'array-contains', userId)));
        reverseQueries.push(query(collection(db, 'users'), where('googleUid', '==', userId)));
      }
      if (userEmail) {
        reverseQueries.push(query(collection(db, 'users'), where('email', '==', userEmail)));
      }
      if (lineUserId) {
        const cleanLine = lineUserId.trim().replace(/^line_/, '');
        reverseQueries.push(query(collection(db, 'users'), where('lineUserId', '==', cleanLine)));
      }

      const reverseSnaps = await Promise.allSettled(reverseQueries.map((q) => getDocs(q)));
      for (const res of reverseSnaps) {
        if (res.status === 'fulfilled') {
          res.value.docs.forEach((d) => {
            candidateIds.add(d.id);
            const dData = d.data() as any;
            if (dData.googleUid) candidateIds.add(dData.googleUid);
            if (dData.lineUserId) {
              const l = dData.lineUserId.trim();
              candidateIds.add(l);
              candidateIds.add(`line_${l}`);
            }
            if (dData.mergedIntoUserId) candidateIds.add(dData.mergedIntoUserId);
            if (Array.isArray(dData.aliasUserIds)) {
              dData.aliasUserIds.forEach((alias: string) => alias && candidateIds.add(alias));
            }
          });
        }
      }
    } catch (revErr) {
      console.warn('[getUserCandidateIds reverse search notice]:', revErr);
    }

    // 3. 總管理員專屬身分特認保障：永遠確保雙向互通
    if (
      candidateIds.has(SUPER_ADMIN_LINE_UID) ||
      candidateIds.has(`line_${SUPER_ADMIN_LINE_USER_ID}`) ||
      candidateIds.has(SUPER_ADMIN_LINE_USER_ID) ||
      (userEmail && userEmail.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) ||
      isSuperAdminUser(userEmail)
    ) {
      candidateIds.add(SUPER_ADMIN_LINE_UID);
      candidateIds.add(`line_${SUPER_ADMIN_LINE_USER_ID}`);
      candidateIds.add(SUPER_ADMIN_LINE_USER_ID);
    }

    // 4. 平行檢索 LINE ID 對應的 line_<ID> Document (改用 Promise.allSettled 取代慢速序列迴圈)
    const shadowLookups = Array.from(candidateIds)
      .filter((id) => id.startsWith('U') && id.length >= 20)
      .map(async (id) => {
        try {
          const shadowSnap = await getDoc(doc(db, 'users', `line_${id}`));
          if (shadowSnap.exists()) {
            const s = shadowSnap.data();
            if (s.googleUid) candidateIds.add(s.googleUid);
            if (s.mergedIntoUserId) candidateIds.add(s.mergedIntoUserId);
            if (Array.isArray(s.aliasUserIds)) {
              s.aliasUserIds.forEach((alias: string) => candidateIds.add(alias));
            }
          }
        } catch {}
      });

    if (shadowLookups.length > 0) {
      await Promise.allSettled(shadowLookups);
    }

    return candidateIds;
  })();

  inFlightCandidateRequests.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    candidateCache.set(cacheKey, {
      data: result,
      expireAt: Date.now() + CACHE_TTL_MS,
    });
    return new Set(result);
  } finally {
    inFlightCandidateRequests.delete(cacheKey);
  }
}

/**
 * 展開帳本或分帳成員的身分別名 (例如將帶 line_ 前綴與不帶前綴的 ID 一併納入)
 */
export async function expandAllMemberAliases(memberIds: string[]): Promise<string[]> {
  const result = new Set<string>();

  for (const mId of memberIds || []) {
    if (!mId) continue;
    result.add(mId);

    if (mId.startsWith('line_')) {
      result.add(mId.replace(/^line_/, ''));
    } else if (mId.startsWith('U') && mId.length >= 20) {
      result.add(`line_${mId}`);
    }
  }

  return Array.from(result);
}
