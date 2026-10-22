import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Ledger,
  Transaction,
  AssetAccount,
  Category,
  Budget,
  SinkingFund,
  Friend,
  SheepPost,
  HealthReport,
} from '../types';
import {
  getUserLedgers,
  initializeUserDefaultLedgers,
  createLedger,
  updateLedger,
  softDeleteLedger,
  kickMemberFromLedger,
  addMemberToLedger,
} from '../services/ledgerService';
import { prefetchLedgerMembers } from '../services/memberResolverService';
import {
  getUserTransactions,
  createTransaction,
  updateTransaction,
  softDeleteTransaction,
} from '../services/transactionService';
import {
  getUserAssetAccounts,
  createAssetAccount,
  updateAssetAccount,
  softDeleteAssetAccount,
  updateAssetAccountsOrder,
  executeTwoWayTransfer,
} from '../services/walletService';
import {
  getUserCategories,
  createCategory,
  updateCategory,
  softDeleteCategory,
  aiDeduplicateCategories,
} from '../services/categoryService';
import {
  getUserSinkingFunds,
  createSinkingFund,
  updateSinkingFund,
  softDeleteSinkingFund,
  executeSinkingFundDueRecord,
  getUserBudgets,
  setMonthBudget,
  updateBudget,
  deleteBudget,
} from '../services/sinkingFundService';
import {
  getUserFriends,
  ensureUserDummyFriends,
  createCustomFriend,
  addFriendFromInvite,
  softDeleteFriend,
  getSheepPosts,
  createSheepPost,
  togglePostLike,
  softDeleteSheepPost,
} from '../services/friendService';
import {
  getUserHealthReports,
  generateFinancialHealthReport,
} from '../services/healthReportService';
import { getCurrentYearMonth } from '../utils/formatters';

