import crypto from 'crypto';

/**
 * LINE 官方 Messaging API 核心通訊與訊息發送模組
 * 負責簽章校驗、Flex/文字/推播/打字中動畫與多媒體下載
 */

/**
 * 1. 強制簽章校驗 (HMAC-SHA256)
 */
export function verifyLineSignature(body: string, signature: string, channelSecret: string): boolean {
  if (!channelSecret || !signature) return false;
  try {
    const hash = crypto.createHmac('sha256', channelSecret.trim()).update(body, 'utf8').digest('base64');
    const hashBuf = Buffer.from(hash, 'utf-8');
    const sigBuf = Buffer.from(signature.trim(), 'utf-8');
    if (hashBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, sigBuf);
  } catch {
    return false;
  }
}


/**
 * 發送 LINE Reply Flex Message (支援自動降級為文字回覆與恆駐 QuickReply 快捷狀態列)
 */
export async function sendLineFlexMessage(
  replyToken: string,
  flexMessage: any,
  accessToken: string,
  fallbackText?: string,
  quickReply?: any,
  targetChatId?: string
): Promise<boolean> {
  const token = (accessToken || '').trim();
  if (!token) {
    console.warn('[LINE Flex Reply Skipped] 缺少 accessToken');
    return false;
  }

  // 確保為合規之 LINE Flex Message 頂層結構 (必須包含 type: 'flex', altText 與 contents)
  let msgPayload: any;
  if (flexMessage?.type === 'flex') {
    msgPayload = { ...flexMessage };
  } else {
    msgPayload = {
      type: 'flex',
      altText: fallbackText || '⏰ 每日記帳提醒鬧鐘設定',
      contents: flexMessage,
    };
  }

  if (quickReply) {
    msgPayload.quickReply = quickReply;
  }

  // 若有 replyToken，優先以 Reply API 回覆
  if (replyToken) {
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [msgPayload],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error('[LINE Flex API Failed]:', res.status, errBody);
        if (fallbackText && targetChatId) {
          console.log('[LINE Flex Reply Failed -> Pushing fallback text]');
          await sendLinePushMessage(targetChatId, fallbackText, token, quickReply);
        }
        return false;
      }

      return true;
    } catch (err: any) {
      console.error('[LINE Flex Reply Error]:', err?.message);
      if (fallbackText && targetChatId) {
        await sendLinePushMessage(targetChatId, fallbackText, token, quickReply);
      }
      return false;
    }
  } else if (targetChatId) {
    // 若無 replyToken 但有 targetChatId，直接以 Push API 送出 Flex 訊息
    return await sendLinePushMessage(targetChatId, msgPayload, token);
  }

  return false;
}

/**
 * 發送雙重組合訊息：包含視覺 Flex 卡片與清晰好讀的文字引導，同時附帶專屬 Quick Reply 快捷按鈕
 */
export async function sendLineDualMessage(
  replyToken: string,
  flexMessage: any,
  textMessage: string,
  accessToken: string,
  quickReply?: any,
  altText: string = '⏰ 每日記帳提醒鬧鐘設定'
): Promise<boolean> {
  const token = (accessToken || '').trim();
  if (!token || !replyToken) return false;

  let flexPayload: any;
  if (flexMessage?.type === 'flex') {
    flexPayload = { ...flexMessage };
  } else {
    flexPayload = {
      type: 'flex',
      altText,
      contents: flexMessage,
    };
  }

  const textPayload: any = {
    type: 'text',
    text: textMessage,
  };
  if (quickReply) {
    textPayload.quickReply = quickReply;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [flexPayload, textPayload],
      }),
    });

    if (!res.ok) {
      console.warn('[LINE Dual Message Warning, falling back to text only]:', res.status);
      return await sendLineReplyMessage(replyToken, textMessage, token, quickReply);
    }
    return true;
  } catch (err: any) {
    console.warn('[LINE Dual Message Error]:', err?.message);
    return await sendLineReplyMessage(replyToken, textMessage, token, quickReply);
  }
}

/**
 * 發送 LINE 普通文字訊息 (支援附帶恆駐 QuickReply 快捷狀態列)
 */
export async function sendLineReplyMessage(
  replyToken: string,
  replyText: string,
  accessToken: string,
  quickReply?: any
): Promise<boolean> {
  const token = (accessToken || '').trim();
  if (!token || !replyToken) return false;

  const msgPayload: any = { type: 'text', text: replyText };
  if (quickReply) {
    msgPayload.quickReply = quickReply;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [msgPayload],
      }),
    });

    return res.ok;
  } catch (err: any) {
    console.error('[LINE Reply API Error]:', err?.message);
    return false;
  }
}

/**
 * 發送 LINE 官方載入中動畫 (LINE Chat Loading API: /v2/bot/chat/loading/start)
 * 在一對一聊天室中顯示原生的打字中動畫，提示使用者系統正在處理，不消耗 Push 訊息配額
 */
export async function sendLineLoadingAnimation(
  chatId: string,
  accessToken: string,
  loadingSeconds: number = 20
): Promise<boolean> {
  const token = (accessToken || '').trim();
  if (!token || !chatId) return false;

  try {
    const res = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatId,
        loadingSeconds: Math.min(60, Math.max(5, loadingSeconds)),
      }),
    });

    return res.ok;
  } catch (err: any) {
    console.warn('[LINE Loading Animation Warn]:', err?.message);
    return false;
  }
}

/**
 * 發送 LINE 主動推送訊息 (Push Message API: /v2/bot/message/push)
 * 在語意解析進行中主動通知使用者，避免使用者懷疑當機或重複輸入
 */
export async function sendLinePushMessage(
  to: string,
  pushTextOrMessage: string | any,
  accessToken: string,
  quickReply?: any
): Promise<boolean> {
  const token = (accessToken || '').trim();
  if (!token || !to) return false;

  let msgPayload: any;
  if (typeof pushTextOrMessage === 'string') {
    msgPayload = { type: 'text', text: pushTextOrMessage };
  } else if (pushTextOrMessage?.type === 'flex') {
    msgPayload = { ...pushTextOrMessage };
  } else if (pushTextOrMessage?.type === 'bubble') {
    msgPayload = {
      type: 'flex',
      altText: '⏰ 每日記帳提醒',
      contents: pushTextOrMessage,
    };
  } else {
    msgPayload = pushTextOrMessage;
  }

  if (quickReply) {
    msgPayload.quickReply = quickReply;
  }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to,
        messages: [msgPayload],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[LINE Push API Failed]:', res.status, errText);
      return false;
    }

    return true;
  } catch (err: any) {
    console.warn('[LINE Push API Error]:', err?.message);
    return false;
  }
}

/**
 * 從 LINE Messaging API 下載使用者傳送之多媒體二進位檔案 (例如圖片)
 */
export async function fetchLineMessageContent(
  messageId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = (accessToken || '').trim();
  if (!token || !messageId) return null;

  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[LINE Content API Error] status=${res.status}:`, errText);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = res.headers.get('content-type') || 'image/jpeg';

    return { buffer, mimeType };
  } catch (error: any) {
    console.error('[LINE Content API Fetch Failed]:', error?.message);
    return null;
  }
}
