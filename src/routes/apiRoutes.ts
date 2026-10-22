import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authGuard, AuthenticatedRequest } from '../middleware/authGuard';
import { getGlobalSystemConfig, saveGlobalSystemConfig } from '../services/systemService';
import {
  createRescueCode,
  verifyRescueCode,
  deepRestoreLedger,
  getSoftDeletedItemsByUser,
} from '../services/disasterService';
import {
  parseTransactionWithGemini,
  generateFinancialHealthCheckAnalysis,
} from '../services/geminiService';
import { processLineWebhookPayload } from '../services/lineWebhookService';
import { removeLineRichMenu, buildPinnedQuickReply } from '../services/lineRichMenuService';
import { buildAnnouncementFlexMessage } from '../services/lineFlexTemplates';
import { executeAtomicAccountMerge } from '../services/accountMergeService';
import {
  authenticateLineUserAndIssueCustomToken,
  handleLiffInviteRegistration,
  authenticateGoogleUser,
} from '../services/serverAuthService';
import {
  authRateLimiter,
  rescueRateLimiter,
  geminiAiRateLimiter,
  broadcastRateLimiter,
} from '../middleware/rateLimiter';
import {
  isSuperAdminUser,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_LINE_USER_ID,
  SUPER_ADMIN_LINE_UID,
  SUPER_ADMIN_GOOGLE_UID,
} from '../firebase/config';
import { getAppBaseUrl, getLiffId, getLiffUrl } from '../utils/urlUtils';

const router = Router();

// Google 官方/Gmail 登入與總管理員身分直接認證通道 (含頻率限制防刷保護)
router.post('/auth/google', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await authenticateGoogleUser(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('[API /auth/google Error]:', error);
    res.status(400).json({ success: false, error: error?.message || 'Google 認證失敗' });
  }
});

// LIFF 專屬邀請函無感註冊與好友雙向綁定 (含頻率限制防刷保護)
router.post('/auth/liff-invite', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await handleLiffInviteRegistration(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('[API /auth/liff-invite Error]:', error);
    res.status(400).json({ success: false, error: error?.message || 'LIFF 邀請註冊綁定失敗' });
  }
});

// LINE 官方登入與身分歸一化換發 Token (含頻率限制防刷保護)
router.post('/auth/line', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await authenticateLineUserAndIssueCustomToken(req.body);
    res.json({
      success: true,
      customToken: result.customToken,
      user: result.user,
      uid: result.uid,
      needMerge: result.needMerge,
      mergeSummary: result.mergeSummary,
    });
  } catch (error: any) {
    console.error('[API /auth/line Error]:', error);
    res.status(400).json({ success: false, error: error?.message || 'LINE 認證失敗' });
  }
});

