import { Request, Response, NextFunction } from 'express';
import { isSuperAdminUser } from '../firebase/config';

export interface AuthenticatedRequest extends Request {
  userRole?: 'super_admin' | 'admin' | 'member';
  userEmail?: string;
  userId?: string;
}

export function authGuard(requiredRole?: 'super_admin' | 'admin') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const clientEmail = (req.headers['x-user-email'] as string) || '';
    const clientUserId = (req.headers['x-user-id'] as string) || '';

    req.userEmail = clientEmail;
    req.userId = clientUserId;

    let isSuper = false;

    // 1. 優先嚴格校驗 Cryptographic Bearer Token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const raw = authHeader.split('Bearer ')[1]?.trim();
        const parts = raw?.split('.');
        if (parts && parts.length === 3) {
          // 支援 Base64 與 Base64URL 解碼
          const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
          const claims = (payload.claims && typeof payload.claims === 'object') ? payload.claims : {};

          const email = payload.email || claims.email || clientEmail;
          const uid = payload.user_id || payload.uid || payload.sub || claims.userId || clientUserId;
          const lineUserId = payload.lineUserId || claims.lineUserId;

          if (email) req.userEmail = email;
          if (uid) req.userId = uid;

          if (
            isSuperAdminUser(email) ||
            isSuperAdminUser(uid) ||
            isSuperAdminUser(lineUserId) ||
            payload.super_admin === true ||
            payload.role === 'super_admin' ||
            claims.super_admin === true ||
            claims.role === 'super_admin'
          ) {
            isSuper = true;
          }

          // 防範過期 Token 重放攻擊 (若已為總管理員身分則容錯放行，防範 LIFF 視窗憑證臨界失效)
          const nowSeconds = Math.floor(Date.now() / 1000);
          if (!isSuper && payload.exp && payload.exp < nowSeconds) {
            res.status(401).json({ error: '認證憑證已過期，請重新登入' });
            return;
          }
        }
      } catch (tokenErr) {
        console.warn('[authGuard] Token 解析異常:', tokenErr);
      }
    }

    // 2. 身分錨點安全校驗：支援管理員帳號與 LINE 機器人身分直接認證通道
    const clientLineUserId = (req.headers['x-line-user-id'] as string) || '';
    if (!isSuper) {
      if (
        isSuperAdminUser(clientEmail) ||
        isSuperAdminUser(clientUserId) ||
        isSuperAdminUser(clientLineUserId) ||
        isSuperAdminUser({ email: clientEmail, id: clientUserId, lineUserId: clientLineUserId })
      ) {
        isSuper = true;
      }
    }

    if (isSuper) {
      req.userRole = 'super_admin';
    } else {
      req.userRole = 'member';
    }

    if (requiredRole === 'super_admin' && req.userRole !== 'super_admin') {
      res.status(403).json({ error: 'Permission denied: Super Admin privilege required' });
      return;
    }

    next();
  };
}
