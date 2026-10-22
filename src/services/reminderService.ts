import { doc, getDoc, setDoc, collection, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { db, cleanForFirestore, isSuperAdminUser, SUPER_ADMIN_LINE_USER_ID, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { getAppBaseUrl } from '../utils/urlUtils';
import { AccountingReminder, ReminderFrequency, User } from '../types';
import { getGlobalSystemConfig } from './systemService';

export const DEFAULT_REMINDER_MESSAGE = '今天記帳了嗎？🐑 睡前順手記一下今天花了多少錢吧！';

/**
 * 預設提醒鬧鐘設定
 */
export function getDefaultReminder(userId: string): AccountingReminder {
  return {
    id: `reminder_${userId}`,
    userId,
    enabled: true,
    time: '21:00',
    frequency: 'daily',
    customDays: [1, 2, 3, 4, 5],
    message: DEFAULT_REMINDER_MESSAGE,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 讀取特定帳號的獨立記帳提醒鬧鐘設定
 */
export async function getUserReminder(userId: string): Promise<AccountingReminder> {
  if (!userId) return getDefaultReminder('anonymous');

  const localKey = `aos_reminder_${userId}`;
  let cached: AccountingReminder | null = null;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) cached = JSON.parse(raw);
  } catch {}

  try {
    const docRef = doc(db, 'reminders', `reminder_${userId}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AccountingReminder;
      const reminder: AccountingReminder = {
        ...getDefaultReminder(userId),
        ...data,
        id: snap.id,
        userId,
      };
      try {
        localStorage.setItem(localKey, JSON.stringify(reminder));
      } catch {}
      return reminder;
    }
  } catch (error: any) {
    console.warn('[getUserReminder Firestore Error]:', error?.message);
  }

  if (cached) return cached;
  const def = getDefaultReminder(userId);
  try {
    localStorage.setItem(localKey, JSON.stringify(def));
  } catch {}
  return def;
}

/**
 * 儲存或更新特定帳號的記帳提醒鬧鐘設定
 */
export async function saveUserReminder(
  userId: string,
  data: Partial<AccountingReminder>
): Promise<AccountingReminder> {
  const current = await getUserReminder(userId);
  const updated: AccountingReminder = {
    ...current,
    ...data,
    userId,
    id: `reminder_${userId}`,
    updatedAt: new Date().toISOString(),
  };

  // 關鍵防呆與修復：若使用者修改了提醒時間 (time) 或重新開啟，清除今日發送標記，讓新時間在當天可以立刻生效！
  if (data.time && data.time !== current.time) {
    updated.lastNotifiedDate = null;
    updated.lastNotifiedTime = null;
    updated.lastNotifiedAt = null;
  } else if (data.enabled === true && current.enabled === false) {
    updated.lastNotifiedDate = null;
    updated.lastNotifiedTime = null;
    updated.lastNotifiedAt = null;
  }

  // 自動補充 LINE User ID 與管理者身分關聯，確保後續推播 100% 能找到對象
  if (!updated.lineUserId) {
    if (userId.startsWith('line_')) {
      updated.lineUserId = userId.replace(/^line_/, '').trim();
    } else if (isSuperAdminUser(userId)) {
      updated.lineUserId = SUPER_ADMIN_LINE_USER_ID;
    }
  }

  const localKey = `aos_reminder_${userId}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(updated));
  } catch {}

  try {
    const docRef = doc(db, 'reminders', `reminder_${userId}`);
    await setDoc(docRef, cleanForFirestore(updated), { merge: true });
  } catch (error: any) {
    console.warn('[saveUserReminder Firestore Error]:', error?.message);
  }

  return updated;
}

/**
 * 切換特定帳號的提醒鬧鐘開關 (啟用/暫停)
 */
export async function toggleUserReminder(
  userId: string,
  enabled?: boolean
): Promise<AccountingReminder> {
  const current = await getUserReminder(userId);
  const nextEnabled = typeof enabled === 'boolean' ? enabled : !current.enabled;
  return await saveUserReminder(userId, { enabled: nextEnabled });
}

/**
 * 格式化頻率文字顯示
 */
export function formatFrequencyText(reminder: AccountingReminder): string {
  switch (reminder.frequency) {
    case 'daily':
      return '每天 (Daily)';
    case 'weekdays':
      return '平日工作日 (週一至週五)';
    case 'weekends':
      return '週末假期 (週六至週日)';
    case 'custom': {
      const days = reminder.customDays || [];
      if (days.length === 0) return '未設定自訂星期';
      if (days.length === 7) return '每天 (週一至週日)';
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
      return '每週 ' + days.map((d) => `週${dayNames[d]}`).join('、');
    }
    default:
      return '每天';
  }
}

/**
 * 檢查鬧鐘在此刻是否符合觸發條件
 */
export function checkShouldRemindNow(reminder: AccountingReminder, now: Date = new Date()): boolean {
  if (!reminder.enabled) return false;

  // 使用台灣/台北時區 (GMT+8) 換算目前小時與分鐘，強制指定 24 小時制 (hourCycle: h23)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';

  // 比對星期幾
  // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || '';
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const currentDay = dayMap[weekdayStr] ?? now.getDay();

  // 頻率條件檢驗
  if (reminder.frequency === 'weekdays' && (currentDay === 0 || currentDay === 6)) {
    return false;
  }
  if (reminder.frequency === 'weekends' && currentDay !== 0 && currentDay !== 6) {
    return false;
  }
  if (reminder.frequency === 'custom') {
    const days = reminder.customDays || [];
    if (!days.includes(currentDay)) return false;
  }

  // 取得台北時區今日日期 (YYYY-MM-DD)
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  const todayStr = `${year}-${month}-${day}`;

  // 時間檢驗 (以台灣時間為準)
  const targetTime = reminder.time || '21:00';
  const [remH, remM] = targetTime.split(':').map(Number);
  const currH = parseInt(hour, 10);
  const currM = parseInt(minute, 10);
  const diffMinutes = (currH * 60 + currM) - (remH * 60 + remM);

  // 尚未到設定時間
  if (diffMinutes < 0) {
    return false;
  }

  // 避免同一天重複發送：
  // 1. 若今日已經為此 reminder.time 發送過，則不再發送
  // 2. 若使用者今日變更了時間 (例如由 21:00 改為 21:30 或 22:47)，且目前時間已達新設定時間，則允許為新的設定時間發送！
  if (reminder.lastNotifiedDate === todayStr) {
    if (reminder.lastNotifiedTime === targetTime) {
      return false; // 本日此時間點已經發送過
    }
  }

  // 容錯窗口：
  // 常態巡檢每 60 秒常駐執行 (亦配合 Cloud Scheduler 每 1~5 分鐘 Ping)
  // 允許 0 ~ 30 分鐘內的到點推播 (含容器冷啟動/喚醒時的精準補發)
  // 超過 30 分鐘則視為已過時不發，避免使用者設定 21:30 卻在數小時後或隔天被延遲觸發
  if (diffMinutes > 30) {
    return false;
  }

  return true;
}

/**
 * 產生 LINE Flex Message 記帳鬧鐘設定互動卡片
 */
export function buildAlarmFlexMessage(
  reminder: AccountingReminder,
  userName: string,
  appUrl: string = ''
): any {
  const isEnabled = reminder.enabled;
  const statusColor = isEnabled ? '#10B981' : '#EF4444';
  const statusText = isEnabled ? '🟢 提醒中 (已開啟)' : '🔴 已暫停 (已關閉)';
  const freqText = formatFrequencyText(reminder);
  const messageText = reminder.message || DEFAULT_REMINDER_MESSAGE;

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      backgroundColor: '#FEF3C7',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '⏰ 每日記帳提醒鬧鐘',
              weight: 'bold',
              size: 'lg',
              color: '#92400E',
              flex: 1,
            },
            {
              type: 'text',
              text: isEnabled ? '🔔 運作中' : '🔕 已暫停',
              size: 'xs',
              weight: 'bold',
              color: statusColor,
              align: 'end',
            },
          ],
        },
        {
          type: 'text',
          text: `哈囉 ${userName}！專屬個人記帳鬧鐘管理中心`,
          size: 'xs',
          color: '#B45309',
          margin: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      spacing: 'md',
      contents: [
        // 目前狀態標籤
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          backgroundColor: isEnabled ? '#ECFDF5' : '#FEF2F2',
          cornerRadius: 'md',
          paddingAll: 'sm',
          contents: [
            {
              type: 'text',
              text: '鬧鐘狀態',
              size: 'xs',
              color: '#6B7280',
              flex: 3,
            },
            {
              type: 'text',
              text: statusText,
              size: 'xs',
              weight: 'bold',
              color: statusColor,
              flex: 5,
              align: 'end',
            },
          ],
        },
        // 提醒時間
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '🕒 提醒時間',
              size: 'sm',
              color: '#4B5563',
              flex: 4,
            },
            {
              type: 'text',
              text: reminder.time,
              size: 'lg',
              weight: 'bold',
              color: '#1F2937',
              flex: 4,
              align: 'end',
            },
          ],
        },
        // 重複頻率
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '📅 重複頻率',
              size: 'xs',
              color: '#4B5563',
              flex: 4,
            },
            {
              type: 'text',
              text: freqText,
              size: 'xs',
              weight: 'bold',
              color: '#374151',
              flex: 6,
              align: 'end',
              wrap: true,
            },
          ],
        },
        // 提醒小語
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F9FAFB',
          cornerRadius: 'md',
          paddingAll: 'sm',
          contents: [
            {
              type: 'text',
              text: '💬 提醒推播小語：',
              size: 'xxs',
              color: '#9CA3AF',
            },
            {
              type: 'text',
              text: `「${messageText}」`,
              size: 'xs',
              color: '#4B5563',
              wrap: true,
              margin: 'xs',
            },
          ],
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: 'md',
      contents: [
        // 開啟/關閉切換按鈕
        {
          type: 'button',
          style: isEnabled ? 'secondary' : 'primary',
          color: isEnabled ? '#FEE2E2' : '#10B981',
          height: 'sm',
          action: {
            type: 'postback',
            label: isEnabled ? '🔕 關閉記帳鬧鐘' : '🔔 開啟記帳鬧鐘',
            data: `action=alarm_toggle&uid=${reminder.userId}&enable=${isEnabled ? '0' : '1'}`,
            displayText: isEnabled ? '🔕 關閉記帳鬧鐘' : '🔔 開啟記帳鬧鐘',
          },
        },
        // 快捷設定時間與頻率列
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'secondary',
              color: '#E0E7FF',
              height: 'sm',
              action: {
                type: 'postback',
                label: '🕒 修改時間',
                data: `action=alarm_edit_time&uid=${reminder.userId}`,
                displayText: '🕒 修改鬧鐘時間',
              },
              flex: 1,
            },
            {
              type: 'button',
              style: 'secondary',
              color: '#FEF3C7',
              height: 'sm',
              action: {
                type: 'postback',
                label: '📅 修改頻率',
                data: `action=alarm_edit_freq&uid=${reminder.userId}`,
                displayText: '📅 修改重複頻率',
              },
              flex: 1,
            },
          ],
        },
        // 立即發送測試提醒推播
        {
          type: 'button',
          style: 'secondary',
          color: '#FEF08A',
          height: 'sm',
          action: {
            type: 'postback',
            label: '📢 立即發送測試提醒',
            data: `action=alarm_test_push&uid=${reminder.userId}`,
            displayText: '📢 發送測試提醒推播',
          },
        },
        // 開始記帳 (退出鬧鐘並回到預設狀態機)
        {
          type: 'button',
          style: 'primary',
          color: '#2563EB',
          height: 'sm',
          action: {
            type: 'postback',
            label: '✏️ 開始記帳 (回預設選單)',
            data: `action=alarm_exit&uid=${reminder.userId}`,
            displayText: '✏️ 開始記帳',
          },
        },
        // 前往網頁端進階自訂按鈕
        ...(appUrl
          ? [
              {
                type: 'button',
                style: 'link',
                height: 'sm',
                action: {
                  type: 'uri',
                  label: '⚙️ 打開 App 完整自訂',
                  uri: `${appUrl}/?openModal=reminder`,
                },
              },
            ]
          : []),
      ],
    },
  };
}