// 帳號雙向融合預覽統計
router.post('/auth/account-merge-summary', async (req: Request, res: Response) => {
  try {
    const { googleUserId, lineUserId } = req.body;
    if (!googleUserId || !lineUserId) {
      res.status(400).json({ success: false, error: '缺少帳號識別參數 (googleUserId & lineUserId)' });
      return;
    }
    const { getAccountsMergeSummary } = await import('../services/accountMergeService');
    const summary = await getAccountsMergeSummary(googleUserId, lineUserId);
    res.json({ success: true, summary });
  } catch (error: any) {
    console.error('[API /auth/account-merge-summary Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '統計融合資料失敗' });
  }
});

// 執行 Gmail 與 LINE 三選一原子融合 (含參數邊界防護)
router.post('/auth/account-merge', async (req: Request, res: Response) => {
  try {
    const { googleUserId, lineUserId, choice } = req.body;
    if (!googleUserId || !lineUserId || !choice) {
      res.status(400).json({ success: false, error: '缺少融合參數 (googleUserId, lineUserId, choice)' });
      return;
    }
    const validChoices = ['keep_google', 'keep_line', 'smart_merge'];
    if (!validChoices.includes(choice)) {
      res.status(400).json({ success: false, error: '無效的融合選項 (choice invalid)' });
      return;
    }
    const result = await executeAtomicAccountMerge(googleUserId, lineUserId, choice);
    res.json({ success: true, survivingUserId: result.survivingUserId });
  } catch (error: any) {
    console.error('[API /auth/account-merge Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '帳號融合執行失敗' });
  }
});

// 取得 LINE 官方用戶即時資料 (暱稱與大頭貼)
router.get('/line/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { fetchLineUserProfile } = await import('../services/lineProfileService');
    const profile = await fetchLineUserProfile(req.params.userId);
    if (!profile) {
      res.status(404).json({ success: false, error: '找不到該 LINE 用戶資料，請確認 Channel Access Token 是否有效' });
      return;
    }
    res.json({ success: true, profile });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// 取得 LINE 官方 OAuth 授權跳轉連結
router.get('/auth/line/login-url', async (req: Request, res: Response) => {
  try {
    let liffId = process.env.VITE_LINE_LIFF_ID || '';
    let channelId = process.env.LINE_CHANNEL_ID || '2000000000';

    try {
      const config = await getGlobalSystemConfig();
      if (config?.liffId) liffId = config.liffId;
      if (config?.lineChannelId) channelId = config.lineChannelId;
    } catch {
      // 未登入訪客防護
    }

    const redirectUri = (req.query.redirectUri as string) || `${req.protocol}://${req.get('host')}/`;

    if (liffId) {
      res.json({ success: true, url: `https://liff.line.me/${liffId}`, type: 'liff' });
      return;
    }

    const state = Math.random().toString(36).substring(7);
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid`;
    res.json({ success: true, url: lineAuthUrl, type: 'oauth' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 取得前端公開安全配置 (如 LIFF ID，無敏感金鑰)
router.get('/system/public-config', async (_req: Request, res: Response) => {
  try {
    let liffId = process.env.VITE_LINE_LIFF_ID || '';
    try {
      const config = await getGlobalSystemConfig();
      if (config?.liffId) liffId = config.liffId;
    } catch {
      // 容錯防護
    }
    res.json({ success: true, liffId });
  } catch (error: any) {
    res.json({ success: true, liffId: '' });
  }
});

// 系統金鑰設定 (僅 super_admin 可讀寫)
router.get('/system/config', authGuard('super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getGlobalSystemConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/system/config', authGuard('super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await saveGlobalSystemConfig(req.body);
    res.json({ success: true, config: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 災難救援中心：核發 8 碼英數亂數
router.post('/rescue/generate', authGuard('super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      res.status(400).json({ success: false, error: 'targetUserId required' });
      return;
    }
    const rescueCode = await createRescueCode(targetUserId, req.userEmail || 'super_admin');
    res.json({ success: true, rescueCode });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 災難救援中心：驗證救援碼 (同 IP 連錯 5 次鎖定 15 分鐘，含高階限流保護)
router.post('/rescue/verify', rescueRateLimiter, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const result = await verifyRescueCode(code, ip);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    if (SUPER_ADMIN_LINE_USER_ID && SUPER_ADMIN_GOOGLE_UID && result.targetUserId === `line_${SUPER_ADMIN_LINE_USER_ID}`) {
      result.targetUserId = SUPER_ADMIN_GOOGLE_UID;
    }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 深度軟復原 (Deep Restore)
router.post('/rescue/deep-restore', authGuard('super_admin'), async (req: Request, res: Response) => {
  try {
    const { ledgerId } = req.body;
    if (!ledgerId) {
      res.status(400).json({ success: false, error: 'ledgerId required' });
      return;
    }
    const restoredTxCount = await deepRestoreLedger(ledgerId);
    res.json({ success: true, restoredTxCount });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 查詢特定用戶被軟刪除的資料
router.get('/rescue/deleted-items/:userId', authGuard('super_admin'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const data = await getSoftDeletedItemsByUser(userId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 帳號原子雙向綁定與三選一資料融合
router.post('/account/merge', async (req: Request, res: Response) => {
  try {
    const { googleUserId, lineUserId, choice } = req.body;
    if (!googleUserId || !lineUserId || !choice) {
      res.status(400).json({ success: false, error: 'Missing parameters' });
      return;
    }
    const validChoices = ['keep_google', 'keep_line', 'smart_merge'];
    if (!validChoices.includes(choice)) {
      res.status(400).json({ success: false, error: 'Invalid choice parameter' });
      return;
    }
    const result = await executeAtomicAccountMerge(googleUserId, lineUserId, choice);
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 記憶體高速快取 (完全杜絕在工作區磁碟生成包含用戶 ID 之明文個人財務 .json 檔案)
const memoryBundleCache = new Map<string, { data: any; updatedAt: number }>();

function getNormalizedUserId(userId: string): string {
  if (
    SUPER_ADMIN_GOOGLE_UID &&
    (userId === SUPER_ADMIN_GOOGLE_UID ||
      userId === SUPER_ADMIN_LINE_UID ||
      (SUPER_ADMIN_LINE_USER_ID && (userId === `line_${SUPER_ADMIN_LINE_USER_ID}` || userId === SUPER_ADMIN_LINE_USER_ID)) ||
      (SUPER_ADMIN_EMAIL && userId === SUPER_ADMIN_EMAIL))
  ) {
    return SUPER_ADMIN_GOOGLE_UID;
  }
  return userId;
}

function saveUserBundleCache(userId: string, data: any) {
  try {
    const normId = getNormalizedUserId(userId);
    const entry = { data, updatedAt: Date.now() };
    memoryBundleCache.set(normId, entry);
    if (normId !== userId) {
      memoryBundleCache.set(userId, entry);
    }
  } catch (err) {
    console.warn('[saveUserBundleCache Error]:', err);
  }
}

function readUserBundleCache(userId: string): any | null {
  try {
    const normId = getNormalizedUserId(userId);
    const cached = memoryBundleCache.get(normId) || memoryBundleCache.get(userId);
    if (cached?.data) {
      return cached.data;
    }
  } catch (err) {
    console.warn('[readUserBundleCache Error]:', err);
  }
  return null;
}

function withServerTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function buildDefaultUserBundle(userId: string) {
  const now = new Date().toISOString();
  const defaultLedger = {
    id: `ledger_${userId}_daily`,
    userId,
    name: '日常私帳 (個人)',
    currency: 'TWD',
    isShared: false,
    creatorId: userId,
    memberIds: [userId],
    createdAt: now,
    deletedAt: null,
  };
  const defaultAssets = [
    {
      id: `asset_${userId}_cash`,
      userId,
      name: '現金錢包',
      type: 'cash',
      balance: 0,
      currency: 'TWD',
      order: 0,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: `asset_${userId}_bank`,
      userId,
      name: '銀行帳戶',
      type: 'bank',
      balance: 0,
      currency: 'TWD',
      order: 1,
      createdAt: now,
      deletedAt: null,
    },
  ];
  const defaultExpenseCats = [
    { name: '餐飲美食', icon: '🍽️', color: '#F97316' },
    { name: '交通運輸', icon: '🚇', color: '#3B82F6' },
    { name: '汽機車輛', icon: '🛵', color: '#0284C7' },
    { name: '居家生活', icon: '🏠', color: '#10B981' },
    { name: '水電瓦斯', icon: '💡', color: '#EAB308' },
    { name: '購物服飾', icon: '🛍️', color: '#EC4899' },
    { name: '休閒娛樂', icon: '🎮', color: '#8B5CF6' },
    { name: '運動健身', icon: '🏃', color: '#14B8A6' },
    { name: '醫療健康', icon: '💊', color: '#EF4444' },
    { name: '學習進修', icon: '📚', color: '#6366F1' },
    { name: '數位訂閱', icon: '📱', color: '#06B6D4' },
    { name: '社交禮金', icon: '🤝', color: '#F43F5E' },
    { name: '旅遊渡假', icon: '✈️', color: '#F59E0B' },
    { name: '毛孩寵物', icon: '🐾', color: '#D97706' },
    { name: '保險稅務', icon: '📑', color: '#64748B' },
    { name: '其他雜支', icon: '✨', color: '#94A3B8' },
  ].map((c, i) => ({
    id: `cat_exp_${userId}_${i}`,
    userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: 'expense',
    isDefault: true,
    createdAt: now,
    deletedAt: null,
  }));
  const defaultIncomeCats = [
    { name: '正職薪資', icon: '💰', color: '#10B981' },
    { name: '獎金津貼', icon: '🎁', color: '#F59E0B' },
    { name: '兼職副業', icon: '💼', color: '#3B82F6' },
    { name: '投資理財', icon: '📈', color: '#6366F1' },
    { name: '股息利息', icon: '🪙', color: '#8B5CF6' },
    { name: '租金收入', icon: '🏢', color: '#0D9488' },
    { name: '發票中獎', icon: '🎟️', color: '#EC4899' },
    { name: '親友餽贈', icon: '🧧', color: '#EF4444' },
    { name: '拍賣出清', icon: '📦', color: '#0284C7' },
    { name: '退稅回饋', icon: '💳', color: '#14B8A6' },
    { name: '其他收入', icon: '✨', color: '#64748B' },
  ].map((c, i) => ({
    id: `cat_inc_${userId}_${i}`,
    userId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: 'income',
    isDefault: true,
    createdAt: now,
    deletedAt: null,
  }));

  return {
    ledgers: [defaultLedger],
    transactions: [],
    assetAccounts: defaultAssets,
    categories: [...defaultExpenseCats, ...defaultIncomeCats],
    budgets: [],
    sinkingFunds: [],
    friends: [],
    sheepPosts: [],
    healthReports: [],
  };
}

// 🚀 全域高速資料快取專線 (Bundle API)：一鍵獲取該用戶全量帳本、交易、資產與分類，含配額防爆破磁碟快取雙軌兜底
router.get('/finance/bundle/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const lineUserId = (req.query.lineUserId as string)?.trim() || undefined;
  if (!userId) {
    res.status(400).json({ success: false, error: '缺少 userId 參數' });
    return;
  }

  let isQuotaExceeded = false;
  let bundleData: any = null;

  try {
    const { getUserLedgers } = await import('../services/ledgerService');
    const { getUserTransactions } = await import('../services/transactionService');
    const { getUserAssetAccounts } = await import('../services/walletService');
    const { getUserCategories } = await import('../services/categoryService');
    const { getUserBudgets, getUserSinkingFunds } = await import('../services/sinkingFundService');
    const { getUserFriends, getSheepPosts } = await import('../services/friendService');
    const { getUserHealthReports } = await import('../services/healthReportService');

    // 1. 純讀取檢索使用者名下合法所屬帳本 (設定 1500ms 嚴格保護)
    const ledgers = await withServerTimeout(
      getUserLedgers(userId, lineUserId).catch((err: any) => {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
          isQuotaExceeded = true;
        }
        return [];
      }),
      1500,
      []
    );

    // 🛡️ 關鍵防護：若 Firestore 額度超限或返回空帳本，立即跳過後續 8 個無效查詢，直達快取或種子資料
    if (!isQuotaExceeded && ledgers && ledgers.length > 0) {
      const ledgerIds = ledgers.map((l: any) => l.id);

      const [txs, assets, cats, bgs, funds, fds, posts, reports] = await withServerTimeout(
        Promise.all([
          getUserTransactions(userId, lineUserId, ledgerIds).catch(() => []),
          getUserAssetAccounts(userId, lineUserId).catch(() => []),
          getUserCategories(userId).catch(() => []),
          getUserBudgets(userId).catch(() => []),
          getUserSinkingFunds(userId, lineUserId).catch(() => []),
          getUserFriends(userId, lineUserId).catch(() => []),
          getSheepPosts().catch(() => []),
          getUserHealthReports(userId).catch(() => []),
        ]),
        2000,
        [[], [], [], [], [], [], [], []]
      );

      bundleData = {
        ledgers,
        transactions: txs || [],
        assetAccounts: assets || [],
        categories: cats || [],
        budgets: bgs || [],
        sinkingFunds: funds || [],
        friends: fds || [],
        sheepPosts: posts || [],
        healthReports: reports || [],
      };
      // 成功讀取時立即持久化到本機磁碟快取
      saveUserBundleCache(userId, bundleData);
      if (lineUserId) {
        saveUserBundleCache(lineUserId, bundleData);
      }
    }
  } catch (error: any) {
    if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota limit exceeded')) {
      isQuotaExceeded = true;
    }
    console.warn('[API /finance/bundle Query Warning]:', error?.message);
  }

  // 若 Firestore 查詢返回空值或觸發額度限制，無縫切換至磁碟快取或預設種子資料 (0ms 瞬間響應)
  if (!bundleData || !bundleData.ledgers || bundleData.ledgers.length === 0) {
    const cached = readUserBundleCache(userId) || (lineUserId ? readUserBundleCache(lineUserId) : null);
    if (cached && cached.ledgers && cached.ledgers.length > 0) {
      res.json({
        success: true,
        data: cached,
        fromCache: true,
        quotaExceeded: isQuotaExceeded,
      });
      return;
    }

    // 若磁碟亦無先前快取，生成結構完整之初始種子帳本，絕不向前端返回空值或崩潰
    const fallbackBundle = buildDefaultUserBundle(userId);
    saveUserBundleCache(userId, fallbackBundle);
    res.json({
      success: true,
      data: fallbackBundle,
      fromCache: true,
      isDefaultSeed: true,
      quotaExceeded: true,
    });
    return;
  }

  res.json({
    success: true,
    data: bundleData,
    fromCache: false,
    quotaExceeded: isQuotaExceeded,
  });
});

// Gemini AI 雙引擎語意解析與民國年 OCR (含 API 額度防護閥)
router.post('/gemini/parse', geminiAiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { text, userLedgers, userFriends, customApiKey } = req.body;
    if (!text) {
      res.status(400).json({ success: false, error: 'text required' });
      return;
    }
    const parsed = await parseTransactionWithGemini(
      text,
      userLedgers || [],
      userFriends || [],
      customApiKey
    );
    res.json({ success: true, parsed });
  } catch (error: any) {
    console.error('[API /gemini/parse Error]:', error);
    const msg = error?.message || '語意解析失敗';
    if (msg.includes('Gemini API 金鑰尚未配置')) {
      res.status(500).json({ success: false, error: 'Gemini API 金鑰尚未配置，請至管理員 Tab 5 設定' });
      return;
    }
    res.status(500).json({ success: false, error: msg });
  }
});

// AI 財務健檢代理端點 (純後端代理 + 系統金鑰動態提取 + 額度防護閥)
router.post('/gemini/health-check', geminiAiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { metrics, customApiKey } = req.body;
    if (!metrics) {
      res.status(400).json({ error: '缺少財務指標參數 (metrics required)' });
      return;
    }

    const analysis = await generateFinancialHealthCheckAnalysis(metrics, customApiKey);
    res.json({ success: true, analysis });
  } catch (error: any) {
    console.error('[API /gemini/health-check Error]:', error);
    const msg = error?.message || 'Gemini API 連線失敗';
    if (msg.includes('Gemini API 金鑰尚未配置')) {
      res.status(500).json({ error: 'Gemini API 金鑰尚未配置，請至管理員 Tab 5 設定' });
      return;
    }
    res.status(500).json({ error: `AI 財務健檢連線失敗: ${msg}` });
  }
});

// Gemini API Key 即時連線檢測端點 (供管理員後台一鍵測試連線狀態與金鑰正確性)
router.post('/system/test-gemini-key', authGuard('super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  const startTime = Date.now();
  try {
    const inputKey = (req.body?.apiKey as string)?.trim();
    const { getCandidateGeminiApiKeys } = await import('../services/geminiService');
    const { GoogleGenAI } = await import('@google/genai');

    const candidateKeys = await getCandidateGeminiApiKeys(inputKey);
    if (candidateKeys.length === 0) {
      res.status(400).json({
        success: false,
        error: '尚未輸入任何 Gemini API Key，且系統環境中亦無可用金鑰。',
      });
      return;
    }

    const testKey = candidateKeys[0];
    const ai = new GoogleGenAI({ apiKey: testKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping: 請回覆單詞 pong',
    });

    const latency = Date.now() - startTime;
    const keyPreview = testKey.length > 8 ? `${testKey.slice(0, 6)}...${testKey.slice(-4)}` : '***';
    const keySource = inputKey ? '本次輸入金鑰' : '系統已儲存金鑰/環境金鑰';

    res.json({
      success: true,
      message: `Gemini API 連線成功！模型響應正常（${response.text?.trim() || 'pong'}），延遲 ${latency}ms`,
      keySource,
      keyPreview,
      latency,
    });
  } catch (error: any) {
    console.error('[API /system/test-gemini-key Error]:', error);
    res.status(500).json({
      success: false,
      error: `Gemini API 連線測試失敗：${error?.message || '金鑰可能無效、已過期或被限制'}`,
    });
  }
});

// 解除並移除 LINE 底部功能選單 (Rich Menu)
router.post('/line/remove-rich-menu', authGuard('super_admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getGlobalSystemConfig();
    const token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    const result = await removeLineRichMenu(token);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// LINE 機器人全域廣播公告端點 (僅 super_admin 可執行，含防手抖與防濫用限流)
router.post('/admin/broadcast-line', authGuard('super_admin'), broadcastRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !content) {
      res.status(400).json({ success: false, error: '缺少標題或內容' });
      return;
    }

    const config = await getGlobalSystemConfig();
    const token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

    if (!token) {
      res.status(400).json({
        success: false,
        error: '尚未配置 LINE Channel Access Token，請先至管理員 Tab 5 填寫金鑰',
      });
      return;
    }

    const categoryTextMap: Record<string, string> = {
      feature: '🚀 新功能上線',
      system: '⚙️ 系統重要公告',
      maintenance: '🛠️ 系統維護通知',
      notice: '💡 溫馨提醒',
    };
    const catLabel = categoryTextMap[category] || '📢 全域公告';

    const appUrl = getAppBaseUrl();
    const liffId = getLiffId(config?.liffId);
    const directInAppUrl = getLiffUrl(liffId, appUrl);

    // 建立恆駐 Quick Reply 快捷狀態列 (軟體&功能、修改上一筆、我的帳號)
    const pinnedQuickReply = buildPinnedQuickReply({
      appUrl,
      liffId,
      openAppLabel: '📱 軟體&功能',
    });

    const textPayload = `【資產上羊・${catLabel}】\n\n📌 標題：${title}\n────────────────\n${content}\n────────────────\n👉 歡迎點擊下方狀態機按鈕快速操作或登入資產上羊！`;

    // 建立卡片文字下方自帶狀態機按鈕之 Flex Message 公告 (打開軟體、記帳、我的帳號、修改上一筆)
    const flexAnnouncement = buildAnnouncementFlexMessage({
      title,
      content,
      category,
      catLabel,
      directInAppUrl,
    });
    // 同時在訊息下方掛載 Quick Reply 狀態列按鈕
    (flexAnnouncement as any).quickReply = pinnedQuickReply;

    const textMessageWithQuickReply = {
      type: 'text',
      text: textPayload,
      quickReply: pinnedQuickReply,
    };

    // 呼叫 LINE 官方群發廣播端點 (優先發送內建狀態機按鈕之 Flex 公告卡片，若受限或失敗則降級為附帶 QuickReply 按鈕之文字訊息)
    let lineRes = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [flexAnnouncement],
      }),
    });

    if (!lineRes.ok) {
      const flexErr = await lineRes.text();
      console.warn('[LINE Broadcast Flex Error, falling back to text with QuickReply]:', lineRes.status, flexErr);

      lineRes = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [textMessageWithQuickReply],
        }),
      });
    }

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      console.warn('[LINE Broadcast Error]:', lineRes.status, errText);
      res.status(500).json({
        success: false,
        error: `LINE 廣播發送失敗 (${lineRes.status}): ${errText}`,
      });
      return;
    }

    res.json({ success: true, message: 'LINE 機器人公告已成功群發（已附帶軟體&功能、修改上一筆、我的帳號等狀態機按鈕）！' });
  } catch (error: any) {
    console.error('[API /admin/broadcast-line Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '群發失敗' });
  }
});

// 啟動真實 LINE 機器人對話新手導覽 (發送 Push 訊息與引導使用者進入真實對話)
router.post('/tour/start-line-tour', async (req: Request, res: Response) => {
  try {
    const { userId, lineUserId: requestedLineId } = req.body;
    const config = await getGlobalSystemConfig();
    const token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

    let targetLineUserId = requestedLineId || '';
    if (!targetLineUserId && userId) {
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase/config');
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        targetLineUserId = u.lineUserId || '';
      }
    }

    if (!targetLineUserId && isSuperAdminUser(userId)) {
      targetLineUserId = SUPER_ADMIN_LINE_USER_ID;
    }

    const botBasicId = '@381dzsqt';
    const lineChatDeepLink = `https://line.me/R/oaMessage/${botBasicId}/?${encodeURIComponent('吃到飽499')}`;
    const addBotUrl = `https://line.me/R/ti/p/${botBasicId}`;

    if (!targetLineUserId) {
      res.json({
        success: false,
        notLinked: true,
        message: '您的帳號尚未綁定 LINE User ID，請先加入 LINE 官方機器人或使用 LINE 登入。',
        addBotUrl,
        botBasicId,
      });
      return;
    }

    if (token) {
      const pushText = `🐑【資產上羊・新手導覽實戰啟動】\n\n哈囉！我是您的智慧記帳助理～\n現在帶您進入真實 LINE 對話記帳教學！\n\n👉【步驟 1/4】：\n請直接在下方打字傳送（或點擊下方快捷按鈕）：\n「吃到飽499」`;

      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: targetLineUserId,
          messages: [
            {
              type: 'text',
              text: pushText,
              quickReply: {
                items: [
                  {
                    type: 'action',
                    action: {
                      type: 'message',
                      label: '吃到飽499',
                      text: '吃到飽499',
                    },
                  },
                ],
              },
            },
          ],
        }),
      });

      const { setUserState } = await import('../services/lineStateManager');
      await setUserState(targetLineUserId, {
        state: 'IDLE',
        updatedAt: Date.now(),
      });
    }

    res.json({
      success: true,
      lineUserId: targetLineUserId,
      botBasicId,
      lineChatDeepLink,
      addBotUrl,
    });
  } catch (error: any) {
    console.error('[API /tour/start-line-tour Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '啟動 LINE 導覽失敗' });
  }
});

