import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { HealthReport, User } from '../types';

export interface UserReportGroup {
  userId: string;
  userName: string;
  userAvatar: string;
  email: string;
  reports: HealthReport[];
  latestMonth: string;
  averageScore: number;
  reportCount: number;
}

/**
 * 總管專屬 Hook：全站機密財務報告撈取 (移除任何 userId 限制，強制 Join 真實姓名與分組)
 */
export function useConfidentialReports() {
  const [groupedReports, setGroupedReports] = useState<UserReportGroup[]>([]);
  const [allReports, setAllReports] = useState<HealthReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (isFirestoreQuotaExceeded()) {
      setLoading(false);
      return;
    }
    try {
      // 1. 同步全域撈取 healthReports 與 users 集合 (設定 limit 50 避免無底洞消耗配額)
      const [reportsSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'healthReports'), limit(50))),
        getDocs(query(collection(db, 'users'), limit(100))),
      ]);

      // 建立真實用戶對照表
      const userMap = new Map<string, User>();
      usersSnap.docs.forEach((doc) => {
        const u = doc.data() as User;
        if (!u.deletedAt) {
          userMap.set(u.id, u);
        }
      });

      // 2. 轉換並 Join 真實姓名與頭貼
      const reports: HealthReport[] = reportsSnap.docs.map((doc) => {
        const rep = doc.data() as HealthReport;
        const joinedUser = userMap.get(rep.userId);
        return {
          ...rep,
          userName: joinedUser?.name || rep.userName || '匿名成員',
          userAvatar: joinedUser?.avatarUrl || rep.userAvatar || '',
        };
      });

      // 依時間排序 (最新在最前)
      reports.sort(
        (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
      );
      setAllReports(reports);

      // 3. 按使用者 (Group by User) 聚類分組
      const groupMap = new Map<string, HealthReport[]>();
      reports.forEach((rep) => {
        const list = groupMap.get(rep.userId) || [];
        list.push(rep);
        groupMap.set(rep.userId, list);
      });

      const groups: UserReportGroup[] = Array.from(groupMap.entries()).map(([uId, userReports]) => {
        const userInfo = userMap.get(uId);
        const primaryName = userInfo?.name || userReports[0]?.userName || '羊羊朋友';
        const primaryAvatar = userInfo?.avatarUrl || userReports[0]?.userAvatar || '';
        const email = userInfo?.email || '';

        const totalScore = userReports.reduce((sum, r) => sum + (r.score || 0), 0);
        const avgScore = userReports.length > 0 ? Math.round(totalScore / userReports.length) : 0;
        const latest = userReports[0]?.month || '';

        return {
          userId: uId,
          userName: primaryName,
          userAvatar: primaryAvatar,
          email,
          reports: userReports,
          latestMonth: latest,
          averageScore: avgScore,
          reportCount: userReports.length,
        };
      });

      // 依報告數量與最新日期排序
      groups.sort((a, b) => b.reportCount - a.reportCount);
      setGroupedReports(groups);
    } catch (err: any) {
      if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
        markQuotaExceeded();
      }
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return {
    groupedReports,
    allReports,
    loading,
    error,
    reload: fetchReports,
  };
}
