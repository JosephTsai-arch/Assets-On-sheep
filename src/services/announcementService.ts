import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, cleanForFirestore } from '../firebase/config';
import { Announcement, AnnouncementCategory, User } from '../types';

/**
 * 取得所有未被軟刪除的有效公告 (按發布時間倒序排列)
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const colRef = collection(db, 'announcements');
    const snap = await getDocs(colRef);
    const announcements: Announcement[] = [];

    snap.forEach((d) => {
      const data = d.data() as Announcement;
      if (!data.deletedAt) {
        announcements.push({
          ...data,
          id: d.id,
        });
      }
    });

    // 按建立時間由新到舊排序
    return announcements.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    console.warn('[fetchAnnouncements error]:', error);
    return [];
  }
}

/**
 * 取得特定帳號已讀的公告 ID 清單 (每個帳號獨立儲存與計算)
 */
export async function fetchUserReadAnnouncementIds(userId: string): Promise<string[]> {
  if (!userId) return [];

  const localKey = `aos_announcement_reads_${userId}`;
  let localReads: string[] = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localReads = JSON.parse(raw);
  } catch {}

  try {
    const colRef = collection(db, 'announcement_reads');
    const q = query(colRef, where('userId', '==', userId));
    const snap = await getDocs(q);

    const remoteReads: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.announcementId) {
        remoteReads.push(data.announcementId);
      }
    });

    // 融合本機與遠端，確保離線與即時雙向保障
    const merged = Array.from(new Set([...localReads, ...remoteReads]));
    localStorage.setItem(localKey, JSON.stringify(merged));
    return merged;
  } catch (error) {
    console.warn('[fetchUserReadAnnouncementIds error]:', error);
    return localReads;
  }
}

/**
 * 將指定公告標記為該用戶已讀 (點開卡片即時觸發)
 */
export async function markAnnouncementAsRead(
  userId: string,
  announcementId: string
): Promise<void> {
  if (!userId || !announcementId) return;

  const localKey = `aos_announcement_reads_${userId}`;
  try {
    const raw = localStorage.getItem(localKey);
    const reads: string[] = raw ? JSON.parse(raw) : [];
    if (!reads.includes(announcementId)) {
      reads.push(announcementId);
      localStorage.setItem(localKey, JSON.stringify(reads));
    }
  } catch {}

  try {
    const readDocId = `${userId}_${announcementId}`;
    await setDoc(
      doc(db, 'announcement_reads', readDocId),
      cleanForFirestore({
        userId,
        announcementId,
        readAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    console.warn('[markAnnouncementAsRead error]:', error);
  }
}

/**
 * 一鍵將所有公告標記為已讀
 */
export async function markAllAnnouncementsAsRead(
  userId: string,
  announcementIds: string[]
): Promise<void> {
  if (!userId || !announcementIds.length) return;

  const localKey = `aos_announcement_reads_${userId}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(announcementIds));
  } catch {}

  // 批次寫入 Firestore
  await Promise.all(
    announcementIds.map(async (annId) => {
      try {
        const readDocId = `${userId}_${annId}`;
        await setDoc(
          doc(db, 'announcement_reads', readDocId),
          cleanForFirestore({
            userId,
            announcementId: annId,
            readAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (err) {
        console.warn(`[markAllAnnouncementsAsRead single err for ${annId}]:`, err);
      }
    })
  );
}

/**
 * 統計特定公告的已讀總人數 (提供管理員後台查看)
 */
export async function fetchAnnouncementReadStats(
  announcementId: string
): Promise<{ readCount: number; readerIds: string[] }> {
  try {
    const colRef = collection(db, 'announcement_reads');
    const q = query(colRef, where('announcementId', '==', announcementId));
    const snap = await getDocs(q);
    const readerIds: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.userId) readerIds.push(data.userId);
    });
    return {
      readCount: readerIds.length,
      readerIds,
    };
  } catch (err) {
    return { readCount: 0, readerIds: [] };
  }
}

/**
 * 總管理員發布新公告
 */
export async function createAnnouncement(
  data: {
    title: string;
    content: string;
    category: AnnouncementCategory;
    broadcastLine: boolean;
    popupInApp: boolean;
  },
  currentUser: User
): Promise<{ success: boolean; announcement?: Announcement; error?: string }> {
  try {
    const id = `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    let lineStatus: Announcement['lineBroadcastStatus'] = undefined;

    // 若勾選 LINE 機器人群發，呼叫伺服端發送廣播
    if (data.broadcastLine) {
      try {
        const res = await fetch('/api/admin/broadcast-line', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': currentUser.email || '',
            'x-user-id': currentUser.id || '',
          },
          body: JSON.stringify({
            title: data.title,
            content: data.content,
            category: data.category,
            announcementId: id,
          }),
        });
        const resData = await res.json();
        if (res.ok && resData.success) {
          lineStatus = {
            sentAt: now,
            success: true,
          };
        } else {
          lineStatus = {
            sentAt: now,
            success: false,
            error: resData.error || 'LINE 廣播失敗',
          };
        }
      } catch (err: any) {
        lineStatus = {
          sentAt: now,
          success: false,
          error: err?.message || '發送請求失敗',
        };
      }
    }

    const newAnnouncement: Announcement = {
      id,
      title: data.title.trim(),
      content: data.content.trim(),
      category: data.category,
      authorId: currentUser.id,
      authorName: currentUser.name || '首席管理員',
      broadcastLine: data.broadcastLine,
      popupInApp: data.popupInApp,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      lineBroadcastStatus: lineStatus,
    };

    await setDoc(doc(db, 'announcements', id), cleanForFirestore(newAnnouncement));

    return {
      success: true,
      announcement: newAnnouncement,
    };
  } catch (error: any) {
    console.error('[createAnnouncement error]:', error);
    return { success: false, error: error?.message || '發布公告失敗' };
  }
}

