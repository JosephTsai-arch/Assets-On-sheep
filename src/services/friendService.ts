import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { Friend, SheepPost } from '../types';
import { getUserCandidateIds } from './identityService';

export async function getUserFriends(userId: string, lineUserId?: string): Promise<Friend[]> {
  try {
    const candidateIds = await getUserCandidateIds(userId, lineUserId);
    const rawFriendsList: Friend[] = [];

    // 嚴格依 ownerId 檢索該用戶擁有的獨立好友名單，確保完全隔離不跨界污染
    const queries = Array.from(candidateIds).map((id) =>
      getDocs(query(collection(db, 'friends'), where('ownerId', '==', id)))
    );

    const snaps = await Promise.all(queries);

    const seenDocIds = new Set<string>();
    for (const snap of snaps) {
      snap.docs.forEach((d) => {
        if (!seenDocIds.has(d.id)) {
          seenDocIds.add(d.id);
          const f = d.data() as Friend;
          if (!f.deletedAt) {
            rawFriendsList.push({ ...f, id: d.id });
          }
        }
      });
    }

    // 嚴格去重：虛擬好友依名稱去重，真實好友依 friendUserId 去重，確保絕不重複出現
    const finalFriends: Friend[] = [];
    const seenDummyNames = new Set<string>();
    const seenRealFriendUserIds = new Set<string>();

    for (const f of rawFriendsList) {
      if (f.isDummy) {
        const dummyKey = f.name.trim();
        if (!seenDummyNames.has(dummyKey)) {
          seenDummyNames.add(dummyKey);
          finalFriends.push(f);
        }
      } else {
        const friendKey = (f.friendUserId || f.id).trim();
        if (!seenRealFriendUserIds.has(friendKey)) {
          seenRealFriendUserIds.add(friendKey);
          finalFriends.push(f);
        }
      }
    }

    return finalFriends;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'friends');
  }
}

/**
 * 手動新增專屬好友 (非 LIFF 即時手動建立)
 */
export async function createCustomFriend(
  userId: string,
  name: string,
  avatarUrl?: string
): Promise<Friend> {
  try {
    const id = `friend_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const friend: Friend = {
      id,
      userId,
      ownerId: userId,
      name: name.trim(),
      avatarUrl:
        avatarUrl ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      isDummy: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await setDoc(doc(db, 'friends', id), cleanForFirestore(friend));
    return friend;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'friends/custom');
  }
}

/**
 * 確保專屬綁定名下的 3 個獨立虛擬好友 (小美、阿倫、媽媽)，各帳號嚴格隔離絕不混通
 * 【防呆鐵律】：若用戶曾刪除過虛擬好友或已初始化過，絕不重複復活覆蓋！
 */
export async function ensureUserDummyFriends(userId: string): Promise<Friend[]> {
  try {
    if (!userId) return [];
    // 檢查該用戶是否已有任何好友（包含真實或已刪除記錄）
    const existingSnap = await getDocs(
      query(collection(db, 'friends'), where('ownerId', '==', userId))
    );
    if (!existingSnap.empty) {
      return existingSnap.docs
        .map((d) => d.data() as Friend)
        .filter((f) => !f.deletedAt);
    }
    const dummySpecs = [
      {
        name: '小美 (好友)',
        avatarUrl:
          'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
      },
      {
        name: '阿倫 (室友)',
        avatarUrl:
          'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
      },
      {
        name: '媽媽 (家庭)',
        avatarUrl:
          'https://images.unsplash.com/photo-1548142813-c348350df52b?w=120&auto=format&fit=crop&q=80',
      },
    ];

    const now = new Date().toISOString();
    const activeDummies: Friend[] = [];

    for (let i = 0; i < dummySpecs.length; i++) {
      const id = `dummy_${userId}_${i}`;
      const snap = await getDoc(doc(db, 'friends', id));
      if (snap.exists()) {
        const d = snap.data() as Friend;
        // 若存在且未被刪除，納入回傳
        if (!d.deletedAt) {
          activeDummies.push({ ...d, id: snap.id });
        }
        // 若已被軟刪除，嚴格尊重用戶意願，絕不復活！
      } else {
        // 全新帳號首次初始化
        const spec = dummySpecs[i];
        const newDummy: Friend = {
          id,
          userId,
          name: spec.name,
          avatarUrl: spec.avatarUrl,
          isDummy: true,
          ownerId: userId, // 嚴格各帳號專屬隔離
          createdAt: now,
          deletedAt: null,
        };
        await setDoc(doc(db, 'friends', id), cleanForFirestore(newDummy));
        activeDummies.push(newDummy);
      }
    }

    return activeDummies;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'friends/dummy_init');
  }
}

export function generateLineInviteLink(userId: string, userName: string): string {
  const origin = window.location.origin;
  const inviteCode = btoa(`${userId}:::${encodeURIComponent(userName)}`);
  return `${origin}/?invite=${inviteCode}`;
}

export async function addFriendFromInvite(
  currentUserId: string,
  inviterUserId: string,
  inviterName: string
): Promise<Friend> {
  const now = new Date().toISOString();

  // 取得雙方用戶資訊以獲得更準確的名字與頭像
  let currentUserName = '好友';
  let currentUserAvatar =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
  let inviterRealName = inviterName || '好友';
  let inviterAvatar =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';

  try {
    const [cSnap, iSnap] = await Promise.all([
      getDoc(doc(db, 'users', currentUserId)),
      getDoc(doc(db, 'users', inviterUserId)),
    ]);
    if (cSnap.exists()) {
      const c = cSnap.data();
      if (c.name) currentUserName = c.name;
      if (c.avatarUrl) currentUserAvatar = c.avatarUrl;
    }
    if (iSnap.exists()) {
      const i = iSnap.data();
      if (i.name) inviterRealName = i.name;
      if (i.avatarUrl) inviterAvatar = i.avatarUrl;
    }
  } catch {}

  // 1. 為被邀請人 (currentUserId) 建立好友記錄 指向 inviterUserId
  const friendIdForInvitee = `friend_${currentUserId}_${inviterUserId}`;
  const friendForInvitee: Friend = {
    id: friendIdForInvitee,
    userId: currentUserId,
    friendUserId: inviterUserId,
    name: inviterRealName,
    avatarUrl: inviterAvatar,
    isDummy: false,
    ownerId: currentUserId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  // 2. 為邀請人 (inviterUserId) 建立雙向好友記錄 指向 currentUserId
  const friendIdForInviter = `friend_${inviterUserId}_${currentUserId}`;
  const friendForInviter: Friend = {
    id: friendIdForInviter,
    userId: inviterUserId,
    friendUserId: currentUserId,
    name: currentUserName,
    avatarUrl: currentUserAvatar,
    isDummy: false,
    ownerId: inviterUserId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await Promise.all([
    setDoc(doc(db, 'friends', friendIdForInvitee), cleanForFirestore(friendForInvitee), { merge: true }),
    setDoc(doc(db, 'friends', friendIdForInviter), cleanForFirestore(friendForInviter), { merge: true }),
  ]);

  // 3. 雙向更新 users 文檔的 friendIds
  try {
    const [cDoc, iDoc] = await Promise.all([
      getDoc(doc(db, 'users', currentUserId)),
      getDoc(doc(db, 'users', inviterUserId)),
    ]);
    if (cDoc.exists()) {
      const cFriends = Array.from(new Set([...(cDoc.data()?.friendIds || []), inviterUserId]));
      await updateDoc(doc(db, 'users', currentUserId), { friendIds: cFriends, updatedAt: now });
    }
    if (iDoc.exists()) {
      const iFriends = Array.from(new Set([...(iDoc.data()?.friendIds || []), currentUserId]));
      await updateDoc(doc(db, 'users', inviterUserId), { friendIds: iFriends, updatedAt: now });
    }
  } catch {}

  return friendForInvitee;
}

export async function softDeleteFriend(friendId: string): Promise<void> {
  try {
    const ref = doc(db, 'friends', friendId);
    await updateDoc(ref, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friends/${friendId}`);
  }
}