/**
 * 產生 LINE 記帳鬧鐘專屬快捷選單 (Quick Reply)
 * 包含「✏️ 開始記帳」讓使用者能一鍵退出並回到預設狀態機
 */
export function buildAlarmQuickReply(
  reminder: AccountingReminder,
  targetUserId: string,
  lineUserId?: string
) {
  const isEnabled = reminder.enabled;
  return {
    items: [
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '✏️ 開始記帳',
          data: `action=alarm_exit&uid=${targetUserId}`,
          displayText: '✏️ 開始記帳',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: isEnabled ? '🔕 關閉鬧鐘' : '🔔 開啟鬧鐘',
          data: `action=alarm_toggle&uid=${targetUserId}&enable=${isEnabled ? '0' : '1'}`,
          displayText: isEnabled ? '🔕 關閉記帳鬧鐘' : '🔔 開啟記帳鬧鐘',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🕒 20:00',
          data: `action=alarm_set_time&val=20:00&uid=${targetUserId}`,
          displayText: '設定時間為 20:00',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🌙 21:00',
          data: `action=alarm_set_time&val=21:00&uid=${targetUserId}`,
          displayText: '設定時間為 21:00',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🌜 21:30',
          data: `action=alarm_set_time&val=21:30&uid=${targetUserId}`,
          displayText: '設定時間為 21:30',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🦉 22:00',
          data: `action=alarm_set_time&val=22:00&uid=${targetUserId}`,
          displayText: '設定時間為 22:00',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '📅 每天提醒',
          data: `action=alarm_set_freq&val=daily&uid=${targetUserId}`,
          displayText: '設定為每天',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '💼 平日提醒',
          data: `action=alarm_set_freq&val=weekdays&uid=${targetUserId}`,
          displayText: '設定為平日工作日',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '📢 測試推播',
          data: `action=alarm_test_push&uid=${targetUserId}`,
          displayText: '📢 立即發送測試提醒',
        },
      },
    ],
  };
}

