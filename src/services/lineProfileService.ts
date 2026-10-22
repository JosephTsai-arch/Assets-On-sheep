import { getGlobalSystemConfig } from './systemService';

export interface LineUserProfile {
  userId: string;
  displayName: string;
  pictureUrl: string;
  statusMessage?: string;
}

/**
 * 透過 LINE Messaging API (Bot API) 依 lineUserId 取得官方用戶暱稱與大頭貼
 * 支援一對一聊天、群組成員 (groupId) 與多人群聊 (roomId)
 */
export async function fetchLineUserProfile(
  lineUserId: string,
  customAccessToken?: string,
  groupId?: string,
  roomId?: string
): Promise<LineUserProfile | null> {
  const cleanId = (lineUserId || '').replace(/^line_/, '').trim();
  if (!cleanId) return null;

  let token = (customAccessToken || '').trim();
  if (!token) {
    try {
      const config = await getGlobalSystemConfig();
      token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    } catch (e: any) {
      console.warn('[LineProfileService] 讀取配置失敗:', e?.message);
    }
  }

  if (!token) {
    console.warn('[LineProfileService] 尚未配置 LINE Channel Access Token，無法呼叫 Profile API');
    return null;
  }

  // 1. 依據來源建立合適的端點 (Group / Room / 1-on-1)
  let endpoint = `https://api.line.me/v2/bot/profile/${cleanId}`;
  if (groupId) {
    endpoint = `https://api.line.me/v2/bot/group/${groupId}/member/${cleanId}`;
  } else if (roomId) {
    endpoint = `https://api.line.me/v2/bot/room/${roomId}/member/${cleanId}`;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        userId: data.userId || cleanId,
        displayName: data.displayName || 'LINE 用戶',
        pictureUrl:
          data.pictureUrl ||
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        statusMessage: data.statusMessage,
      };
    } else {
      const errText = await res.text();
      console.warn(`[LineProfileService] 呼叫 LINE Profile API 失敗 (HTTP ${res.status}):`, errText);

      // 若群組成員失敗，降級嘗試全域一對一端點
      if (groupId || roomId) {
        const fallbackRes = await fetch(`https://api.line.me/v2/bot/profile/${cleanId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          return {
            userId: fallbackData.userId || cleanId,
            displayName: fallbackData.displayName || 'LINE 用戶',
            pictureUrl:
              fallbackData.pictureUrl ||
              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            statusMessage: fallbackData.statusMessage,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn('[LineProfileService Error]:', err?.message);
  }

  return null;
}

/**
 * 透過 LINE Login OAuth Code 換取 Access Token
 */
export async function exchangeLineAuthCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken?: string } | null> {
  try {
    const config = await getGlobalSystemConfig();
    const channelId =
      config?.lineChannelId ||
      process.env.LINE_CHANNEL_ID ||
      process.env.VITE_LINE_CHANNEL_ID ||
      '';
    const channelSecret =
      config?.lineChannelSecret ||
      process.env.LINE_CHANNEL_SECRET ||
      process.env.VITE_LINE_CHANNEL_SECRET ||
      '';

    if (!channelId || !channelSecret) {
      console.warn('[exchangeLineAuthCode] 缺少 LINE Channel ID 或 Secret');
      return null;
    }

    const res = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        accessToken: data.access_token,
        idToken: data.id_token,
      };
    } else {
      const err = await res.text();
      console.error('[exchangeLineAuthCode Error]:', res.status, err);
    }
  } catch (e: any) {
    console.error('[exchangeLineAuthCode Exception]:', e?.message);
  }

  return null;
}

/**
 * 透過 LINE User Access Token 取得個人 Profile (LINE Login 模式)
 */
export async function fetchLineProfileWithUserToken(
  accessToken: string
): Promise<LineUserProfile | null> {
  try {
    const res = await fetch('https://api.line.me/v2/profile', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        userId: data.userId,
        displayName: data.displayName || 'LINE 用戶',
        pictureUrl:
          data.pictureUrl ||
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        statusMessage: data.statusMessage,
      };
    }
  } catch (err: any) {
    console.warn('[fetchLineProfileWithUserToken Error]:', err?.message);
  }

  return null;
}
