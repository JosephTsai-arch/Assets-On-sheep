import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const getEnvVar = (key: string, fallback: string): string => {
  if (typeof process !== 'undefined' && process.env) {
    return (process.env[key] || process.env[`VITE_${key}`] || '').trim() || fallback;
  }
  return fallback;
};

export const SUPER_ADMIN_EMAIL = getEnvVar('SUPER_ADMIN_EMAIL', '');
export const SUPER_ADMIN_LINE_USER_ID = getEnvVar('SUPER_ADMIN_LINE_USER_ID', '');
export const SUPER_ADMIN_LINE_UID = getEnvVar('SUPER_ADMIN_LINE_UID', '');
export const SUPER_ADMIN_GOOGLE_UID = getEnvVar('SUPER_ADMIN_GOOGLE_UID', '');

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// 靜默內部 gRPC 閒置串流正常回收之日誌 (Code: 1 CANCELLED: Disconnecting idle stream)
try {
  setLogLevel('silent');
} catch {
  // Ignored if not supported
}

// 雲端配額狀態探測器 (Quota Circuit Breaker)
let quotaExceededUntil = 0;

export function markQuotaExceeded(durationMs: number = 15 * 60 * 1000): void {
  quotaExceededUntil = Date.now() + durationMs;
}

export function isFirestoreQuotaExceeded(): boolean {
  return Date.now() < quotaExceededUntil;
}

// 攔截過濾客戶端閒置串流斷線與配額超限訊息，防止將正常回收機制或配額降級誤判為致命錯誤
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const firstArg = args[0];
    if (
      typeof firstArg === 'string' &&
      (firstArg.includes('Disconnecting idle stream') ||
        firstArg.includes('Timed out waiting for new targets') ||
        firstArg.includes('RpcError: 1 CANCELLED') ||
        firstArg.includes('Quota limit exceeded') ||
        firstArg.includes('resource-exhausted'))
    ) {
      markQuotaExceeded();
      return;
    }
    originalError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message || '';
    if (
      msg.includes('Disconnecting idle stream') ||
      msg.includes('Timed out waiting for new targets') ||
      msg.includes('Quota limit exceeded') ||
      msg.includes('resource-exhausted')
    ) {
      markQuotaExceeded();
      event.preventDefault();
    }
  });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * 遞迴清理資料，移除所有 undefined 屬性，防止 Firestore 崩潰報錯
 */
export function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = cleanForFirestore(value);
      }
    }
    return result as T;
  }
  return obj;
}

export function isSuperAdminUser(
  target?:
    | string
    | {
        email?: string | null;
        id?: string | null;
        uid?: string | null;
        name?: string | null;
        displayName?: string | null;
        lineUserId?: string | null;
        role?: string | null;
      }
    | null
): boolean {
  if (!target) return false;

  // 1. 若為物件：資料庫角色與 Token 宣告具備最高優先權 (Database Role Driven)
  if (typeof target === 'object') {
    if (
      target.role === 'super_admin' ||
      (target as any).claims?.super_admin === true ||
      (target as any).super_admin === true
    ) {
      return true;
    }
    if (target.email && isSuperAdminUser(target.email)) return true;
    if (target.id && isSuperAdminUser(target.id)) return true;
    if (target.uid && isSuperAdminUser(target.uid)) return true;
    if (target.lineUserId && isSuperAdminUser(target.lineUserId)) return true;
    return false;
  }

  // 2. 若為純字串：次之比對伺服器環境變數兜底 (Environment Variable Fallback)
  if (typeof target === 'string') {
    const s = target.trim().toLowerCase();
    if (SUPER_ADMIN_EMAIL && s === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
    if (SUPER_ADMIN_LINE_USER_ID) {
      if (s === SUPER_ADMIN_LINE_USER_ID.toLowerCase()) return true;
      if (s === `${SUPER_ADMIN_LINE_USER_ID.toLowerCase()}@line.me`) return true;
      if (target.trim() === SUPER_ADMIN_LINE_USER_ID) return true;
      if (target.trim() === `line_${SUPER_ADMIN_LINE_USER_ID}`) return true;
    }
    if (SUPER_ADMIN_LINE_UID && target.trim() === SUPER_ADMIN_LINE_UID) return true;
    if (SUPER_ADMIN_GOOGLE_UID && target.trim() === SUPER_ADMIN_GOOGLE_UID) return true;
    return false;
  }

  return false;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