// 模擬真實 Webhook 狀態機流程 (供網頁端實測或離線環境測試新手導覽)
router.post('/tour/simulate-webhook-step', async (req: Request, res: Response) => {
  try {
    const { userId, userName = '使用者', lineUserId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: '缺少 userId' });
      return;
    }

    const { createTransaction } = await import('../services/transactionService');
    const { getUserAssetAccounts } = await import('../services/walletService');
    const { saveUserTourTopicCompleted } = await import('../services/tourService');
    const { getGlobalSystemConfig } = await import('../services/systemService');

    // 尋找信用卡帳戶或建立虛擬扣款
    const assets = await getUserAssetAccounts(userId);
    const ccAcc = assets.find((a) => a.type === 'credit_card' || a.name.includes('信用卡')) || assets[0];

    // 建立 599 交易紀錄
    await createTransaction(userId, {
      ledgerId: 'ledger_default_main',
      type: 'expense',
      amount: 599,
      currency: 'TWD',
      categoryId: `cat_exp_${userId}_餐飲美食`,
      categoryName: '餐飲美食',
      accountId: ccAcc?.id || 'acc_default',
      date: new Date().toISOString().split('T')[0],
      title: '吃到飽499 (新手導覽已更新599)',
      note: '來自 LINE 官方機器人新手導覽記帳 (吃到飽499 改用信用卡與 599 元)',
      payerMemberId: userId,
      payerId: userId,
      payerName: userName,
    });

    // 標記新手導覽完成
    await saveUserTourTopicCompleted(userId, 'line_bot');

    // 若有提供 lineUserId 且有 token，發送恭喜 Push 訊息
    const config = await getGlobalSystemConfig();
    const token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    if (token && lineUserId) {
      const congratMsg = `🎉【恭喜完成 LINE 官方機器人新手記帳導覽】！\n\n📌 項目：吃到飽499 (已更新為 599 元)\n💳 扣款：信用卡\n💰 金額：TWD 599 元\n📂 分類：餐飲美食\n\n已成功入帳至「資產上羊」系統！🐑✨\n\n📌【重要提醒・出門神技】：\n請在 LINE 聊天室列表長按將【資產上羊】設為「📌 釘選 (Pin to Top)」，出門在外隨手一句話秒記帳！`;
      const appUrl = getAppBaseUrl();
      const tourPinnedQuickReply = buildPinnedQuickReply({
        appUrl,
        lineUserId,
        liffId: config?.liffId,
        openAppLabel: '📱 軟體&功能',
      });
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: 'text', text: congratMsg, quickReply: tourPinnedQuickReply }],
        }),
      }).catch(() => {});
    }

    res.json({ success: true, message: '已成功執行 LINE Webhook 狀態機流程並正式入帳！' });
  } catch (error: any) {
    console.error('[API /tour/simulate-webhook-step Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '模擬失敗' });
  }
});