export function useFinanceData(
  userId?: string,
  userName?: string,
  userAvatar?: string,
  lineUserId?: string
) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [assetAccounts, setAssetAccounts] = useState<AssetAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [sinkingFunds, setSinkingFunds] = useState<SinkingFund[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sheepPosts, setSheepPosts] = useState<SheepPost[]>([]);
  const [healthReports, setHealthReports] = useState<HealthReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStatus, setLoadingStatus] = useState<'idle' | 'loading' | 'retrying' | 'ready' | 'stalled'>('idle');

  const retryTimerRef = useRef<any>(null);
  const stallTimerRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(retryTimerRef.current);
      clearTimeout(stallTimerRef.current);
    };
  }, []);

  const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);
  };

  // 安全快取持久化與立即套用
  const applyBundleData = useCallback((data: any) => {
    if (!data || !isMountedRef.current) return;
    if (data.ledgers && data.ledgers.length > 0) setLedgers(data.ledgers);
    if (data.transactions) setTransactions(data.transactions);
    if (data.assetAccounts && data.assetAccounts.length > 0) setAssetAccounts(data.assetAccounts);
    if (data.categories && data.categories.length > 0) setCategories(data.categories);
    if (data.budgets) setBudgets(data.budgets);
    if (data.sinkingFunds) setSinkingFunds(data.sinkingFunds);
    if (data.friends) setFriends(data.friends);
    if (data.sheepPosts) setSheepPosts(data.sheepPosts);
    if (data.healthReports) setHealthReports(data.healthReports);

    if (typeof window !== 'undefined' && userId) {
      try {
        localStorage.setItem(`aos_finance_bundle_${userId}`, JSON.stringify(data));
      } catch {}
    }
  }, [userId]);

  // 初次掛載嘗試從 localStorage 瞬間載入快取 (0ms 消除空白)
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    try {
      const cachedRaw = localStorage.getItem(`aos_finance_bundle_${userId}`);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed && parsed.ledgers && parsed.ledgers.length > 0) {
          applyBundleData(parsed);
          setLoading(false);
          setLoadingStatus('ready');
        }
      }
    } catch {}
  }, [userId, applyBundleData]);

  const reloadData = useCallback(async (isSilent = false) => {
    if (!userId) return;

    if (!isSilent) {
      clearTimeout(retryTimerRef.current);
      clearTimeout(stallTimerRef.current);
      setLoading(true);
      setLoadingStatus('loading');

      // 4 秒門檻：若因行動端網路波動或冷啟動於 4 秒內尚未讀取到資料，Hook 內部在背景靜默發起二次對齊
      retryTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setLoadingStatus((prev) => (prev === 'loading' ? 'retrying' : prev));
        const q = lineUserId ? `?lineUserId=${encodeURIComponent(lineUserId)}` : '';
        fetch(`/api/finance/bundle/${encodeURIComponent(userId)}${q}`)
          .then((r) => r.json())
          .then((bData) => {
            if (bData.success && bData.data && isMountedRef.current) {
              applyBundleData(bData.data);
              clearTimeout(stallTimerRef.current);
              setLoading(false);
              setLoadingStatus('ready');
            }
          })
          .catch(() => {});
      }, 4000);

      // 6 秒門檻：若仍卡住或未讀取到，切換為 stalled 顯示提示卡片並解除阻塞
      stallTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setLoadingStatus((prev) => (prev === 'loading' || prev === 'retrying' ? 'stalled' : prev));
        setLoading(false);
      }, 6000);
    }

    try {
      // 🚀 高速專線 (Bundle Highway)：在發起 Firestore 連線同時立即平行呼叫高速快取專線
      const q = lineUserId ? `?lineUserId=${encodeURIComponent(lineUserId)}` : '';
      const highwayPromise = fetch(`/api/finance/bundle/${encodeURIComponent(userId)}${q}`)
        .then((r) => r.json())
        .catch(() => null);

      // 1. 純讀取檢索使用者名下合法所屬帳本 (設定 2000ms 超時保護)
      const firestoreLedgersPromise = withTimeout(
        getUserLedgers(userId, lineUserId).catch(() => []),
        2000,
        []
      );

      // 等待最先回傳的可用資料
      const [highwayRes, initialLedgers] = await Promise.all([highwayPromise, firestoreLedgersPromise]);

      let userLedgers = initialLedgers;

      // 若高速專線先返回完整資料，立即無縫套用
      if (highwayRes && highwayRes.success && highwayRes.data && highwayRes.data.ledgers?.length > 0) {
        applyBundleData(highwayRes.data);
        userLedgers = highwayRes.data.ledgers;
        if (!isSilent && isMountedRef.current) {
          clearTimeout(retryTimerRef.current);
          clearTimeout(stallTimerRef.current);
          setLoading(false);
          setLoadingStatus('ready');
        }
      }

      // 若 Firestore 成功且仍有帳本，背景增量拉取其餘關聯資料
      let userLedgerIds = (userLedgers || []).map((l: any) => l.id);
      if (userLedgerIds.length > 0) {
        const allMemberIds = (userLedgers || []).flatMap((l: any) => l.memberIds || []);
        if (allMemberIds.length > 0) {
          prefetchLedgerMembers(allMemberIds).catch(() => {});
        }

        try {
          const [txs, assets, cats, bgs, funds, fds, posts, reports] = await withTimeout(
            Promise.all([
              getUserTransactions(userId, lineUserId, userLedgerIds).catch(() => []),
              getUserAssetAccounts(userId, lineUserId).catch(() => []),
              getUserCategories(userId).catch(() => []),
              getUserBudgets(userId).catch(() => []),
              getUserSinkingFunds(userId, lineUserId).catch(() => []),
              getUserFriends(userId, lineUserId).catch(() => []),
              getSheepPosts().catch(() => []),
              getUserHealthReports(userId).catch(() => []),
            ]),
            2500,
            [[], [], [], [], [], [], [], []]
          );

          if (isMountedRef.current && (txs.length > 0 || assets.length > 0 || cats.length > 0)) {
            setLedgers(userLedgers);
            setTransactions(txs);
            setAssetAccounts(assets);
            setCategories(cats);
            setBudgets(bgs);
            setSinkingFunds(funds);
            setFriends(fds);
            setSheepPosts(posts);
            setHealthReports(reports);
          }
        } catch {}
      } else if (!highwayRes || !highwayRes.success) {
        // 若兩者初次皆未取到，二次重試專線
        const secondaryRes = await fetch(`/api/finance/bundle/${encodeURIComponent(userId)}${q}`).then(r => r.json()).catch(() => null);
        if (secondaryRes?.success && secondaryRes.data) {
          applyBundleData(secondaryRes.data);
        }
      }
    } catch (err) {
      console.warn('Load finance data notice:', err);
    } finally {
      if (!isSilent) {
        clearTimeout(retryTimerRef.current);
        clearTimeout(stallTimerRef.current);
      }
      if (isMountedRef.current && !isSilent) {
        setLoading(false);
        setLoadingStatus('ready');
      }
    }
  }, [userId, lineUserId, applyBundleData]);

  useEffect(() => {
    if (userId) {
      reloadData(false);
    }
  }, [userId, reloadData]);

  // 精準即時跨帳號同步 (Scoped Real-time Sync，僅在真實有文件變更時防抖拉取)
  useEffect(() => {
    if (!userId) return;

    let debounceTimer: any = null;
    const triggerSilentReload = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        reloadData(true);
      }, 1500);
    };

    const unsubs: Array<() => void> = [];
    try {
      const cleanLine = lineUserId ? lineUserId.replace(/^line_/, '') : '';

      // 監聽本人建立的交易 (過濾初次掛載觸發，避免重複發起查詢)
      let isInitialTx1 = true;
      unsubs.push(
        onSnapshot(
          query(collection(db, 'transactions'), where('userId', '==', userId)),
          (snap) => {
            if (isInitialTx1) {
              isInitialTx1 = false;
              return;
            }
            if (snap.docChanges().length > 0) triggerSilentReload();
          },
          () => {}
        )
      );

      if (cleanLine && `line_${cleanLine}` !== userId) {
        let isInitialTx2 = true;
        unsubs.push(
          onSnapshot(
            query(collection(db, 'transactions'), where('userId', '==', `line_${cleanLine}`)),
            (snap) => {
              if (isInitialTx2) {
                isInitialTx2 = false;
                return;
              }
              if (snap.docChanges().length > 0) triggerSilentReload();
            },
            () => {}
          )
        );
      }

      // 監聽本人參與的帳本
      let isInitialLedger = true;
      unsubs.push(
        onSnapshot(
          query(collection(db, 'ledgers'), where('memberIds', 'array-contains', userId)),
          (snap) => {
            if (isInitialLedger) {
              isInitialLedger = false;
              return;
            }
            if (snap.docChanges().length > 0) triggerSilentReload();
          },
          () => {}
        )
      );

      let isInitialFriend = true;
      unsubs.push(
        onSnapshot(
          query(collection(db, 'friends'), where('userId', '==', userId)),
          (snap) => {
            if (isInitialFriend) {
              isInitialFriend = false;
              return;
            }
            if (snap.docChanges().length > 0) triggerSilentReload();
          },
          () => {}
        )
      );
    } catch (subErr) {
      console.warn('[Scoped Sync Listeners fallback]:', subErr);
    }

    return () => {
      clearTimeout(debounceTimer);
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
    };
  }, [userId, lineUserId, reloadData]);

  // Actions
  const handleAddTransaction = async (txData: any) => {
    if (!userId) return;
    const newTx = await createTransaction(userId, txData);
    await reloadData();
    return newTx;
  };

  const handleUpdateTransaction = async (id: string, updates: any) => {
    await updateTransaction(id, updates);
    await reloadData();
  };

  const handleDeleteTransaction = async (id: string) => {
    await softDeleteTransaction(id);
    await reloadData();
  };

  const handleTransfer = async (params: {
    ledgerId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    title?: string;
    fromSubAccountId?: string;
    toSubAccountId?: string;
  }) => {
    if (!userId) return;
    const fromId = params.fromAccountId || assetAccounts[0]?.id;
    const toId = params.toAccountId || assetAccounts[1]?.id || assetAccounts[0]?.id;
    if (!fromId || !toId) {
      throw new Error('轉帳必須同時指定轉出帳戶與轉入帳戶');
    }
    await executeTwoWayTransfer(
      userId,
      params.ledgerId || ledgers[0]?.id || 'ledger_default_main',
      fromId,
      toId,
      params.amount,
      params.title,
      params.fromSubAccountId,
      params.toSubAccountId
    );
    await reloadData();
  };

  const handleAddLedger = async (params: any) => {
    if (!userId) return;
    const l = await createLedger(userId, params);
    await reloadData();
    return l;
  };

  const handleUpdateLedger = async (ledgerId: string, updates: any) => {
    await updateLedger(ledgerId, updates);
    await reloadData();
  };

  const handleDeleteLedger = async (ledgerId: string) => {
    await softDeleteLedger(ledgerId);
    await reloadData();
  };

  const handleKickMember = async (ledgerId: string, memberId: string) => {
    if (!userId) return;
    const res = await kickMemberFromLedger(ledgerId, memberId, userId);
    if (res.success) {
      await reloadData();
    }
    return res;
  };

  const handleAddMemberToLedger = async (ledgerId: string, memberId: string) => {
    await addMemberToLedger(ledgerId, memberId);
    await reloadData();
  };

  const handleAddAsset = async (params: any) => {
    if (!userId) return;
    const a = await createAssetAccount(userId, params);
    await reloadData();
    return a;
  };

  const handleUpdateAsset = async (id: string, updates: any) => {
    await updateAssetAccount(id, updates);
    await reloadData();
  };

  const handleDeleteAsset = async (id: string) => {
    await softDeleteAssetAccount(id);
    await reloadData();
  };

  const handleReorderAssets = async (orderedIds: string[]) => {
    if (!userId) return;
    // Optimistic UI update
    setAssetAccounts((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      return orderedIds.map((id, idx) => {
        const item = map.get(id);
        return item ? { ...item, order: idx } : null;
      }).filter(Boolean) as AssetAccount[];
    });
    await updateAssetAccountsOrder(userId, orderedIds);
    await reloadData();
  };

  const handleAddCategory = async (params: any) => {
    if (!userId) return;
    const c = await createCategory(userId, params);
    await reloadData();
    return c;
  };

  const handleUpdateCategory = async (id: string, updates: any) => {
    await updateCategory(id, updates);
    await reloadData();
  };

  const handleDeleteCategory = async (id: string) => {
    await softDeleteCategory(id);
    await reloadData();
  };

  const handleAiDeduplicateCategories = async (): Promise<{ cleanedCount: number; mergedDetails: string[] }> => {
    if (!userId) return { cleanedCount: 0, mergedDetails: [] };
    const res = await aiDeduplicateCategories(userId);
    await reloadData();
    return res || { cleanedCount: 0, mergedDetails: [] };
  };

  const handleAddFriend = async (name: string, avatarUrl?: string) => {
    if (!userId) return;
    const f = await createCustomFriend(userId, name, avatarUrl);
    await reloadData();
    return f;
  };

  const handleDeleteFriend = async (friendId: string) => {
    await softDeleteFriend(friendId);
    await reloadData();
  };

  const handleAddSinkingFund = async (params: any) => {
    if (!userId) return;
    try {
      const f = await createSinkingFund(userId, params);
      await reloadData();
      return f;
    } catch (e) {
      console.warn('[handleAddSinkingFund warning]:', e);
      await reloadData();
      return null;
    }
  };

  const handleUpdateSinkingFund = async (id: string, updates: any) => {
    await updateSinkingFund(id, updates);
    await reloadData();
  };

  const handleExecuteSinkingFund = async (fund: SinkingFund) => {
    if (!userId || ledgers.length === 0) return;
    const dailyLedger = ledgers.find((l) => !l.isShared && !l.deletedAt) || ledgers[0];
    const primaryLedgerId = dailyLedger.id;
    await executeSinkingFundDueRecord(userId, fund, primaryLedgerId);
    await reloadData();
  };

  const handleDeleteSinkingFund = async (id: string) => {
    await softDeleteSinkingFund(id);
    await reloadData();
  };

  const handleSetBudget = async (month: string, amount: number, categoryId?: string) => {
    if (!userId) return;
    const b = await setMonthBudget(userId, month, amount, categoryId);
    await reloadData();
    return b;
  };

  const handleUpdateBudget = async (budgetId: string, amount: number, categoryId?: string) => {
    await updateBudget(budgetId, amount, categoryId);
    await reloadData();
  };

  const handleDeleteBudget = async (budgetId: string) => {
    await deleteBudget(budgetId);
    await reloadData();
  };

  const handleGenerateHealthReport = async (month?: string, customKey?: string) => {
    if (!userId) return;
    const targetMonth = month || getCurrentYearMonth();
    const rep = await generateFinancialHealthReport(
      userId,
      userName || '羊羊朋友',
      userAvatar || '',
      transactions,
      sinkingFunds,
      targetMonth,
      customKey
    );
    await reloadData();
    return rep;
  };

  const handleCreatePost = async (content: string) => {
    if (!userId) return;
    await createSheepPost(userId, userName || '羊羊朋友', userAvatar || '', content);
    await reloadData();
  };

  const handleToggleLike = async (postId: string) => {
    if (!userId) return;
    await togglePostLike(postId, userId);
    await reloadData();
  };

  const handleDeletePost = async (postId: string) => {
    await softDeleteSheepPost(postId);
    await reloadData();
  };

  return {
    ledgers,
    transactions,
    assetAccounts,
    categories,
    budgets,
    sinkingFunds,
    friends,
    sheepPosts,
    healthReports,
    loading,
    loadingStatus,
    reloadData,
    // Methods
    addTransaction: handleAddTransaction,
    updateTransaction: handleUpdateTransaction,
    deleteTransaction: handleDeleteTransaction,
    transfer: handleTransfer,
    addLedger: handleAddLedger,
    updateLedger: handleUpdateLedger,
    deleteLedger: handleDeleteLedger,
    kickMember: handleKickMember,
    addMemberToLedger: handleAddMemberToLedger,
    addAsset: handleAddAsset,
    updateAsset: handleUpdateAsset,
    deleteAsset: handleDeleteAsset,
    reorderAssets: handleReorderAssets,
    addCategory: handleAddCategory,
    updateCategory: handleUpdateCategory,
    deleteCategory: handleDeleteCategory,
    aiDeduplicateCategories: handleAiDeduplicateCategories,
    addFriend: handleAddFriend,
    deleteFriend: handleDeleteFriend,
    addSinkingFund: handleAddSinkingFund,
    updateSinkingFund: handleUpdateSinkingFund,
    executeSinkingFund: handleExecuteSinkingFund,
    deleteSinkingFund: handleDeleteSinkingFund,
    setBudget: handleSetBudget,
    updateBudget: handleUpdateBudget,
    deleteBudget: handleDeleteBudget,
    generateHealthReport: handleGenerateHealthReport,
    createPost: handleCreatePost,
    deletePost: handleDeletePost,
    toggleLike: handleToggleLike,
  };
}