/**
 * 產生清晰詳盡之記帳鬧鐘文字說明
 */
export function buildAlarmTextGuide(
  reminder: AccountingReminder,
  userName: string,
  appUrl: string = ''
): string {
  const isEnabled = reminder.enabled;
  const statusStr = isEnabled ? '🟢 運作中 (已開啟)' : '🔴 已暫停 (已關閉)';
  const freqStr = formatFrequencyText(reminder);
  const webUrl = appUrl ? `${appUrl}/?openModal=reminder` : '';

  return (
    `⏰【資產上羊・每日記帳提醒鬧鐘】\n` +
    `哈囉 ${userName}！專屬個人記帳鬧鐘管理中心 🐑✨\n\n` +
    `• 鬧鐘狀態：${statusStr}\n` +
    `• 提醒時間：每日 ${reminder.time}\n` +
    `• 重複頻率：${freqStr}\n` +
    `• 提醒小語：「${reminder.message || DEFAULT_REMINDER_MESSAGE}」\n\n` +
    `💡【如何快速調整鬧鐘？】\n` +
    `1️⃣ 點擊下方快捷按鈕直接切換時間（20:00、21:00、21:30、22:00）\n` +
    `2️⃣ 直接回傳任何時間文字，小羊會自動辨識！\n` +
    `   例如：「改 20:30」、「晚上10點」、「22:00」、「關閉鬧鐘」\n` +
    `3️⃣ 點選下方「📢 測試推播」可立即測試接收通知！\n` +
    `4️⃣ 點選「✏️ 開始記帳」或輸入「開始記帳」可隨時退出設定回到主選單！` +
    (webUrl ? `\n\n📱 完整進階自訂請前往：\n${webUrl}` : '')
  );
}