// 羊咩咩好友心得牆 (5 分鐘記憶體快取)
let memorySheepPosts: { timestamp: number; posts: SheepPost[] } | null = null;

export async function getSheepPosts(): Promise<SheepPost[]> {
  if (memorySheepPosts && Date.now() - memorySheepPosts.timestamp < 5 * 60 * 1000) {
    return memorySheepPosts.posts;
  }
  if (isFirestoreQuotaExceeded()) {
    return memorySheepPosts?.posts || [];
  }
  try {
    const snap = await getDocs(query(collection(db, 'sheepPosts'), limit(30)));
    const posts = snap.docs
      .map((d) => d.data() as SheepPost)
      .filter((p) => !p.deletedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    memorySheepPosts = { timestamp: Date.now(), posts };
    return posts;
  } catch (err: any) {
    if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
    return memorySheepPosts?.posts || [];
  }
}

export async function softDeleteSheepPost(postId: string): Promise<void> {
  try {
    const ref = doc(db, 'sheepPosts', postId);
    await updateDoc(ref, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sheepPosts/${postId}`);
  }
}

export async function createSheepPost(
  userId: string,
  authorName: string,
  authorAvatar: string,
  content: string
): Promise<SheepPost> {
  const id = `post_${Date.now()}`;
  const post: SheepPost = {
    id,
    userId,
    authorName,
    authorAvatar,
    content: content.trim(),
    likesCount: 0,
    likedUserIds: [],
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'sheepPosts', id), cleanForFirestore(post));
  return post;
}

export async function togglePostLike(
  postId: string,
  userId: string
): Promise<{ likesCount: number; isLiked: boolean }> {
  const ref = doc(db, 'sheepPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { likesCount: 0, isLiked: false };

  const post = snap.data() as SheepPost;
  const liked = post.likedUserIds?.includes(userId) || false;

  let newLikedList = post.likedUserIds || [];
  if (liked) {
    newLikedList = newLikedList.filter((id) => id !== userId);
  } else {
    newLikedList = [...newLikedList, userId];
  }

  const newCount = newLikedList.length;
  await updateDoc(ref, {
    likesCount: newCount,
    likedUserIds: newLikedList,
  });

  return { likesCount: newCount, isLiked: !liked };
}
