/**
 * [全站真理] 單一資料模型定義與 Enum (含 SystemConfig)
 * 資產上羊 (AssetOnSheep)
 */

export type UserRole = 'super_admin' | 'admin' | 'member';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  role: UserRole;
  lineUserId?: string;
  googleUid?: string;
  friendIds?: string[];
  aliasUserIds?: string[];
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type LedgerCurrency = 'TWD' | 'JPY' | 'USD' | 'EUR' | 'CNY' | 'KRW' | 'GBP';

export interface Ledger {
  id: string;
  userId: string; // Owner / Creator
  name: string;
  currency: LedgerCurrency;
  isShared: boolean;
  creatorId: string;
  memberIds: string[]; // User IDs or dummy friend IDs
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface SplitDetail {
  memberId: string;
  memberName: string;
  amount: number;
  isSettled?: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  ledgerId: string;
  type: TransactionType;
  amount: number;
  currency: LedgerCurrency;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  accountId: string; // Source asset account
  targetAccountId?: string; // For transfers
  subAccountId?: string; // Optional sub-account
  date: string; // YYYY-MM-DD
  title: string;
  note?: string;
  payerId: string;
  payerName: string;
  payerMemberId?: string;
  participantIds?: string[];
  splitMemberIds?: string[];
  splitDetails?: SplitDetail[];
  transferPairId?: string; // ID linking deduction and addition
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type AssetType = 'cash' | 'bank' | 'credit_card' | 'e_wallet';

export interface SubAccount {
  id: string;
  name: string;
  balance: number;
  note?: string;
}

export interface AssetAccount {
  id: string;
  userId: string;
  name: string;
  type: AssetType;
  balance: number;
  currency: LedgerCurrency;
  subAccounts?: SubAccount[];
  order?: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  icon: string;
  type: 'expense' | 'income';
  color?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface Budget {
  id: string;
  userId: string;
  categoryId?: string; // optional: whole month or category specific
  month: string; // YYYY-MM
  amount: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type SinkingCycle = 'monthly' | 'quarterly' | 'semi_annually' | 'yearly';
export type SinkingType = 'expense' | 'income';

export interface SinkingFund {
  id: string;
  userId: string;
  title: string;
  targetAmount: number;
  accumulatedAmount: number;
  nextDueDate: string; // YYYY-MM
  cycle: SinkingCycle;
  type?: 'expense' | 'income'; // 固定支出或固定收入
  targetAccountId?: string;
  categoryId?: string;
  targetLedgerId?: string; // 預設執行入帳/扣款之專屬帳本 (預設為日常私帳)
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface Friend {
  id: string;
  userId: string; // Current user
  friendUserId?: string; // If registered member
  name: string;
  avatarUrl?: string;
  isDummy: boolean; // Dummy friend (e.g. 小美, 阿倫, 媽媽)
  ownerId: string; // Strictly bound to current user
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface SheepPost {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  likesCount: number;
  likedUserIds: string[];
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface HealthReport {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  score: number;
  engelCoefficient: number;
  fixedExpenseRatio: number;
  savingsHealthEvaluation: string;
  summary: string;
  recommendations: string[];
  month: string; // YYYY-MM
  createdAt: string;
}

export interface SystemConfig {
  id: string;
  lineChannelId?: string;
  lineChannelSecret: string;
  lineChannelAccessToken: string;
  liffId: string;
  geminiApiKey: string;
  updatedAt: string;
}

export interface RescueCode {
  id: string;
  code: string;
  targetUserId: string;
  createdBy: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export type ActiveTab =
  | 'overview'
  | 'transactions'
  | 'wallet'
  | 'collaboration'
  | 'analytics'
  | 'admin';

export interface SettlementDebt {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}

export type AnnouncementCategory = 'feature' | 'system' | 'maintenance' | 'notice';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  authorId?: string;
  authorName?: string;
  broadcastLine: boolean; // 1. 在 line 機器人裡群發公告
  popupInApp: boolean;    // 2. 在視窗裡彈出公告
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
  lineBroadcastStatus?: {
    sentAt: string;
    success: boolean;
    error?: string;
  };
}

export interface UserAnnouncementRead {
  userId: string;
  announcementId: string;
  readAt: string;
}

export type TourTopicId =
  | 'assets'
  | 'transaction'
  | 'overview_health'
  | 'split'
  | 'line_bot';

export interface TourStep {
  id: string;
  topicId: TourTopicId;
  stepNumber: number;
  totalSteps: number;
  title: string;
  description: string;
  targetSelector?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  actionPrompt?: string;
  requiredTab?: ActiveTab;
  autoActionText?: string;
  interactiveModal?: 'transaction' | 'ledger' | 'asset' | 'budget' | 'sinking' | 'health' | 'line_real';
}

export interface UserTourProgress {
  userId: string;
  completedTopics: TourTopicId[];
  isFullyCompleted: boolean;
  lastActiveTopic?: TourTopicId;
  updatedAt: string;
}

export type ReminderFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface AccountingReminder {
  id: string; // reminder_${userId}
  userId: string;
  lineUserId?: string; // LINE User ID (用於直接推播，防止跨帳號找不到綁定對象)
  userEmail?: string;
  userName?: string;
  enabled: boolean;
  time: string; // e.g. "21:00" (HH:mm 24-hr format)
  frequency: ReminderFrequency; // 'daily' | 'weekdays' | 'weekends' | 'custom'
  customDays?: number[]; // [0, 1, 2, 3, 4, 5, 6] where 0=Sun, 1=Mon, ..., 6=Sat
  message?: string; // 自訂提醒小語
  lastNotifiedDate?: string | null; // YYYY-MM-DD
  lastNotifiedTime?: string | null; // e.g. "21:30", 記錄當次發送推播時所對應之鬧鐘時間
  lastNotifiedAt?: string | null; // ISO String 記錄實際發送推播的時間戳記
  updatedAt: string;
}

export interface BatchTransactionItem {
  id: string; // e.g. "item_1"
  date: string; // "YYYY-MM-DD"
  title: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  categoryId?: string;
  accountName?: string;
  accountId?: string;
  subAccountId?: string;
  ledgerId?: string;
  ledgerName?: string;
  note?: string;
  isIgnored?: boolean; // 若為 0 元或使用者手動排除
}

export interface PendingBatch {
  id: string; // "pbatch_..."
  userId: string;
  lineUserId?: string;
  userName?: string;
  items: BatchTransactionItem[];
  totalExpense: number;
  totalIncome: number;
  validCount: number;
  zeroCount: number;
  dateRange: string;
  createdAt: string;
  updatedAt?: string;
  isDraft?: boolean;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
}


