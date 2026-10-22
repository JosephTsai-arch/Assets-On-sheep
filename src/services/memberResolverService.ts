import { doc, getDoc } from 'firebase/firestore';
import { db, SUPER_ADMIN_LINE_USER_ID, SUPER_ADMIN_LINE_UID } from '../firebase/config';
import { Friend, Ledger } from '../types';

export interface ResolvedMember {
  id: string; // 唯一標準識別碼 (Canonical ID)
  name: string; // 顯示名稱 (本人會帶 (我))
  rawName: string; // 乾淨姓名 (不帶 (我)，用於分帳明細與結算)
  avatarUrl?: string;
  isMe: boolean;
  isDummy: boolean;
  rawIds: string[]; // 所有關聯別名 ID
}

interface UserProfile {
  id: string;
  name: string;
  avatarUrl?: string;
  lineUserId?: string;
  aliases: string[];
}

// 記憶體全域快取 (執行時期動態快取，極速 0ms 回傳)
const profileCache = new Map<string, UserProfile>();

/**
 * 非同步檢索並快取使用者檔案 (對非已知用戶進行 Firestore 補充讀取)
 */
export async function fetchAndCacheUserProfile(rawId: string): Promise<UserProfile | null> {
  const cleanId = rawId.trim();
  if (!cleanId) return null;

  if (profileCache.has(cleanId)) {
    return profileCache.get(cleanId)!;
  }

  // 嘗試查詢 Firestore users 文件
  const lookupIds = [cleanId];
  if (cleanId.startsWith('line_')) {
    lookupIds.push(cleanId.replace(/^line_/, ''));
  } else if (cleanId.startsWith('U') && cleanId.length >= 20) {
    lookupIds.push(`line_${cleanId}`);
  }

  for (const tid of lookupIds) {
    try {
      const snap = await getDoc(doc(db, 'users', tid));
      if (snap.exists()) {
        const data = snap.data();
        const profile: UserProfile = {
          id: data.id || tid,
          name: data.name || data.displayName || '協作成員',
          avatarUrl: data.avatarUrl,
          lineUserId: data.lineUserId,
          aliases: Array.from(
            new Set([
              tid,
              cleanId,
              data.id,
              data.lineUserId,
              data.lineUserId ? `line_${data.lineUserId}` : '',
              data.googleUid,
              ...(Array.isArray(data.aliasUserIds) ? data.aliasUserIds : []),
            ].filter(Boolean))
          ),
        };

        for (const a of profile.aliases) {
          profileCache.set(a, profile);
        }
        return profile;
      }
    } catch {}
  }

  return null;
}

/**
 * 預先批次讀取帳本內所有成員資訊
 */
export async function prefetchLedgerMembers(memberIds: string[]): Promise<void> {
  const unlooked = (memberIds || []).filter((id) => !profileCache.has(id));
  if (unlooked.length === 0) return;
  await Promise.allSettled(unlooked.map((id) => fetchAndCacheUserProfile(id)));
}

/**
 * 判斷目標 ID 是否代表當前使用者本人
 */
export function isSamePersonAsMe(
  targetId: string,
  currentUserId: string,
  candidateIds?: Set<string>
): boolean {
  if (!targetId || !currentUserId) return false;
  if (targetId === currentUserId) return true;
  if (candidateIds && candidateIds.has(targetId)) return true;

  const cleanTarget = targetId.replace(/^line_/, '');
  const cleanMe = currentUserId.replace(/^line_/, '');
  if (cleanTarget === cleanMe) return true;

  // 總管理員特認比對 (依賴環境變數動態比對)
  if (SUPER_ADMIN_LINE_UID || SUPER_ADMIN_LINE_USER_ID) {
    const adminIds = new Set(
      [
        SUPER_ADMIN_LINE_UID,
        SUPER_ADMIN_LINE_USER_ID,
        SUPER_ADMIN_LINE_USER_ID ? `line_${SUPER_ADMIN_LINE_USER_ID}` : '',
      ].filter(Boolean)
    );
    if (adminIds.has(currentUserId) && adminIds.has(targetId)) {
      return true;
    }
  }

  return false;
}

/**
 * [全站真理] 完整解析帳本協作成員清單 (含真實姓名、頭像與別名合併)
 * 解決多憑證協作成員在共管帳本名單讀取不齊全、顯示為「成員」的狀況
 */
