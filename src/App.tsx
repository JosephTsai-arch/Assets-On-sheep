import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useFinanceData } from './hooks/useFinanceData';
import { ActiveTab, Transaction, Ledger, HealthReport, AssetAccount, SinkingFund, Announcement, PendingBatch } from './types';
import { Navbar } from './components/common/Navbar';
import { BottomTabBar } from './components/common/BottomTabBar';
import { AuthPortal } from './components/auth/AuthPortal';
import { OverviewView } from './components/overview/OverviewView';
import { TransactionListView } from './components/transactions/TransactionListView';
import { WalletView } from './components/wallet/WalletView';
import { CollaborationView } from './components/collaboration/CollaborationView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { AdminView } from './components/admin/AdminView';

// Modals Container
import { AppModalsContainer } from './components/modals/AppModalsContainer';
import { BatchDraftBanner } from './components/common/BatchDraftBanner';
import { getLocalDraft, clearLocalDraft } from './services/batchDraftService';
import { fetchAnnouncements, fetchUserReadAnnouncementIds } from './services/announcementService';
import { TourStep, TourTopicId, UserTourProgress } from './types';
import {
  TOUR_STEPS,
  TOUR_TOPIC_CONFIGS,
  fetchUserTourProgress,
  saveUserTourTopicCompleted,
  resetUserTourProgress,
} from './services/tourService';

import { getCurrentYearMonth } from './utils/formatters';
import { InviteLandingPage, extractInviteCodeFromUrl } from './components/auth/InviteLandingPage';
import { addFriendFromInvite } from './services/friendService';
import { parseTransactionWithGemini } from './services/geminiService';
import {
  executeAtomicAccountMerge,
  getAccountsMergeSummary,
  MergeChoice,
} from './services/accountMergeService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { LoadingTransitionModal } from './components/common/LoadingTransitionModal';