// ----------------------------------------------------
// ⏰ 每日記帳提醒鬧鐘 REST API 端點
// ----------------------------------------------------

// 立即發送測試提醒推播至使用者的 LINE 官方帳號 (必須放在 /reminders/:userId 之前避免被動態路由攔截)
router.post('/reminders/test-push', async (req: Request, res: Response) => {
  try {
    const { userId, lineUserId, userEmail } = req.body;
    if (!userId && !lineUserId && !userEmail) {
      res.status(400).json({ success: false, error: '缺少使用者識別參數 (userId, lineUserId 或 userEmail)' });
      return;
    }
    const { sendTestReminderPush } = await import('../services/reminderService');
    const result = await sendTestReminderPush(userId, lineUserId, userEmail);
    res.json(result);
  } catch (error: any) {
    console.error('[API POST /reminders/test-push Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '發送測試推播失敗' });
  }
});

// ⏰ 鬧鐘巡檢定時觸發器 (支援外部 Cron / Cloud Scheduler / 前端 Heartbeat，必須在 /reminders/:userId 之前)
const handleReminderCron = async (req: Request, res: Response) => {
  try {
    const { isFirestoreQuotaExceeded } = await import('../firebase/config');
    if (isFirestoreQuotaExceeded()) {
      res.json({
        success: true,
        service: 'AssetOnSheep Cron Scheduler',
        triggeredAt: new Date().toISOString(),
        quotaExceeded: true,
        sentCount: 0,
        purgedExpiredDraftsCount: 0,
      });
      return;
    }

    const { checkAndDispatchReminders } = await import('../services/reminderService');
    const { purgeAllExpiredDrafts } = await import('../services/draftManagerService');
    const [result, purgeResult] = await Promise.all([
      checkAndDispatchReminders().catch(() => ({ sentCount: 0 })),
      purgeAllExpiredDrafts().catch(() => ({ purgedCount: 0 })),
    ]);
    const nowIso = new Date().toISOString();
    res.json({
      success: true,
      service: 'AssetOnSheep Cron Scheduler',
      triggeredAt: nowIso,
      clientIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      purgedExpiredDraftsCount: purgeResult?.purgedCount || 0,
      ...result,
    });
  } catch (error: any) {
    res.json({ success: true, warning: '巡檢略過', sentCount: 0, purgedExpiredDraftsCount: 0 });
  }
};
router.get('/reminders/cron', handleReminderCron);
router.post('/reminders/cron', handleReminderCron);
router.get('/cron/reminders', handleReminderCron);
router.post('/cron/reminders', handleReminderCron);

// 取得特定帳號的記帳鬧鐘設定
router.get('/reminders/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { getUserReminder } = await import('../services/reminderService');
    const reminder = await getUserReminder(userId);
    res.json({ success: true, reminder });
  } catch (error: any) {
    console.error('[API GET /reminders/:userId Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '讀取鬧鐘設定失敗' });
  }
});