/**
 * 總管理員全域編輯公告
 */
export async function updateAnnouncement(
  announcementId: string,
  updates: {
    title: string;
    content: string;
    category: AnnouncementCategory;
    broadcastLine: boolean;
    popupInApp: boolean;
  },
  currentUser: User,
  triggerLineBroadcastAgain: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, 'announcements', announcementId);
    const now = new Date().toISOString();

    const patch: any = {
      title: updates.title.trim(),
      content: updates.content.trim(),
      category: updates.category,
      broadcastLine: updates.broadcastLine,
      popupInApp: updates.popupInApp,
      updatedAt: now,
    };

    if (triggerLineBroadcastAgain && updates.broadcastLine) {
      try {
        const res = await fetch('/api/admin/broadcast-line', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': currentUser.email || '',
            'x-user-id': currentUser.id || '',
          },
          body: JSON.stringify({
            title: updates.title,
            content: updates.content,
            category: updates.category,
            announcementId,
          }),
        });
        const resData = await res.json();
        patch.lineBroadcastStatus = {
          sentAt: now,
          success: res.ok && resData.success,
          error: resData.error,
        };
      } catch (err: any) {
        patch.lineBroadcastStatus = {
          sentAt: now,
          success: false,
          error: err?.message,
        };
      }
    }

    await updateDoc(docRef, cleanForFirestore(patch));
    return { success: true };
  } catch (error: any) {
    console.error('[updateAnnouncement error]:', error);
    return { success: false, error: error?.message || '更新公告失敗' };
  }
}

/**
 * 總管理員全域軟刪除公告
 */
export async function deleteAnnouncement(announcementId: string): Promise<boolean> {
  try {
    const docRef = doc(db, 'announcements', announcementId);
    await updateDoc(docRef, {
      deletedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error('[deleteAnnouncement error]:', error);
    return false;
  }
}