/**
 * 立即對特定使用者發送測試提醒推播 (供網頁端或 LINE 端驗證效果)
 */
export async function sendTestReminderPush(
  userId: string,
  explicitLineUserId?: string,
  userEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const reminder = await getUserReminder(userId);
    const config = await getGlobalSystemConfig();
    const token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

    if (!token) {
      return { success: false, error: '系統尚未配置 LINE 官方 Channel Access Token (請於管理員後台 Tab 5 設定)' };
    }

    // 查找該用戶之 lineUserId (支援直接 lineUserId、使用者資料庫與特認總管理員綁定)
    let lineUserId = (explicitLineUserId || '').trim();

    if (!lineUserId && (isSuperAdminUser(userId) || isSuperAdminUser(userEmail))) {
      lineUserId = SUPER_ADMIN_LINE_USER_ID;
    }

    if (!lineUserId && userId.startsWith('line_')) {
      lineUserId = userId.replace(/^line_/, '').trim();
    }

    if (!lineUserId && userEmail) {
      const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', userEmail.toLowerCase().trim())));
      if (!emailSnap.empty) {
        lineUserId = (emailSnap.docs[0].data() as User)?.lineUserId || '';
      }
    }

    if (!lineUserId) {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const uData = userDoc.data() as User;
        lineUserId = uData?.lineUserId || '';
      }
    }

    if (!lineUserId) {
      // 搜尋是否有 aliasUserIds 符合
      const uSnap = await getDocs(query(collection(db, 'users'), where('aliasUserIds', 'array-contains', userId)));
      if (!uSnap.empty) {
        lineUserId = (uSnap.docs[0].data() as User)?.lineUserId || '';
      }
    }

    if (!lineUserId) {
      return {
        success: false,
        error: '該帳號尚未綁定 LINE 帳號 (請先以 LINE 官方帳號進行任一對話或綁定)',
      };
    }

    const { sendLinePushMessage } = await import('./lineMessagingService');
    const { buildPinnedQuickReply } = await import('./lineRichMenuService');

    const appUrl = getAppBaseUrl();
    const pinnedQuickReply = buildPinnedQuickReply({
      appUrl,
      lineUserId,
      liffId: config?.liffId,
    });

    const msg = `⏰【資產上羊・每日記帳提醒鬧鐘測試】\n\n哈囉！這是一則測試提醒通知～🐑✨\n\n💬 目前自訂小語：\n「${reminder.message || DEFAULT_REMINDER_MESSAGE}」\n\n🕒 設定時間：每日 ${reminder.time}\n📅 重複頻率：${formatFrequencyText(reminder)}\n\n💡 系統已為您就緒！每日提醒時間一到，小羊會在此聊天室準時向您發送推播。\n平時出門在外，只要隨手輸入一句話即可完成記帳（例如：「午餐 120」或「買咖啡 85」）！`;

    const ok = await sendLinePushMessage(lineUserId, msg, token, pinnedQuickReply);
    return { success: ok, error: ok ? undefined : '發送 LINE 推播失敗，請檢查 Channel Access Token 是否有效' };
  } catch (err: any) {
    console.error('[sendTestReminderPush Error]:', err);
    return { success: false, error: err?.message || '測試推播失敗' };
  }
}