// 更新特定帳號的記帳鬧鐘設定
router.post('/reminders/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { saveUserReminder } = await import('../services/reminderService');
    const reminder = await saveUserReminder(userId, req.body);
    res.json({ success: true, reminder });
  } catch (error: any) {
    console.error('[API POST /reminders/:userId Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '儲存鬧鐘設定失敗' });
  }
});

// ----------------------------------------------------
// 📦 批量記帳審核與快速入帳 REST API 端點
// ----------------------------------------------------

// 讀取特定批次之暫存資料
router.get('/batch/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { getPendingBatch } = await import('../services/lineStateManager');
    const batch = await getPendingBatch(batchId);
    if (!batch) {
      res.status(404).json({ success: false, error: '查無此批次資料或該批次已入帳' });
      return;
    }
    res.json({ success: true, batch });
  } catch (error: any) {
    console.error('[API GET /batch/:batchId Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '讀取批次失敗' });
  }
});

// 讀取特定使用者目前的活躍批量記帳草稿
router.get('/batch/user/:userId/active', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { getUserActiveBatchDraft } = await import('../services/batchDraftService');
    const batch = await getUserActiveBatchDraft(userId);
    res.json({ success: true, batch });
  } catch (error: any) {
    console.error('[API GET /batch/user/:userId/active Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '讀取草稿失敗' });
  }
});