export default function App() {
  const {
    currentUser,
    loading: authLoading,
    error: authError,
    loginWithGoogle,
    loginWithSandbox,
    loginWithRescueCode,
    logout,
    updateProfile,
    isSuperAdmin,
  } = useAuth();

  const finance = useFinanceData(
    currentUser?.id,
    currentUser?.name,
    currentUser?.avatarUrl,
    currentUser?.lineUserId
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Modal states
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetAccount | null>(null);
  const [sinkingModalOpen, setSinkingModalOpen] = useState(false);
  const [editingSinkingFund, setEditingSinkingFund] = useState<SinkingFund | null>(null);
  const [defaultSinkingType, setDefaultSinkingType] = useState<'expense' | 'income'>('expense');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchModalId, setBatchModalId] = useState<string | null>(null);
  const [activeBatchDraft, setActiveBatchDraft] = useState<PendingBatch | null>(null);
  const [healthModalReport, setHealthModalReport] = useState<HealthReport | null>(null);
  const [mergeModalData, setMergeModalData] = useState<any>(null);

  // 初始資料載入溫馨過渡動畫狀態 (提供 3~4 秒從容讀取空間)
  const [isInitialTransitionActive, setIsInitialTransitionActive] = useState<boolean>(true);
  const initialMountTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!finance.loading) {
      // 確保開屏呈現 3 至 4 秒從容讀取空間；資料備妥後平滑衝刺至 100% 並自然淡出切換
      const elapsed = Date.now() - initialMountTimeRef.current;
      const targetDuration = 3200; // 3.2 秒標準品牌節奏
      const remaining = Math.max(0, targetDuration - elapsed);

      const timer = setTimeout(() => {
        setIsInitialTransitionActive(false);
      }, remaining + 350);
      return () => clearTimeout(timer);
    }
  }, [finance.loading]);

  // 批量記帳草稿自動載入與同步
  const refreshBatchDraft = useCallback(async () => {
    const local = getLocalDraft(currentUser?.id);
    if (local && local.status === 'PENDING') {
      setActiveBatchDraft(local);
    }
    if (currentUser?.id) {
      try {
        const res = await fetch(`/api/batch/user/${currentUser.id}/active`);
        const data = await res.json();
        if (data.success && data.batch) {
          setActiveBatchDraft(data.batch);
        } else if (!local) {
          setActiveBatchDraft(null);
        }
      } catch (e) {
        console.warn('Load active draft error:', e);
      }
    }
  }, [currentUser?.id]);

  useEffect(() => {
    refreshBatchDraft();
  }, [refreshBatchDraft]);

  // 公告模塊狀態 (每個帳號獨立已讀狀態、視窗彈出控制)
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);

  // 載入公告與當前帳號獨立已讀狀態
  const loadAnnouncements = useCallback(async () => {
    try {
      const list = await fetchAnnouncements();
      setAnnouncements(list);
      if (currentUser?.id) {
        const reads = await fetchUserReadAnnouncementIds(currentUser.id);
        setReadAnnouncementIds(reads);

        // 視窗彈出功能 (popupInApp: true):
        // 若有新公告且該帳號尚未閱讀，且本工作階段尚未自動彈出過，則自動彈出公告縮文視窗
        const hasUnreadPopup = list.some(
          (a) => a.popupInApp && !reads.includes(a.id)
        );
        const sessionKey = `aos_autopopup_done_${currentUser.id}`;
        const alreadyPopped = sessionStorage.getItem(sessionKey);
        if (hasUnreadPopup && !alreadyPopped) {
          sessionStorage.setItem(sessionKey, 'true');
          setAnnouncementModalOpen(true);
        }
      }
    } catch (err) {
      console.warn('[loadAnnouncements error]:', err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const handleMarkAnnouncementRead = (annId: string) => {
    setReadAnnouncementIds((prev) => Array.from(new Set([...prev, annId])));
  };

  const handleMarkAllAnnouncementsRead = () => {
    setReadAnnouncementIds(announcements.map((a) => a.id));
  };

  const unreadAnnouncementsCount = currentUser
    ? announcements.filter((a) => !readAnnouncementIds.includes(a.id)).length
    : 0;

  // 新手導覽狀態管理 (點亮與調暗引導、隨時中斷、主題學習)
  const [tourProgress, setTourProgress] = useState<UserTourProgress>({
    userId: currentUser?.id || '',
    completedTopics: [],
    isFullyCompleted: false,
    updatedAt: '',
  });
  const [isTourHubOpen, setIsTourHubOpen] = useState(false);
  const [activeTourTopicId, setActiveTourTopicId] = useState<TourTopicId | null>(null);
  const [currentTourStepIndex, setCurrentTourStepIndex] = useState(0);
  const [isFullTourMode, setIsFullTourMode] = useState(false);
  const [isLineRealTourOpen, setIsLineRealTourOpen] = useState(false);

  // 載入新手導覽進度
  const loadTourProgress = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const prog = await fetchUserTourProgress(currentUser.id);
      setTourProgress(prog);
    } catch (e) {
      console.warn('[loadTourProgress error]:', e);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadTourProgress();
  }, [loadTourProgress]);

  // 當前主題之所有步驟
  const activeTopicSteps = useMemo(() => {
    if (!activeTourTopicId) return [];
    return TOUR_STEPS.filter((s) => s.topicId === activeTourTopicId);
  }, [activeTourTopicId]);

  const currentTourStep = activeTopicSteps[currentTourStepIndex] || null;

  // 啟動特定主題導覽
  const handleStartTourTopic = (topicId: TourTopicId) => {
    setIsTourHubOpen(false);
    setActiveTourTopicId(topicId);
    setCurrentTourStepIndex(0);
    setIsFullTourMode(false);

    const firstStep = TOUR_STEPS.find((s) => s.topicId === topicId);
    if (firstStep?.requiredTab && activeTab !== firstStep.requiredTab) {
      setActiveTab(firstStep.requiredTab);
    }
    if (firstStep?.interactiveModal === 'line_real' || topicId === 'line_bot') {
      setIsLineRealTourOpen(true);
    }
  };

  // 啟動全套完整導覽
  const handleStartFullTour = () => {
    setIsTourHubOpen(false);
    setIsFullTourMode(true);
    const firstTopic = TOUR_TOPIC_CONFIGS[0];
    setActiveTourTopicId(firstTopic.id);
    setCurrentTourStepIndex(0);
    const firstStep = TOUR_STEPS.find((s) => s.topicId === firstTopic.id);
    if (firstStep?.requiredTab && activeTab !== firstStep.requiredTab) {
      setActiveTab(firstStep.requiredTab);
    }
  };

  // 導覽下一步
  const handleTourNext = async () => {
    if (!currentTourStep || !activeTourTopicId) return;

    if (currentTourStepIndex < activeTopicSteps.length - 1) {
      const nextIndex = currentTourStepIndex + 1;
      const nextStep = activeTopicSteps[nextIndex];
      setCurrentTourStepIndex(nextIndex);

      if (nextStep.requiredTab && activeTab !== nextStep.requiredTab) {
        setActiveTab(nextStep.requiredTab);
      }
      if (nextStep.interactiveModal === 'transaction') {
        setTxModalOpen(true);
      }
      if (nextStep.interactiveModal === 'line_real') {
        setIsLineRealTourOpen(true);
      }
    } else {
      // 標記完成該主題
      if (currentUser?.id) {
        const updated = await saveUserTourTopicCompleted(currentUser.id, activeTourTopicId);
        setTourProgress(updated);
      }

      // 若為全套連續導覽，自動推進至下一個主題
      if (isFullTourMode) {
        const topicIdx = TOUR_TOPIC_CONFIGS.findIndex((t) => t.id === activeTourTopicId);
        if (topicIdx >= 0 && topicIdx < TOUR_TOPIC_CONFIGS.length - 1) {
          const nextTopic = TOUR_TOPIC_CONFIGS[topicIdx + 1];
          setActiveTourTopicId(nextTopic.id);
          setCurrentTourStepIndex(0);
          const firstNextStep = TOUR_STEPS.find((s) => s.topicId === nextTopic.id);
          if (firstNextStep?.requiredTab && activeTab !== firstNextStep.requiredTab) {
            setActiveTab(firstNextStep.requiredTab);
          }
          if (firstNextStep?.interactiveModal === 'line_real' || nextTopic.id === 'line_bot') {
            setIsLineRealTourOpen(true);
          }
          return;
        }
      }

      // 單一主題完成或全套跑完
      setActiveTourTopicId(null);
      setCurrentTourStepIndex(0);
      setIsFullTourMode(false);
      setIsTourHubOpen(true);
    }
  };

  // 導覽上一步
  const handleTourPrev = () => {
    if (currentTourStepIndex > 0) {
      const prevIndex = currentTourStepIndex - 1;
      const prevStep = activeTopicSteps[prevIndex];
      setCurrentTourStepIndex(prevIndex);
      if (prevStep.requiredTab && activeTab !== prevStep.requiredTab) {
        setActiveTab(prevStep.requiredTab);
      }
    }
  };

  // 一鍵重設學習紀錄
  const handleResetTourProgress = async () => {
    if (!currentUser?.id) return;
    const fresh = await resetUserTourProgress(currentUser.id);
    setTourProgress(fresh);
  };

  // 智慧示範/代填操作
  const handleTourAutoAction = async (step: TourStep) => {
    switch (step.id) {
      case 'assets_1':
        setActiveTab('wallet');
        handleTourNext();
        break;
      case 'assets_2': {
        const cashAcc = finance.assetAccounts.find((a) => a.type === 'cash' || a.name.includes('現金'));
        if (cashAcc) {
          await finance.updateAsset(cashAcc.id, { balance: 5000 });
        }
        handleTourNext();
        break;
      }
      case 'assets_3': {
        const budgetTabBtn = document.querySelector('[data-tour="tab-budgets"]') as HTMLButtonElement;
        if (budgetTabBtn) budgetTabBtn.click();
        handleTourNext();
        break;
      }
      case 'assets_4': {
        const foodCat = finance.categories.find((c) => c.name.includes('飲食') || c.name.includes('餐飲'));
        await finance.setBudget(getCurrentYearMonth(), 9000, foodCat?.id || 'total');
        handleTourNext();
        break;
      }
      case 'assets_5': {
        const sinkingTabBtn = document.querySelector('[data-tour="tab-sinking"]') as HTMLButtonElement;
        if (sinkingTabBtn) sinkingTabBtn.click();
        handleTourNext();
        break;
      }
      case 'assets_6': {
        await finance.addSinkingFund({
          title: '每月固定房租',
          name: '每月固定房租',
          type: 'expense',
          targetAmount: 15000,
          amount: 15000,
          cycle: 'monthly',
          period: 'monthly',
          nextDueDate: getCurrentYearMonth(),
          dueDay: 1,
          autoExecute: true,
          currency: 'TWD',
        });
        handleTourNext();
        break;
      }
      case 'assets_7': {
        await finance.addSinkingFund({
          title: '每月正職薪資',
          name: '每月正職薪資',
          type: 'income',
          targetAmount: 50000,
          amount: 50000,
          cycle: 'monthly',
          period: 'monthly',
          nextDueDate: getCurrentYearMonth(),
          dueDay: 5,
          autoExecute: true,
          currency: 'TWD',
        });
        handleTourNext();
        break;
      }
      case 'tx_1':
        setEditingTx(null);
        setTxModalOpen(true);
        handleTourNext();
        break;
      case 'tx_2': {
        const cashAccForTx = finance.assetAccounts.find((a) => a.type === 'cash' || a.name.includes('現金')) || finance.assetAccounts[0];
        const foodCatForTx = finance.categories.find((c) => c.name.includes('餐飲') || c.name.includes('飲食')) || finance.categories[0];
        await finance.addTransaction({
          title: '午餐',
          amount: 150,
          currency: 'TWD',
          type: 'expense',
          categoryId: foodCatForTx?.id || 'cat_food',
          categoryName: foodCatForTx?.name || '餐飲美食',
          accountId: cashAccForTx?.id || 'acc_default',
          date: new Date().toISOString().split('T')[0],
        });
        setTxModalOpen(false);
        handleTourNext();
        break;
      }
      case 'tx_3':
        setTxModalOpen(true);
        setTimeout(() => {
          const aiInput = document.querySelector('[data-tour="tx-ai-input-box"]') as HTMLInputElement;
          if (aiInput) {
            aiInput.value = '晚餐吃牛排現金250';
            aiInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 300);
        handleTourNext();
        break;
      case 'tx_4': {
        const cashForSteak = finance.assetAccounts.find((a) => a.type === 'cash' || a.name.includes('現金')) || finance.assetAccounts[0];
        const foodForSteak = finance.categories.find((c) => c.name.includes('餐飲') || c.name.includes('飲食')) || finance.categories[0];
        await finance.addTransaction({
          title: '晚餐吃牛排',
          amount: 250,
          currency: 'TWD',
          type: 'expense',
          categoryId: foodForSteak?.id || 'cat_food',
          categoryName: foodForSteak?.name || '餐飲美食',
          accountId: cashForSteak?.id || 'acc_default',
          date: new Date().toISOString().split('T')[0],
          note: 'AI 語意解析自動入帳',
        });
        setTxModalOpen(false);
        handleTourNext();
        break;
      }
      case 'overview_1':
        setActiveTab('overview');
        handleTourNext();
        break;
      case 'overview_6':
        setActiveTab('wallet');
        setTimeout(() => {
          const radarEl = document.querySelector('#radar-section');
          if (radarEl) radarEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
        handleTourNext();
        break;
      case 'overview_7':
        setActiveTab('analytics');
        handleTourNext();
        break;
      case 'overview_8': {
        const rep = await finance.generateHealthReport();
        if (rep) setHealthModalReport(rep);
        handleTourNext();
        break;
      }
      case 'split_1':
        setActiveTab('collaboration');
        handleTourNext();
        break;
      case 'split_2':
        if (currentUser?.id) {
          await finance.addLedger({
            name: '週末出遊AA帳',
            currency: 'TWD',
            isShared: true,
            memberIds: [currentUser.id],
          });
        }
        handleTourNext();
        break;
      case 'split_3': {
        const sharedL = finance.ledgers.find((l) => l.isShared) || finance.ledgers[0];
        const userAcc = finance.assetAccounts[0];
        const userCat = finance.categories[0];
        if (sharedL && currentUser) {
          await finance.addTransaction({
            title: '出遊海鮮晚餐',
            amount: 600,
            currency: 'TWD',
            type: 'expense',
            ledgerId: sharedL.id,
            accountId: userAcc?.id || 'acc_default',
            categoryId: userCat?.id || 'cat_food',
            categoryName: userCat?.name || '餐飲美食',
            date: new Date().toISOString().split('T')[0],
            splitDetails: [
              { memberId: currentUser.id, memberName: currentUser.name, amount: 300, isSettled: false },
              { memberId: 'friend_demo', memberName: '小羊好友', amount: 300, isSettled: false },
            ],
            payerId: currentUser.id,
            payerName: currentUser.name,
          });
        }
        handleTourNext();
        break;
      }
      case 'line_1':
        setIsLineRealTourOpen(true);
        handleTourNext();
        break;
      default:
        handleTourNext();
        break;
    }
  };

  // Check URL query for LINE invite links
  useEffect(() => {
    // 全域鎖定導覽在 LINE 內
    import('./services/liffService').then(({ lockNavigationInsideLine }) => {
      lockNavigationInsideLine();
    });

    const params = new URLSearchParams(window.location.search);
    const openModalParam = params.get('openModal');
    if (openModalParam === 'reminder') {
      setReminderModalOpen(true);
      params.delete('openModal');
      const newQuery = params.toString() ? `?${params.toString()}` : '';
      window.history.replaceState({}, document.title, window.location.pathname + newQuery);
    }
    if (openModalParam === 'batch') {
      const bid = params.get('bid');
      if (bid) {
        setBatchModalId(bid);
        setBatchModalOpen(true);
        params.delete('openModal');
        params.delete('bid');
        const newQuery = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState({}, document.title, window.location.pathname + newQuery);
      }
    }

    const invite = params.get('invite');
    if (invite && currentUser) {
      try {
        const decoded = atob(invite);
        const [inviterId, inviterName] = decoded.split(':::');
        if (inviterId && inviterId !== currentUser.id) {
          addFriendFromInvite(currentUser.id, inviterId, decodeURIComponent(inviterName || '好友'))
            .then(() => {
              finance.reloadData();
              // Clean URL query
              window.history.replaceState({}, document.title, window.location.pathname);
            })
            .catch(console.warn);
        }
      } catch (err) {
        console.warn('Invalid invite link', err);
      }
    }
  }, [currentUser]);

  // Gemini AI text parse handler
  const handleAiParse = async (text: string) => {
    // 優先調用後端代理端點（使用伺服器端 GEMINI_API_KEY 與 gemini-3.8-flash 大模型）
    try {
      const resp = await fetch('/api/gemini/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          userLedgers: finance.ledgers,
          userFriends: finance.friends,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.parsed) {
          return data.parsed;
        }
      }
    } catch (apiErr) {
      console.warn('[handleAiParse] 後端語意解析端點不可用，降級使用本地/客戶端引擎:', apiErr);
    }

    return await parseTransactionWithGemini(
      text,
      finance.ledgers,
      finance.friends
    );
  };

  // Gmail 與 LINE 雙向帳號融合發起
  const handleOpenAccountMerge = async () => {
    if (!currentUser) return;
    let targetLineId = currentUser.lineUserId || '';
    if (!targetLineId) {
      const input = prompt(
        '【Gmail 與 LINE 雙向帳號融合】\n請輸入欲整合的 LINE User ID（例如 U12345678... 或在 LINE 機器人對話傳送「帳號」獲取）：'
      );
      if (!input || !input.trim()) return;
      targetLineId = input.trim();
    }

    try {
      const summary = await getAccountsMergeSummary(currentUser.id, targetLineId);
      setMergeModalData(summary);
    } catch (err: any) {
      console.warn(`取得帳號融合資料失敗：${err?.message || '未知錯誤'}`);
    }
  };

  // 執行三選一原子融合
  const handleExecuteMerge = async (choice: MergeChoice) => {
    if (!mergeModalData) return;
    try {
      let survivingUserId = '';
      try {
        const apiRes = await fetch('/api/auth/account-merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleUserId: mergeModalData.googleUserId,
            lineUserId: mergeModalData.lineUserId,
            choice,
          }),
        });
        const data = await apiRes.json();
        if (data.success && data.survivingUserId) {
          survivingUserId = data.survivingUserId;
        }
      } catch (apiErr) {
        console.warn('Backend merge fallback to client SDK:', apiErr);
      }

      if (!survivingUserId) {
        const res = await executeAtomicAccountMerge(
          mergeModalData.googleUserId,
          mergeModalData.lineUserId,
          choice
        );
        survivingUserId = res.survivingUserId;
      }

      if (survivingUserId) {
        const userDoc = await getDoc(doc(db, 'users', survivingUserId));
        if (userDoc.exists()) {
          const surviving = userDoc.data() as any;
          localStorage.setItem('aos_sandbox_user', JSON.stringify(surviving));
        }
      }
      setMergeModalData(null);
      await finance.reloadData();
      window.location.reload();
    } catch (err: any) {
      console.error('Merge error:', err);
    }
  };

  // LIFF 專屬邀請函無感註冊與好友綁定路由判斷
  const isInviteFlow = typeof window !== 'undefined' && (
    !!extractInviteCodeFromUrl() || window.location.pathname.startsWith('/invite')
  );

  if (isInviteFlow) {
    return <InviteLandingPage onSuccess={() => finance.reloadData()} />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3.5 text-center max-w-xs">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-stone-700">資產上羊載入中...</p>
            <p className="text-[11px] text-stone-400">正在為您同步 LINE 個人帳本與空間</p>
          </div>
          <button
            type="button"
            onClick={() => {
              // 逃生門：若等待超過預期，清除 URL 參數並立即進入
              try {
                window.history.replaceState({}, document.title, '/');
              } catch {}
              window.location.reload();
            }}
            className="text-[11px] text-emerald-700 hover:text-emerald-800 underline font-medium mt-2 cursor-pointer"
          >
            若等待過久請點此直接進入
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPortal
        onGoogleLogin={loginWithGoogle}
        onSandboxLogin={loginWithSandbox}
        onRescueLogin={loginWithRescueCode}
        loading={authLoading}
        error={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-stone-900 overflow-x-hidden pb-24 md:pb-12 select-text">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        unreadAnnouncementsCount={unreadAnnouncementsCount}
        onOpenAnnouncementModal={() => setAnnouncementModalOpen(true)}
        onOpenTourHub={() => setIsTourHubOpen(true)}
        onOpenReminderModal={() => setReminderModalOpen(true)}
        onOpenTransactionModal={() => {
          setEditingTx(null);
          setTxModalOpen(true);
        }}
        onOpenCategoryModal={() => setCategoryModalOpen(true)}
        onOpenProfileModal={() => setProfileModalOpen(true)}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <BatchDraftBanner
          draft={activeBatchDraft}
          onOpenEdit={(bid) => {
            setBatchModalId(bid);
            setBatchModalOpen(true);
          }}
          onCommitSuccess={() => {
            clearLocalDraft(currentUser?.id);
            setActiveBatchDraft(null);
            finance.reloadData();
          }}
          onDiscard={() => {
            clearLocalDraft(currentUser?.id);
            setActiveBatchDraft(null);
          }}
          currentUserId={currentUser.id}
        />

        {activeTab === 'overview' && (
          <OverviewView
            currentUserId={currentUser.id}
            userName={currentUser.name}
            transactions={finance.transactions}
            assetAccounts={finance.assetAccounts}
            ledgers={finance.ledgers}
            budgets={finance.budgets}
            categories={finance.categories}
            friends={finance.friends}
            loading={finance.loading}
            loadingStatus={finance.loadingStatus}
            onReload={() => finance.reloadData()}
            onNavigateToTransactions={() => setActiveTab('transactions')}
            onOpenTransactionModal={() => {
              setEditingTx(null);
              setTxModalOpen(true);
            }}
            onOpenLineTour={() => setIsLineRealTourOpen(true)}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionListView
            currentUserId={currentUser.id}
            transactions={finance.transactions}
            ledgers={finance.ledgers}
            assetAccounts={finance.assetAccounts}
            categories={finance.categories}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setTxModalOpen(true);
            }}
            onDeleteTransaction={finance.deleteTransaction}
            onOpenAddModal={() => {
              setEditingTx(null);
              setTxModalOpen(true);
            }}
          />
        )}

        {activeTab === 'wallet' && (
          <WalletView
            assetAccounts={finance.assetAccounts}
            sinkingFunds={finance.sinkingFunds}
            budgets={finance.budgets}
            categories={finance.categories}
            transactions={finance.transactions}
            ledgers={finance.ledgers}
            currentUserId={currentUser?.id || ''}
            onOpenTransferModal={() => setTransferModalOpen(true)}
            onOpenAddAsset={() => {
              setEditingAsset(null);
              setAssetModalOpen(true);
            }}
            onEditAsset={(asset) => {
              setEditingAsset(asset);
              setAssetModalOpen(true);
            }}
            onOpenAddSinkingFund={() => {
              setEditingSinkingFund(null);
              setDefaultSinkingType('expense');
              setSinkingModalOpen(true);
            }}
            onOpenAddSinkingFundWithType={(type) => {
              setEditingSinkingFund(null);
              setDefaultSinkingType(type);
              setSinkingModalOpen(true);
            }}
            onEditSinkingFund={(fund) => {
              setEditingSinkingFund(fund);
              setDefaultSinkingType(fund.type === 'income' ? 'income' : 'expense');
              setSinkingModalOpen(true);
            }}
            onExecuteSinkingFund={finance.executeSinkingFund}
            onDeleteSinkingFund={finance.deleteSinkingFund}
            onDeleteAsset={finance.deleteAsset}
            onReorderAssets={finance.reorderAssets}
            onSetBudget={finance.setBudget}
            onUpdateBudget={finance.updateBudget}
            onDeleteBudget={finance.deleteBudget}
          />
        )}

        {activeTab === 'collaboration' && (
          <CollaborationView
            ledgers={finance.ledgers}
            transactions={finance.transactions}
            friends={finance.friends}
            sheepPosts={finance.sheepPosts}
            assetAccounts={finance.assetAccounts}
            currentUserId={currentUser.id}
            currentUserName={currentUser.name}
            onOpenAddLedger={() => {
              setEditingLedger(null);
              setLedgerModalOpen(true);
            }}
            onEditLedger={(ledger) => {
              setEditingLedger(ledger);
              setLedgerModalOpen(true);
            }}
            onDeleteLedger={finance.deleteLedger}
            onKickMember={finance.kickMember}
            onAddMemberToLedger={finance.addMemberToLedger}
            onCreatePost={finance.createPost}
            onDeletePost={finance.deletePost}
            onToggleLike={finance.toggleLike}
            onDeleteFriend={finance.deleteFriend}
            onAddFriend={finance.addFriend}
            onReload={finance.reloadData}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            currentUserId={currentUser?.id || ''}
            transactions={finance.transactions}
            categories={finance.categories}
            healthReports={finance.healthReports}
            onOpenCategoryModal={() => setCategoryModalOpen(true)}
            onStartHealthCheck={async () => {
              const rep = await finance.generateHealthReport();
              if (rep) setHealthModalReport(rep);
            }}
            onViewReport={(rep) => setHealthModalReport(rep)}
          />
        )}

        {activeTab === 'admin' && isSuperAdmin && (
          <AdminView
            currentUser={currentUser}
            onViewReport={(rep) => setHealthModalReport(rep)}
            onAnnouncementsUpdated={loadAnnouncements}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar with FAB */}
      <BottomTabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSuperAdmin={isSuperAdmin}
        onOpenTransactionModal={() => {
          setEditingTx(null);
          setTxModalOpen(true);
        }}
      />
      {/* Modals Container */}
      <AppModalsContainer
        currentUser={currentUser}
        finance={finance}
        updateProfile={updateProfile}
        handleAiParse={handleAiParse}
        txModalOpen={txModalOpen}
        setTxModalOpen={setTxModalOpen}
        editingTx={editingTx}
        setEditingTx={setEditingTx}
        transferModalOpen={transferModalOpen}
        setTransferModalOpen={setTransferModalOpen}
        ledgerModalOpen={ledgerModalOpen}
        setLedgerModalOpen={setLedgerModalOpen}
        editingLedger={editingLedger}
        setEditingLedger={setEditingLedger}
        categoryModalOpen={categoryModalOpen}
        setCategoryModalOpen={setCategoryModalOpen}
        assetModalOpen={assetModalOpen}
        setAssetModalOpen={setAssetModalOpen}
        editingAsset={editingAsset}
        setEditingAsset={setEditingAsset}
        sinkingModalOpen={sinkingModalOpen}
        setSinkingModalOpen={setSinkingModalOpen}
        editingSinkingFund={editingSinkingFund}
        setEditingSinkingFund={setEditingSinkingFund}
        defaultSinkingType={defaultSinkingType}
        profileModalOpen={profileModalOpen}
        setProfileModalOpen={setProfileModalOpen}
        healthModalReport={healthModalReport}
        setHealthModalReport={setHealthModalReport}
        mergeModalData={mergeModalData}
        setMergeModalData={setMergeModalData}
        handleExecuteMerge={handleExecuteMerge}
        announcementModalOpen={announcementModalOpen}
        setAnnouncementModalOpen={setAnnouncementModalOpen}
        announcements={announcements}
        readAnnouncementIds={readAnnouncementIds}
        handleMarkAnnouncementRead={handleMarkAnnouncementRead}
        handleMarkAllAnnouncementsRead={handleMarkAllAnnouncementsRead}
        currentTourStep={currentTourStep}
        activeTourTopicId={activeTourTopicId}
        setActiveTourTopicId={setActiveTourTopicId}
        setIsFullTourMode={setIsFullTourMode}
        handleTourNext={handleTourNext}
        handleTourPrev={handleTourPrev}
        handleTourAutoAction={handleTourAutoAction}
        isTourHubOpen={isTourHubOpen}
        setIsTourHubOpen={setIsTourHubOpen}
        tourProgress={tourProgress}
        handleStartTourTopic={handleStartTourTopic}
        handleStartFullTour={handleStartFullTour}
        handleResetTourProgress={handleResetTourProgress}
        isLineRealTourOpen={isLineRealTourOpen}
        setIsLineRealTourOpen={setIsLineRealTourOpen}
        loadTourProgress={loadTourProgress}
        reminderModalOpen={reminderModalOpen}
        setReminderModalOpen={setReminderModalOpen}
        batchModalOpen={batchModalOpen}
        setBatchModalOpen={setBatchModalOpen}
        batchModalId={batchModalId}
        refreshBatchDraft={refreshBatchDraft}
        clearLocalDraft={clearLocalDraft}
        setActiveBatchDraft={setActiveBatchDraft}
      />

      {/* 品牌溫馨過渡動畫 (3~4秒) 與卡住自動重試/輔助 */}
      <LoadingTransitionModal
        show={isInitialTransitionActive && Boolean(currentUser)}
        loadingStatus={finance.loadingStatus}
        onRetry={() => finance.reloadData()}
        onDismiss={() => setIsInitialTransitionActive(false)}
        userName={currentUser?.name}
      />
    </div>
  );
}