export function resolveLedgerMembers(
  memberIds: string[] | undefined,
  friends: Friend[] | undefined,
  currentUserId: string,
  currentUserName: string = '我',
  candidateIds?: Set<string>
): ResolvedMember[] {
  const result: ResolvedMember[] = [];
  const seenCanonicalKeys = new Set<string>();

  // 1. 本人一律置頂排第一位
  const myCleanName = currentUserName || '我';
  const myLabel = `${myCleanName} (我)`;
  const myCanonicalId = currentUserId;

  result.push({
    id: myCanonicalId,
    name: myLabel,
    rawName: myCleanName,
    avatarUrl: undefined,
    isMe: true,
    isDummy: false,
    rawIds: [currentUserId, currentUserId.replace(/^line_/, ''), `line_${currentUserId.replace(/^line_/, '')}`],
  });

  seenCanonicalKeys.add(myCanonicalId);
  seenCanonicalKeys.add(currentUserId.replace(/^line_/, ''));
  seenCanonicalKeys.add(`line_${currentUserId.replace(/^line_/, '')}`);
  if (candidateIds) {
    candidateIds.forEach((id) => seenCanonicalKeys.add(id));
  }

  // 2. 依序解析帳本內的所有成員
  for (const rawMId of memberIds || []) {
    if (!rawMId) continue;
    const cleanId = rawMId.trim();

    // 檢查是否為本人
    if (isSamePersonAsMe(cleanId, currentUserId, candidateIds)) {
      continue;
    }

    // 檢查是否已在已見集合中
    if (seenCanonicalKeys.has(cleanId)) {
      continue;
    }

    // A. 優先嘗試快取或已知的使用者 Profile
    const profile = profileCache.get(cleanId);
    if (profile) {
      const canonicalKey = profile.id;
      if (!seenCanonicalKeys.has(canonicalKey)) {
        seenCanonicalKeys.add(canonicalKey);
        profile.aliases.forEach((a) => seenCanonicalKeys.add(a));
        seenCanonicalKeys.add(cleanId);

        // 如果在好友名單有自訂名稱，優先使用好友自訂名稱
        const matchedFriend = (friends || []).find(
          (f) =>
            f.friendUserId === profile.id ||
            profile.aliases.includes(f.friendUserId || '') ||
            profile.aliases.includes(f.id)
        );

        const realName = matchedFriend?.name || profile.name;
        result.push({
          id: profile.id,
          name: realName,
          rawName: realName,
          avatarUrl: matchedFriend?.avatarUrl || profile.avatarUrl,
          isMe: false,
          isDummy: false,
          rawIds: profile.aliases,
        });
      }
      continue;
    }

    // B. 嘗試在好友名單中比對
    const friendObj = (friends || []).find(
      (f) =>
        f.id === cleanId ||
        f.friendUserId === cleanId ||
        (f.friendUserId &&
          (cleanId.replace(/^line_/, '') === f.friendUserId.replace(/^line_/, '') ||
            cleanId.includes(f.friendUserId) ||
            f.friendUserId.includes(cleanId)))
    );

    if (friendObj) {
      const canonicalId = friendObj.friendUserId || friendObj.id;
      if (!seenCanonicalKeys.has(canonicalId) && !seenCanonicalKeys.has(friendObj.name)) {
        seenCanonicalKeys.add(canonicalId);
        seenCanonicalKeys.add(cleanId);
        seenCanonicalKeys.add(friendObj.name);

        result.push({
          id: canonicalId,
          name: friendObj.name,
          rawName: friendObj.name,
          avatarUrl: friendObj.avatarUrl,
          isMe: false,
          isDummy: Boolean(friendObj.isDummy),
          rawIds: [cleanId, canonicalId],
        });
      }
      continue;
    }

    // C. 虛擬成員處理 (dummy_...)
    if (cleanId.startsWith('dummy_')) {
      let dummyName = '虛擬成員';
      if (cleanId.endsWith('_0')) dummyName = '小美 (好友)';
      else if (cleanId.endsWith('_1')) dummyName = '阿倫 (室友)';
      else if (cleanId.endsWith('_2')) dummyName = '媽媽 (家庭)';

      if (!seenCanonicalKeys.has(cleanId) && !seenCanonicalKeys.has(dummyName)) {
        seenCanonicalKeys.add(cleanId);
        seenCanonicalKeys.add(dummyName);

        result.push({
          id: cleanId,
          name: dummyName,
          rawName: dummyName,
          isMe: false,
          isDummy: true,
          rawIds: [cleanId],
        });
      }
      continue;
    }

    // D. 兜底回退：若無快取亦非虛擬成員，建立具可讀性之成員資訊
    const fallbackId = cleanId;
    const fallbackLabel = cleanId.startsWith('line_')
      ? `LINE成員 (${cleanId.slice(-4)})`
      : `成員 (${cleanId.slice(-4)})`;

    if (!seenCanonicalKeys.has(fallbackId)) {
      seenCanonicalKeys.add(fallbackId);
      seenCanonicalKeys.add(cleanId.replace(/^line_/, ''));
      result.push({
        id: fallbackId,
        name: fallbackLabel,
        rawName: fallbackLabel,
        isMe: false,
        isDummy: false,
        rawIds: [cleanId],
      });
    }
  }

  return result;
}