// 讀取特定使用者目前的活躍單筆或批量記帳草稿 (30分鐘內未過期)
router.get('/draft/user/:userId/active', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { checkAndCleanUserDraft, getUserActiveSingleDraft } = await import('../services/draftManagerService');
    const { getUserActiveBatchDraft } = await import('../services/batchDraftService');

    const draftCheck = await checkAndCleanUserDraft(userId, userId);
    let singleDraft = null;
    let batchDraft = null;

    if (draftCheck.hasActiveDraft) {
      if (draftCheck.draftType === 'single') {
        singleDraft = await getUserActiveSingleDraft(userId);
      } else {
        batchDraft = await getUserActiveBatchDraft(userId);
      }
    }

    res.json({ success: true, hasActiveDraft: draftCheck.hasActiveDraft, draftCheck, singleDraft, batchDraft });
  } catch (error: any) {
    console.error('[API GET /draft/user/:userId/active Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '讀取草稿失敗' });
  }
});

// 更新特定批次中的項目 (例如使用者在網頁/LIFF上修改了金額或分類，自動存為草稿)
router.post('/batch/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { items, isDraft } = req.body;
    const { getPendingBatch, savePendingBatch } = await import('../services/lineStateManager');
    const batch = await getPendingBatch(batchId);
    if (!batch) {
      res.status(404).json({ success: false, error: '查無此批次資料' });
      return;
    }

    if (Array.isArray(items)) {
      batch.items = items;
      const validItems = items.filter((i: any) => !i.isIgnored && i.amount > 0);
      batch.totalExpense = validItems
        .filter((i: any) => i.type === 'expense')
        .reduce((sum: number, i: any) => sum + i.amount, 0);
      batch.totalIncome = validItems
        .filter((i: any) => i.type === 'income')
        .reduce((sum: number, i: any) => sum + i.amount, 0);
      batch.validCount = validItems.length;
      batch.zeroCount = items.length - validItems.length;
      batch.isDraft = isDraft !== undefined ? Boolean(isDraft) : true;
      batch.updatedAt = new Date().toISOString();
      await savePendingBatch(batch);
    }

    res.json({ success: true, batch });
  } catch (error: any) {
    console.error('[API POST /batch/:batchId Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '更新批次失敗' });
  }
});