/**
 * 全域背景巡檢調度：檢查所有開啟中的提醒鬧鐘，並準時發送推播
 */
export async function checkAndDispatchReminders(): Promise<{ sentCount: number }> {
  if (isFirestoreQuotaExceeded()) {
    return { sentCount: 0 };
  }
  let sentCount = 0;
  try {
    const config = await getGlobalSystemConfig();
    const token = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    if (!token) return { sentCount: 0 };

    const { limit } = await import('firebase/firestore');
    const colRef = collection(db, 'reminders');
    const q = query(colRef, where('enabled', '==', true), limit(100));
    const snap = await getDocs(q);

    const now = new Date();
    // 使用台灣/台北時區 (GMT+8) 格式化為標準 YYYY-MM-DD
    const taipeiFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = taipeiFormatter.format(now); // e.g. '2026-10-12'

    const dispatchedLineUsersThisRun = new Set<string>();

    for (const d of snap.docs) {
      const reminder = d.data() as AccountingReminder;

      // 1. 防護網：過濾測試與無效文件，防止髒資料推播
      if (
        !reminder.userId ||
        reminder.userId === 'test-push' ||
        reminder.userId === 'test_user' ||
        reminder.userId === 'anonymous' ||
        d.id === 'reminder_test-push' ||
        d.id === 'reminder_test_user'
      ) {
        try {
          await deleteDoc(doc(db, 'reminders', d.id));
        } catch {}
        continue;
      }

      if (checkShouldRemindNow(reminder, now)) {
        let lineUserId: string | undefined = reminder.lineUserId;

        if (!lineUserId) {
          if (reminder.userId.startsWith('line_')) {
            lineUserId = reminder.userId.replace(/^line_/, '').trim();
          } else if (isSuperAdminUser(reminder.userId)) {
            lineUserId = SUPER_ADMIN_LINE_USER_ID;
          }
        }

        if (!lineUserId) {
          try {
            const userDoc = await getDoc(doc(db, 'users', reminder.userId));
            if (userDoc.exists()) {
              const userData = userDoc.data() as User;
              lineUserId = userData?.lineUserId;
            }
          } catch {}
        }

        if (!lineUserId) {
          try {
            const lineUserDoc = await getDoc(doc(db, 'users', `line_${reminder.userId}`));
            if (lineUserDoc.exists()) {
              lineUserId = (lineUserDoc.data() as User)?.lineUserId;
            }
          } catch {}
        }

        if (!lineUserId) {
          try {
            const usersRef = collection(db, 'users');
            const qMerged = query(usersRef, where('mergedIntoUserId', '==', reminder.userId));
            const snapMerged = await getDocs(qMerged);
            if (!snapMerged.empty) {
              const matched = snapMerged.docs[0].data() as User;
              lineUserId = matched.lineUserId;
            }
          } catch {}
        }

        if (!lineUserId) {
          console.warn(`[ReminderScheduler] 無法解析使用者 ${reminder.userId} 的 LINE User ID，跳過推播`);
          continue;
        }

        // 2. 防重複推播：同一 LINE 帳號在同一次巡檢中絕不重複發送
        if (dispatchedLineUsersThisRun.has(lineUserId)) {
          continue;
        }

        // 若原提醒設定缺少 lineUserId，自動回寫補齊
        if (!reminder.lineUserId && lineUserId) {
          setDoc(doc(db, 'reminders', d.id), { lineUserId }, { merge: true }).catch(() => {});
        }

        const { sendLinePushMessage } = await import('./lineMessagingService');
        const { buildPinnedQuickReply } = await import('./lineRichMenuService');

        const appUrl = getAppBaseUrl();
        const pinnedQuickReply = buildPinnedQuickReply({
          appUrl,
          lineUserId,
          liffId: config?.liffId,
        });

        const pushMsg = `⏰【資產上羊・每日記帳提醒】\n\n哈囉！該記帳囉～🐑✨\n${reminder.message || DEFAULT_REMINDER_MESSAGE}\n\n💬 您現在可以直接在下方回傳一句話極速記帳：\n• 「晚餐 160」\n• 「全聯生活用品 450」\n• 「手搖飲 65 信用卡」\n\n📸 也可以直接拍照上傳發票/收據讓我自動辨識喔！`;

        const ok = await sendLinePushMessage(lineUserId, pushMsg, token, pinnedQuickReply);
        if (ok) {
          sentCount++;
          dispatchedLineUsersThisRun.add(lineUserId);
          // 標記今日已發送與詳細時間點 (包含 lastNotifiedTime)
          await setDoc(
            doc(db, 'reminders', d.id),
            {
              lastNotifiedDate: todayStr,
              lastNotifiedTime: reminder.time || '21:00',
              lastNotifiedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }
    }
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
  }

  return { sentCount };
}
