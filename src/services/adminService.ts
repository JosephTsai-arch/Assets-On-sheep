import { collection, doc, getDoc, getDocs, updateDoc, query, where, limit } from 'firebase/firestore';
import { db, isSuperAdminUser, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { User, Transaction } from '../types';

export interface UserMonthlyRankingItem {
  userId: string;
  userName: string;
  userAvatar: string;
  email: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number; // 淨結餘 (正為結餘，負為赤字透支)
}

export interface BigExpenseItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  title: string;
  amount: number;
  currency: string;
  normalizedAmount: number; // 正規化為基準台幣 TWD
  date: string;
  categoryName: string;
}

export const BASE_EXCHANGE_RATES: Record<string, number> = {
  TWD: 1,
  JPY: 0.21,
  USD: 31,
  EUR: 34,
  CNY: 4.3,
  KRW: 0.023,
  GBP: 40,
  HKD: 4.0,
};

// 5 分鐘記憶體快取，防止後台頻繁切換月份反覆全量撈取資料庫
const adminStatsCache = new Map<string, { timestamp: number; data: any }>();

export async function fetchAllUsersAndTransactions(month: string): Promise<{
  monthlyRankings: UserMonthlyRankingItem[];
  bigExpenses: BigExpenseItem[];
  allUsers: User[];
}> {
  const cached = adminStatsCache.get(month);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  if (isFirestoreQuotaExceeded()) {
    if (cached) return cached.data;
    return { monthlyRankings: [], bigExpenses: [], allUsers: [] };
  }

  try {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const [usersSnap, txSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), limit(100))),
      getDocs(
        query(
          collection(db, 'transactions'),
          where('date', '>=', startDate),
          where('date', '<=', endDate),
          limit(300)
        )
      ),
    ]);

  const allUsers = usersSnap.docs
    .map((d) => d.data() as User)
    .filter((u) => !u.deletedAt);

  const userMap = new Map<string, User>();
  allUsers.forEach((u) => userMap.set(u.id, u));

  const allTxs = txSnap.docs
    .map((d) => d.data() as Transaction)
    .filter((t) => !t.deletedAt && t.date.startsWith(month));

  // 計算各帳號月總收支
  const userStats = new Map<
    string,
    { income: number; expense: number }
  >();

  allUsers.forEach((u) => {
    userStats.set(u.id, { income: 0, expense: 0 });
  });

  allTxs.forEach((t) => {
    const prev = userStats.get(t.userId) || { income: 0, expense: 0 };
    if (t.type === 'income') {
      prev.income += t.amount;
    } else if (t.type === 'expense') {
      prev.expense += t.amount;
    }
    userStats.set(t.userId, prev);
  });

  const monthlyRankings: UserMonthlyRankingItem[] = [];
  for (const [userId, stats] of userStats.entries()) {
    const u = userMap.get(userId);
    monthlyRankings.push({
      userId,
      userName: u?.name || '未知使用者',
      userAvatar:
        u?.avatarUrl ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      email: u?.email || '',
      totalIncome: stats.income,
      totalExpense: stats.expense,
      netSavings: stats.income - stats.expense,
    });
  }

  // 大額支出 (基準幣別正規化演算法：依據匯率轉換為 TWD 後排序)
  const bigExpenses: BigExpenseItem[] = allTxs
    .filter((t) => t.type === 'expense')
    .map((t) => {
      const u = userMap.get(t.userId);
      const curr = t.currency || 'TWD';
      const rate = BASE_EXCHANGE_RATES[curr] ?? 1;
      const normalizedAmount = Math.round(t.amount * rate);

      return {
        id: t.id,
        userId: t.userId,
        userName: u?.name || '未知使用者',
        userAvatar:
          u?.avatarUrl ||
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
        title: t.title,
        amount: t.amount,
        currency: curr,
        normalizedAmount,
        date: t.date,
        categoryName: t.categoryName,
      };
    })
    .sort((a, b) => b.normalizedAmount - a.normalizedAmount);

    const result = {
      monthlyRankings,
      bigExpenses,
      allUsers,
    };
    adminStatsCache.set(month, { timestamp: Date.now(), data: result });
    return result;
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
    const cached = adminStatsCache.get(month);
    if (cached) return cached.data;
    return {
      monthlyRankings: [],
      bigExpenses: [],
      allUsers: [],
    };
  }
}

export async function updateUserRole(targetUserId: string, newRole: 'member' | 'admin'): Promise<void> {
  const targetUserDoc = await getDoc(doc(db, 'users', targetUserId));
  if (!targetUserDoc.exists()) return;
  const targetData = targetUserDoc.data() as User;
  if (isSuperAdminUser(targetData) || targetData.role === 'super_admin') {
    throw new Error('嚴禁修改總管理員權限');
  }
  await updateDoc(doc(db, 'users', targetUserId), {
    role: newRole,
    updatedAt: new Date().toISOString(),
  });
}

export async function softDeleteUser(targetUserId: string): Promise<void> {
  const targetUserDoc = await getDoc(doc(db, 'users', targetUserId));
  if (!targetUserDoc.exists()) return;
  const targetData = targetUserDoc.data() as User;
  if (isSuperAdminUser(targetData) || targetData.role === 'super_admin') {
    throw new Error('嚴禁軟刪除總管理員');
  }
  await updateDoc(doc(db, 'users', targetUserId), {
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