// 捨棄並徹底清除特定批量草稿
router.delete('/batch/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { removePendingBatch } = await import('../services/lineStateManager');
    const { discardBatchDraft } = await import('../services/batchDraftService');
    await removePendingBatch(batchId);
    await discardBatchDraft(batchId);
    res.json({ success: true, message: '已成功移除批量草稿' });
  } catch (error: any) {
    console.error('[API DELETE /batch/:batchId Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '刪除草稿失敗' });
  }
});

// 確認並全數寫入交易紀錄
router.post('/batch/:batchId/commit', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { userId } = req.body;
    const { commitBatchTransactions } = await import('../services/batchTransactionService');
    const result = await commitBatchTransactions(batchId, userId || 'anonymous');
    res.json(result);
  } catch (error: any) {
    console.error('[API POST /batch/:batchId/commit Error]:', error);
    res.status(500).json({ success: false, error: error?.message || '批量入帳失敗' });
  }
});

// LINE Webhook 官方端點 (HMAC-SHA256 驗證，雙路徑別名支援)
const handleLineWebhook = async (req: Request, res: Response) => {
  try {
    const signature =
      (req.headers['x-line-signature'] as string) ||
      (req.headers['X-Line-Signature'] as string) ||
      '';
    const rawBody =
      (req as any).rawBody ||
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const baseUrl = host ? `${proto}://${host}` : undefined;

    // 收到 LINE 訊息時，非同步觸發巡檢一次全帳號是否有待發送的定時鬧鐘
    setTimeout(async () => {
      try {
        const { checkAndDispatchReminders } = await import('../services/reminderService');
        await checkAndDispatchReminders();
      } catch {}
    }, 200);

    const result = await processLineWebhookPayload(rawBody, signature, baseUrl);
    res.status(result.status).send(result.message);
  } catch (error: any) {
    console.error('[handleLineWebhook Error]:', error);
    res.status(500).send('Webhook processing error');
  }
};

router.post('/line/webhook', handleLineWebhook);
router.post('/webhook/line', handleLineWebhook);

export default router;
