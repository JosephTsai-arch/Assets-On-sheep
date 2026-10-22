import { User } from '../types';

export interface LiffInvitePayload {
  line_user_id?: string;
  lineUserId?: string;
  displayName?: string;
  name?: string;
  pictureUrl?: string;
  avatarUrl?: string;
  inviteCode: string;
}

export interface LiffInviteResult {
  success: boolean;
  customToken: string | null;
  user: User;
  inviter?: { id: string; name: string };
  error?: string;
}

/**
 * 解析邀請碼 (支援 JSON 物件編碼與歷史冒號分隔編碼)
 */
export function parseInviteCode(inviteCode: string): { inviterId: string; inviterName: string; ledgerId?: string; ledgerName?: string } | null {
  if (!inviteCode) return null;
  try {
    let cleanCode = inviteCode.trim();
    if (cleanCode.includes('%')) {
      try { cleanCode = decodeURIComponent(cleanCode); } catch { /* ignore */ }
    }
    const raw = decodeURIComponent(escape(atob(cleanCode)));
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw);
      if (data.inviterId) {
        return {
          inviterId: String(data.inviterId).trim(),
          inviterName: String(data.inviterName || '好友').trim(),
          ledgerId: data.ledgerId ? String(data.ledgerId).trim() : undefined,
          ledgerName: data.ledgerName ? String(data.ledgerName).trim() : undefined,
        };
      }
    }
    const parts = raw.split(':::');
    if (parts[0]) {
      return {
        inviterId: parts[0].trim(),
        inviterName: decodeURIComponent(parts[1] || '好友').trim(),
      };
    }
  } catch (err: any) {
    console.warn('[parseInviteCode Error]:', err?.message);
  }
  return null;
}

/**
 * 格式鐵律：生成 LIFF 專屬 URL
 * https://liff.line.me/{lineLiffId}?inviteCode={生成的唯一邀請碼}
 */
export function generateLiffInviteUrl(
  lineLiffId: string,
  inviterId: string,
  inviterName: string,
  ledgerId?: string,
  ledgerName?: string
): string {
  const payload: any = {
    inviterId,
    inviterName,
    ts: Date.now(),
    nonce: Math.random().toString(36).substring(2, 8),
  };
  if (ledgerId) payload.ledgerId = ledgerId;
  if (ledgerName) payload.ledgerName = ledgerName;

  const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `https://liff.line.me/${lineLiffId.trim()}?inviteCode=${encodeURIComponent(code)}`;
}
