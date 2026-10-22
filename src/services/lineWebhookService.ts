import crypto from 'crypto';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, cleanForFirestore, isSuperAdminUser, SUPER_ADMIN_LINE_USER_ID, SUPER_ADMIN_GOOGLE_UID } from '../firebase/config';
import { getAppBaseUrl, getLiffId, getLiffUrl } from '../utils/urlUtils';
import { getGlobalSystemConfig } from './systemService';
import { Transaction, User, LedgerCurrency, Ledger, AssetType } from '../types';
import {
  buildGoldenLayoutFlexMessage,
  buildOpenAppFlexMessage,
  FlexPendingTransactionData,
} from './lineFlexTemplates';
import {
  ParsedLineTransaction,
  parseChineseFinancialText,
  parseLineMessageWithGemini,
  UserAppContext,
} from './lineNlpParser';
import { parseReceiptImageWithGemini } from './geminiService';
import {
  LineUserState,
  getUserState,
  setUserState,
  getPendingTx,
  savePendingTx,
  removePendingTx,
  getUserExistingLedgers,
  resolveLedgerAndSplit,
} from './lineStateManager';
import { fetchLineUserProfile } from './lineProfileService';
import { initializeUserDefaultLedgers, createLedger } from './ledgerService';
import { getUserAssetAccounts, initializeDefaultAssets, createAssetAccount } from './walletService';
import { getUserCategories, createCategory } from './categoryService';
import { ensureUserDummyFriends, getUserFriends } from './friendService';
import { buildPinnedQuickReply } from './lineRichMenuService';
import { expandAllMemberAliases } from './identityService';
import { createTransaction, updateTransaction, softDeleteTransaction } from './transactionService';
import {
  getUserReminder,
  saveUserReminder,
  toggleUserReminder,
  buildAlarmFlexMessage,
  formatFrequencyText,
} from './reminderService';
import { ReminderFrequency } from '../types';
import {
  handleSplitButtonClick,
  promptSplitMembersForLedger,
  executeSplitWithMembers,
  cancelSplit,
} from './lineSplitFlowService';

// 向外重導出，確保向前相容性與模組化調用
export * from './lineNlpParser';
export * from './lineStateManager';
export * from './lineProfileService';
export * from './lineRichMenuService';
export * from './lineMessagingService';
export * from './lineUserContextService';

import {
  verifyLineSignature,
  sendLineFlexMessage,
  sendLineDualMessage,
  sendLineReplyMessage,
  sendLineLoadingAnimation,
  sendLinePushMessage,
} from './lineMessagingService';
import { buildUserAppContext } from './lineUserContextService';
import { handleImageMessage } from './lineImageService';
import { handleEditLastTransaction } from './lineEditLastService';


/**
 * LINE Webhook 核心管道處理 (Pipeline)
 */
export async function processLineWebhookPayload(
  rawBody: string,
  signature: string,
  baseUrl?: string
): Promise<{ status: number; message: string }> {
  let config: any = null;
  try {
    config = await getGlobalSystemConfig();
  } catch (e: any) {
    console.warn('[LINE Webhook] 系統配置讀取降級備援:', e?.message);
  }

  const secret = (config?.lineChannelSecret || process.env.LINE_CHANNEL_SECRET || '').trim();
  const accessToken = (config?.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();

  // 1. 強制簽章校驗
  if (secret && signature) {
    const isValid = verifyLineSignature(rawBody, signature, secret);
    if (!isValid) {
      console.warn('[LINE Webhook] 簽章驗證失敗 (HMAC-SHA256 mismatch)');
      return { status: 403, message: 'Invalid signature' };
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, message: 'Invalid JSON' };
  }

  const events: any[] = payload?.events || [];
  if (events.length === 0) {
    return { status: 200, message: 'No events' };
  }

  for (const event of events) {
    const lineUserId = event.source?.userId;
    const replyToken = event.replyToken;

    if (!lineUserId || !replyToken) continue;

    try {
      // 1. 呼叫官方 LINE Messaging API 即時抽取使用者的真實姓名與大頭貼
      let lineProfile = null;
      try {
        lineProfile = await fetchLineUserProfile(
          lineUserId,
          accessToken,
          event.source?.groupId,
          event.source?.roomId
        );
      } catch (profErr: any) {
        console.warn('[LINE Profile Fetch Warn]:', profErr?.message);
      }

      // 2. 帳號鉤稽與身分實體初始化 (支援已合併至 Google 帳號的用戶自動路由)
      let targetUserId = `line_${lineUserId}`;
      let userName = lineProfile?.displayName || 'LINE 夥伴';
      let userAvatar =
        lineProfile?.pictureUrl ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

      // 🌟 總管理員專屬存續主帳號動態路由 (依據伺服器環境變數與資料庫判定) 🌟
      if (SUPER_ADMIN_LINE_USER_ID && lineUserId === SUPER_ADMIN_LINE_USER_ID) {
        if (SUPER_ADMIN_GOOGLE_UID) {
          targetUserId = SUPER_ADMIN_GOOGLE_UID;
        }
      }

      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('lineUserId', '==', lineUserId));
        const snap = await getDocs(q);

        if (!snap.empty && (!SUPER_ADMIN_GOOGLE_UID || targetUserId !== SUPER_ADMIN_GOOGLE_UID)) {
          const matchedDoc = snap.docs[0];
          targetUserId = matchedDoc.id;
          const u = matchedDoc.data() as User;

          // 若該 LINE 帳號已透過原子融合歸併至主帳號 (例如 Google 帳號)，自動導向至存續主帳號
          if ((u as any).mergedIntoUserId) {
            targetUserId = (u as any).mergedIntoUserId;
          }

          // 保持名稱與頭貼為最新狀態 (避免永遠停留在「LINE 夥伴」)
          const isSuper = isSuperAdminUser({
            id: matchedDoc.id,
            lineUserId,
            name: userName,
          });
          const needsSuperPromotion = (isSuper || isSuperAdminUser(u)) && u.role !== 'super_admin';

          if (lineProfile) {
            userName = lineProfile.displayName || u.name || userName;
            userAvatar = lineProfile.pictureUrl || u.avatarUrl || userAvatar;

            if (
              u.name === 'LINE 夥伴' ||
              u.name === 'LINE 使用者' ||
              !u.avatarUrl?.includes('line-scdn.net') ||
              needsSuperPromotion
            ) {
              await setDoc(
                doc(db, 'users', matchedDoc.id),
                {
                  name: userName,
                  avatarUrl: userAvatar,
                  ...(needsSuperPromotion ? { role: 'super_admin' } : {}),
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          } else {
            userName = u.name || userName;
            userAvatar = u.avatarUrl || userAvatar;
            if (needsSuperPromotion) {
              await setDoc(
                doc(db, 'users', matchedDoc.id),
                {
                  role: 'super_admin',
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );
            }
          }
          if (needsSuperPromotion) {
            u.role = 'super_admin';
          }
        } else {
          // 首次傳訊註冊：以 LINE 官方 Profile 建立全新帳號
          const isSuper = isSuperAdminUser({
            id: targetUserId,
            lineUserId,
            name: userName,
          });
          const newUser: User = {
            id: targetUserId,
            email: `${lineUserId}@line.me`,
            name: userName,
            avatarUrl: userAvatar,
            role: isSuper ? 'super_admin' : 'member',
            lineUserId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          };
          await setDoc(doc(db, 'users', targetUserId), cleanForFirestore(newUser));

          // 僅針對真正全新建立的 LINE 用戶初始化預設個人記帳環境
          await Promise.allSettled([
            initializeUserDefaultLedgers(targetUserId, lineUserId),
            initializeDefaultAssets(targetUserId, lineUserId),
            getUserCategories(targetUserId),
            ensureUserDummyFriends(targetUserId),
          ]);
        }
      } catch (e: any) {
        console.warn('[User Init Fallback]:', e?.message);
      }

      const appUrl = getAppBaseUrl(baseUrl);
      const resolvedLiffId = getLiffId(config?.liffId);
      const directInAppUrl = getLiffUrl(resolvedLiffId, appUrl);

      // 建立底端恆駐快捷狀態列 QuickReply (打開記帳軟體、記帳、修改上一筆、我的帳號)
      const pinnedQuickReply = buildPinnedQuickReply({
        appUrl,
        lineUserId,
        liffId: resolvedLiffId,
      });

      // ==========================================
      // 分支 0: 處理加為好友 (Follow Event / 初次對話導引註冊)
      // ==========================================
      if (event.type === 'follow') {
        const openAppFlex = buildOpenAppFlexMessage({
          userName,
          directInAppUrl,
          isRegister: true,
        });
        await sendLineFlexMessage(
          replyToken,
          openAppFlex,
          accessToken,
          `🎉 歡迎加入【資產上羊】！嗨，${userName}！點擊下方【📱 軟體&功能】隨時進入！`,
          pinnedQuickReply
        );
        continue;
      }

      // ==========================================
      // 分支 A: 處理按鈕回傳 (Postback Event)
      // ==========================================
      if (event.type === 'postback') {
        const targetChatId = event.source?.groupId || event.source?.roomId || lineUserId;
        const postbackData = event.postback?.data || '';
        const params = new URLSearchParams(postbackData);
        const action = params.get('action');
        const tempTxId = params.get('id');
        const userState = await getUserState(lineUserId);

        // --- 0. 軟體&功能 (以專屬 Flex 卡片原生開窗開啟，含打開軟體、鬧鐘與記帳捷徑) ---
        if (action === 'open_app') {
          const flexMsg = buildOpenAppFlexMessage({
            userName,
            directInAppUrl,
            isRegister: false,
          });
          await sendLineFlexMessage(
            replyToken,
            flexMsg,
            accessToken,
            `📱 【資產上羊】軟體與功能中心 (${userName})`,
            pinnedQuickReply,
            targetChatId
          );
          continue;
        }

        // --- 0.1 我的帳號 (獨立純文字呈現，便於使用者直接長按複製 ID 貼給管理員協助解決問題) ---
        if (action === 'my_account') {
          const accountText = `🐑【資產上羊】用戶專屬帳號資訊\n\n👤 用戶暱稱：${userName}\n🔑 LINE User ID：\n${lineUserId}\n\n💡【溫馨提醒】：\n若您在系統使用上有任何狀況或帳號問題，請長按上方 LINE User ID 複製貼給管理員，我們將立即為您排查與協助解決！\n\n✨ 專屬配置空間：\n• 🔒 1 個日常私帳 (個人私密記帳)\n• 💳 3 個核心錢包帳戶 (現金皮夾、玉山銀行、電子錢包)\n• 👥 獨立虛擬好友名單與自動平帳\n\n📱 隨時打開軟體：\n請點擊下方狀態列【📱 軟體&功能】隨時進入。亦可直接對我輸入「晚餐 150」立即記帳！🐑✨`;
          await sendLineReplyMessage(replyToken, accountText, accessToken, pinnedQuickReply);
          continue;
        }

        // --- 🛡️ 處理未確認草稿抉擇 (完成上一筆 vs 放棄上一筆) ---
        if (action === 'draft_resolve') {
          const mode = params.get('mode');
          const pid = params.get('pid') || '';
          const ptype = params.get('ptype') || 'single';
          const { getPendingTx, getPendingBatch, removePendingBatch } = await import('./lineStateManager');
          const { commitSingleDraft, discardSingleDraft } = await import('./draftManagerService');
          const { commitBatchTransactions, buildBatchSummaryFlexMessage } = await import('./batchTransactionService');

          if (mode === 'view_prev') {
            if (ptype === 'single') {
              const prevTx = await getPendingTx(pid);
              if (prevTx) {
                const flexMsg = buildGoldenLayoutFlexMessage(prevTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `【上一筆草稿】${prevTx.title} NT$ ${prevTx.amount.toLocaleString()} 元`,
                  pinnedQuickReply,
                  targetChatId
                );
                continue;
              }
            } else if (ptype === 'batch') {
              const batch = await getPendingBatch(pid);
              if (batch) {
                const flexMsg = buildBatchSummaryFlexMessage(batch, appUrl);
                await sendLineDualMessage(
                  replyToken,
                  flexMsg,
                  `📦 批量草稿：共 ${batch.validCount} 筆`,
                  accessToken,
                  pinnedQuickReply
                );
                continue;
              }
            }
            await sendLineReplyMessage(replyToken, '⚠️ 該草稿已不存在或已逾期。', accessToken, pinnedQuickReply);
            continue;
          }

          let resolutionFeedback = '';
          if (mode === 'commit_prev') {
            if (ptype === 'single') {
              const res = await commitSingleDraft(pid, targetUserId, lineUserId);
              resolutionFeedback = res.success
                ? `🎉 上一筆草稿已入帳！\n`
                : `⚠️ 上一筆入帳未完全：${res.message}\n`;
            } else if (ptype === 'batch') {
              const res = await commitBatchTransactions(pid, targetUserId);
              resolutionFeedback = res.success
                ? `🎉 上一筆批量記帳 (${res.insertedCount} 筆) 已全數入帳！\n`
                : `⚠️ 批量入帳失敗\n`;
            }
          } else if (mode === 'discard_prev') {
            if (ptype === 'single') {
              await discardSingleDraft(pid, lineUserId);
            } else if (ptype === 'batch') {
              await removePendingBatch(pid);
            }
            resolutionFeedback = `🗑️ 已為您捨棄上一筆未確認草稿。\n`;
          }

          const pendingNewText = userState.incomingNewText;
          const pendingImgMsgId = userState.incomingImageMsgId;
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          if (pendingNewText) {
            await sendLinePushMessage(
              targetChatId,
              `${resolutionFeedback}👉 正在為您繼續處理剛才輸入的：「${pendingNewText}」...`,
              accessToken
            );
            const { executeAccountingText } = await import('./lineAccountingExecutor');
            await executeAccountingText({
              userText: pendingNewText,
              targetUserId,
              userName,
              lineUserId,
              replyToken,
              accessToken,
              targetChatId,
              pinnedQuickReply,
              config,
              baseUrl,
              userState: { state: 'IDLE', updatedAt: Date.now() },
              buildUserAppContext,
              resolveLedgerAndSplit,
              sendLinePushMessage,
              sendLineLoadingAnimation,
              sendLineReplyMessage,
              sendLineFlexMessage,
              sendLineDualMessage,
            });
            continue;
          } else if (pendingImgMsgId) {
            await sendLinePushMessage(
              targetChatId,
              `${resolutionFeedback}👉 正在為您辨識剛才傳送的發票收據照片...`,
              accessToken
            );
            await handleImageMessage(
              event,
              targetUserId,
              userName,
              lineUserId,
              replyToken,
              accessToken,
              targetChatId,
              pinnedQuickReply,
              config,
              pendingImgMsgId
            );
            continue;
          } else {
            await sendLineReplyMessage(
              replyToken,
              `${resolutionFeedback}隨時可輸入文字或傳送發票照片開始記帳！🐑✨`,
              accessToken,
              pinnedQuickReply
            );
            continue;
          }
        }

        if (action === 'edit_last') {
          await handleEditLastTransaction(targetUserId, userName, lineUserId, replyToken, accessToken, pinnedQuickReply);
          continue;
        }

        if (action === 'delete_existing') {
          const pendingTx = tempTxId ? await getPendingTx(tempTxId) : null;
          if (pendingTx?.existingTxId) {
            await softDeleteTransaction(pendingTx.existingTxId);
          }
          if (tempTxId) await removePendingTx(tempTxId);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          await sendLineReplyMessage(
            replyToken,
            `🗑️ 已成功刪除該筆交易明細（項目：${pendingTx?.title || '歷史紀錄'}，金額：${pendingTx?.currency || 'TWD'} ${pendingTx?.amount?.toLocaleString() || 0} 元），資產帳戶餘額已即時智慧回滾！`,
            accessToken,
            pinnedQuickReply
          );
          continue;
        }

        // --- ⏰ 每日記帳鬧鐘設定與開關控制 ---
        if (action === 'alarm_settings') {
          const reminder = await getUserReminder(targetUserId);
          const appUrl = getAppBaseUrl(baseUrl);
          const { buildAlarmQuickReply, buildAlarmTextGuide } = await import('./reminderService');
          const alarmQuickReply = buildAlarmQuickReply(reminder, targetUserId, lineUserId);
          const textGuide = buildAlarmTextGuide(reminder, userName, appUrl);
          const flexMsg = buildAlarmFlexMessage(reminder, userName, appUrl);

          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          await sendLineDualMessage(
            replyToken,
            flexMsg,
            textGuide,
            accessToken,
            alarmQuickReply,
            `⏰ 記帳鬧鐘設定：每日 ${reminder.time} (${reminder.enabled ? '開啟中' : '已關閉'})`
          );
          continue;
        }

        if (action === 'alarm_toggle') {
          const enableParam = params.get('enable');
          const isEnable = enableParam === '1';
          const updated = await toggleUserReminder(targetUserId, isEnable);
          const appUrl = getAppBaseUrl(baseUrl);
          const { buildAlarmQuickReply } = await import('./reminderService');
          const alarmQuickReply = buildAlarmQuickReply(updated, targetUserId, lineUserId);
          const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
          const statusText = isEnable
            ? `🔔 已成功開啟每日記帳提醒鬧鐘！將在每日 ${updated.time} 準時發送推播提醒。\n\n您可隨時點選下方快捷時段調整時間，或點選「📢 測試推播」進行測試。`
            : `🔕 已成功關閉記帳提醒鬧鐘，未來將不再主動發送推播。\n\n若需重新開啟，可隨時點選下方「🔔 開啟鬧鐘」。`;

          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          await sendLineDualMessage(
            replyToken,
            flexMsg,
            statusText,
            accessToken,
            alarmQuickReply,
            isEnable ? `🔔 已開啟每日記帳鬧鐘 (${updated.time})` : '🔕 已關閉記帳鬧鐘'
          );
          continue;
        }

        if (action === 'alarm_exit') {
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          await sendLineReplyMessage(
            replyToken,
            '🐑 記帳鬧鐘設定已保存！小羊隨時在此待命，打字即可快速記帳（例如：「午餐 120」或「買咖啡 85」）。',
            accessToken,
            pinnedQuickReply
          );
          continue;
        }

        if (action === 'alarm_edit_time') {
          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          const timeQuickReply = {
            items: [
              { type: 'action', action: { type: 'postback', label: '✏️ 開始記帳', data: `action=alarm_exit&uid=${targetUserId}`, displayText: '✏️ 開始記帳' } },
              { type: 'action', action: { type: 'postback', label: '🌅 09:00', data: `action=alarm_set_time&val=09:00&uid=${targetUserId}`, displayText: '設定為 09:00' } },
              { type: 'action', action: { type: 'postback', label: '🍱 13:00', data: `action=alarm_set_time&val=13:00&uid=${targetUserId}`, displayText: '設定為 13:00' } },
              { type: 'action', action: { type: 'postback', label: '🍜 19:30', data: `action=alarm_set_time&val=19:30&uid=${targetUserId}`, displayText: '設定為 19:30' } },
              { type: 'action', action: { type: 'postback', label: '🌙 20:30', data: `action=alarm_set_time&val=20:30&uid=${targetUserId}`, displayText: '設定為 20:30' } },
              { type: 'action', action: { type: 'postback', label: '🌜 21:00', data: `action=alarm_set_time&val=21:00&uid=${targetUserId}`, displayText: '設定為 21:00' } },
              { type: 'action', action: { type: 'postback', label: '🦉 22:00', data: `action=alarm_set_time&val=22:00&uid=${targetUserId}`, displayText: '設定為 22:00' } },
            ],
          };
          const promptText = `🕒 【設定記帳鬧鐘提醒時間】\n\n請直接點擊下方快捷時段，或直接打字回傳您希望的時間點（例如：「20:30」、「晚上9點」、「2130」）：`;
          await sendLineReplyMessage(replyToken, promptText, accessToken, timeQuickReply);
          continue;
        }

        if (action === 'alarm_set_time') {
          const val = params.get('val') || '21:00';
          const updated = await saveUserReminder(targetUserId, { time: val, enabled: true });
          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          const appUrl = getAppBaseUrl(baseUrl);
          const { buildAlarmQuickReply } = await import('./reminderService');
          const alarmQuickReply = buildAlarmQuickReply(updated, targetUserId, lineUserId);
          const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
          const confirmText = `🕒 提醒時間已成功變更為【${val}】！每日記帳鬧鐘已啟動。\n\n小羊會在每日 ${val} 準時提醒您！點選下方「📢 測試推播」可測試通知，或點選「✏️ 開始記帳」回到主選單。`;

          await sendLineDualMessage(
            replyToken,
            flexMsg,
            confirmText,
            accessToken,
            alarmQuickReply,
            `🕒 記帳鬧鐘時間已設定為 ${val}`
          );
          continue;
        }

        if (action === 'alarm_edit_freq') {
          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          const freqQuickReply = {
            items: [
              { type: 'action', action: { type: 'postback', label: '✏️ 開始記帳', data: `action=alarm_exit&uid=${targetUserId}`, displayText: '✏️ 開始記帳' } },
              { type: 'action', action: { type: 'postback', label: '📅 每天', data: `action=alarm_set_freq&val=daily&uid=${targetUserId}`, displayText: '設定為每天' } },
              { type: 'action', action: { type: 'postback', label: '💼 工作日(一至五)', data: `action=alarm_set_freq&val=weekdays&uid=${targetUserId}`, displayText: '設定為平日工作日' } },
              { type: 'action', action: { type: 'postback', label: '🏖️ 週末(六日)', data: `action=alarm_set_freq&val=weekends&uid=${targetUserId}`, displayText: '設定為週末假期' } },
            ],
          };
          const promptText = `📅 【設定記帳鬧鐘重複頻率】\n\n請點選下方重複頻率（或直接打字「每天」、「平日」、「週末」）：`;
          await sendLineReplyMessage(replyToken, promptText, accessToken, freqQuickReply);
          continue;
        }

        if (action === 'alarm_set_freq') {
          const val = (params.get('val') || 'daily') as any;
          const updated = await saveUserReminder(targetUserId, { frequency: val, enabled: true });
          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          const appUrl = getAppBaseUrl(baseUrl);
          const { buildAlarmQuickReply } = await import('./reminderService');
          const alarmQuickReply = buildAlarmQuickReply(updated, targetUserId, lineUserId);
          const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
          const confirmText = `📅 重複頻率已成功變更為【${formatFrequencyText(updated)}】！\n\n鬧鐘將依照此頻率在每日 ${updated.time} 準時發送推播。點選「✏️ 開始記帳」可立即回到主選單。`;

          await sendLineDualMessage(
            replyToken,
            flexMsg,
            confirmText,
            accessToken,
            alarmQuickReply,
            `📅 記帳鬧鐘頻率已設定為 ${formatFrequencyText(updated)}`
          );
          continue;
        }

        if (action === 'alarm_test_push') {
          const { sendTestReminderPush, getUserReminder } = await import('./reminderService');
          const reminder = await getUserReminder(targetUserId);
          const pushRes = await sendTestReminderPush(targetUserId, lineUserId);
          // 發送測試推播後，自動切回預設狀態機 (IDLE 與 pinnedQuickReply)
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          const feedback = pushRes.success
            ? `🎉 測試提醒推播已發送！請查看本聊天室接收狀況。\n\n若您有看到通知，代表推播通道運作正常！每日 ${reminder.time} 小羊會在此準時提醒您。`
            : `⚠️ 測試推播失敗: ${pushRes.error || '請檢查 Channel Access Token'}`;
          await sendLineReplyMessage(replyToken, feedback, accessToken, pinnedQuickReply);
          continue;
        }

        // --- 📦 批量記帳確認與微調按鈕操作 ---
        if (action === 'batch_confirm_all') {
          const bid = params.get('bid') || '';
          const { commitBatchTransactions } = await import('./batchTransactionService');
          const commitRes = await commitBatchTransactions(bid, targetUserId);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          if (commitRes.success) {
            const successMsg = `🎉【批量記帳全數入帳成功！】\n\n✅ 成功匯入筆數：${commitRes.insertedCount} 筆交易\n💸 總支出：NT$ ${commitRes.totalExpense.toLocaleString()} 元\n💰 總收入：NT$ ${commitRes.totalIncome.toLocaleString()} 元\n\n已全數原子寫入系統，並即時更新您的資產錢包餘額！點擊下方快捷鍵可隨時開啟軟體查看最新報表～🐑✨`;
            await sendLineReplyMessage(replyToken, successMsg, accessToken, pinnedQuickReply);
          } else {
            const errMsg = `⚠️ 批量入帳失敗：${commitRes.error || '請稍後再試'}`;
            await sendLineReplyMessage(replyToken, errMsg, accessToken, pinnedQuickReply);
          }
          continue;
        }

        if (action === 'batch_cancel') {
          const bid = params.get('bid') || '';
          const { removePendingBatch } = await import('./lineStateManager');
          await removePendingBatch(bid);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          await sendLineReplyMessage(replyToken, '🗑️ 已放棄本次批量記帳輸入。隨時可再次貼上文字或開始記帳！🐑✨', accessToken, pinnedQuickReply);
          continue;
        }

        if (action === 'batch_view_list') {
          const bid = params.get('bid') || '';
          const page = parseInt(params.get('page') || '1', 10);
          const { getPendingBatch, setUserState } = await import('./lineStateManager');
          const { buildBatchListTextMessage, buildBatchQuickReply } = await import('./batchTransactionService');
          const batch = await getPendingBatch(bid);
          if (!batch) {
            await sendLineReplyMessage(replyToken, '⚠️ 該批次已入帳或已逾期。', accessToken, pinnedQuickReply);
            continue;
          }
          await setUserState(lineUserId, {
            state: 'WAITING_BATCH_CONFIRM',
            tempBatchId: bid,
            updatedAt: Date.now(),
          });
          const listText = buildBatchListTextMessage(batch, page);
          const validItems = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
          const totalPages = Math.ceil(validItems.length / 15) || 1;
          const appUrl = getAppBaseUrl(baseUrl);
          const batchQR = buildBatchQuickReply(bid, validItems.length, appUrl, page, totalPages);
          await sendLineReplyMessage(replyToken, listText, accessToken, batchQR);
          continue;
        }

        if (!action || !tempTxId) {
          await sendLineReplyMessage(replyToken, '⚠️ 無效的操作請求。', accessToken, pinnedQuickReply);
          continue;
        }

        const pendingTx = await getPendingTx(tempTxId);

        if (action === 'confirm') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 此筆交易已確認入帳或已逾期，若需記帳請直接輸入文字。', accessToken, pinnedQuickReply);
            continue;
          }

          if (pendingTx.existingTxId) {
            await updateTransaction(pendingTx.existingTxId, {
              title: pendingTx.title,
              amount: pendingTx.amount,
              currency: (pendingTx.currency as LedgerCurrency) || 'TWD',
              categoryName: pendingTx.categoryName,
              ledgerId: pendingTx.ledgerId,
              date: pendingTx.date,
              splitDetails: pendingTx.splitDetails || undefined,
              note: pendingTx.splitNote ? `LINE 修改記帳 (${pendingTx.splitNote})` : `LINE 記帳修改: ${pendingTx.title}`,
            });
            await removePendingTx(tempTxId);
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

            const successMsg = `🎉 【修改成功】交易明細已更新完成！\n\n📌 項目：${pendingTx.title}\n💰 金額：${pendingTx.currency} ${pendingTx.amount.toLocaleString()} 元\n📂 分類：${pendingTx.categoryName}\n📘 帳本：${pendingTx.ledgerName}\n\n已智慧連動更新資產餘額至「資產上羊」系統！🐑✨`;
            await sendLineReplyMessage(replyToken, successMsg, accessToken, pinnedQuickReply);
            continue;
          }

          // 撈取用戶真實資產帳戶與預設子帳戶
          const userAssetAccounts = await getUserAssetAccounts(pendingTx.userId);
          const firstAcc = userAssetAccounts && userAssetAccounts.length > 0 ? userAssetAccounts[0] : null;
          const firstSubId = firstAcc?.subAccounts && firstAcc.subAccounts.length > 0 ? firstAcc.subAccounts[0].id : null;

          const finalAccountId = pendingTx.accountId || firstAcc?.id || 'acc_default';
          const finalSubAccountId = pendingTx.subAccountId || firstSubId || undefined;

          // 撈取用戶真實分類清單進行高精準配對
          const userCats = await getUserCategories(pendingTx.userId);
          const matchedCat = userCats.find(
            (c) =>
              (pendingTx.type ? c.type === pendingTx.type : true) &&
              (c.name === pendingTx.categoryName ||
                c.name.includes(pendingTx.categoryName) ||
                pendingTx.categoryName.includes(c.name))
          );
          const finalCategoryId =
            matchedCat?.id ||
            pendingTx.categoryId ||
            (pendingTx.type === 'income'
              ? `cat_inc_${pendingTx.userId}_其他收入`
              : `cat_exp_${pendingTx.userId}_其他雜支`);
          const finalCategoryName = matchedCat?.name || pendingTx.categoryName;

          await createTransaction(pendingTx.userId, {
            ledgerId: pendingTx.ledgerId || 'ledger_default_main',
            type: pendingTx.type,
            amount: pendingTx.amount,
            currency: (pendingTx.currency as LedgerCurrency) || 'TWD',
            categoryId: finalCategoryId,
            categoryName: finalCategoryName,
            accountId: finalAccountId,
            subAccountId: finalSubAccountId,
            date: pendingTx.date,
            title: pendingTx.title,
            note: pendingTx.note
              ? `LINE 發票/收據記帳 (${pendingTx.invoiceNumber ? `發票:${pendingTx.invoiceNumber} | ` : ''}${pendingTx.note})`
              : pendingTx.splitNote
              ? `LINE 記帳 (${pendingTx.splitNote})`
              : `來自 LINE 官方機器人記帳: ${pendingTx.rawText || pendingTx.title}`,
            payerMemberId: pendingTx.userId,
            payerId: pendingTx.userId,
            payerName: pendingTx.userName,
            splitDetails: pendingTx.splitDetails || undefined,
          });

          await removePendingTx(tempTxId);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          // 若為新手導覽實戰流程，標記完成並發送專屬恭喜與釘選提示
          if (pendingTx.isTour || userState.isTourActive || pendingTx.title.includes('吃到飽')) {
            const { saveUserTourTopicCompleted } = await import('./tourService');
            await saveUserTourTopicCompleted(pendingTx.userId, 'line_bot');

            let liffUrl = '';
            if (config?.liffId) {
              liffUrl = `https://liff.line.me/${config.liffId}`;
            }

            const tourSuccessMsg = `🎉【恭喜完成 LINE 官方機器人新手記帳導覽】！\n\n📌 項目：${pendingTx.title} (已改 599 元)\n💳 扣款：${pendingTx.accountName || '信用卡'}\n💰 金額：${pendingTx.currency} ${pendingTx.amount.toLocaleString()} 元\n📂 分類：${finalCategoryName}\n\n交易已正式入帳並同步至「資產上羊」系統！🐑✨\n\n📌【重要提醒・出門神技】：\n請在 LINE 聊天室列表長按將【資產上羊】設為「📌 釘選 (Pin to Top)」，出門在外隨手一句話秒記帳！\n\n${liffUrl ? `📱 點擊下方連結以 LIFF 原生開窗回到系統：\n${liffUrl}` : ''}`;
            await sendLineReplyMessage(replyToken, tourSuccessMsg, accessToken, pinnedQuickReply);
            continue;
          }

          const signText = pendingTx.type === 'income' ? '收入' : '支出';
          const splitInfoText = pendingTx.splitNote ? `\n⚖️ 分帳明細：${pendingTx.splitNote}` : '';
          const successMsg = `🎉 【記帳成功】已正式入帳！\n\n📌 項目：${pendingTx.title}\n💰 金額：${pendingTx.currency} ${pendingTx.amount.toLocaleString()} 元\n📂 分類：${finalCategoryName} (${signText})\n📘 帳本：${pendingTx.ledgerName} (${pendingTx.isSharedLedger ? '共管帳本' : '個人帳本'})\n💳 扣款帳戶：${pendingTx.accountName || firstAcc?.name || '現金皮夾'}${splitInfoText}\n\n已自資產帳戶真實扣款並自動加總主帳戶總額！🐑✨`;
          await sendLineReplyMessage(replyToken, successMsg, accessToken, pinnedQuickReply);
          continue;
        }

        if (action === 'cancel') {
          await removePendingTx(tempTxId);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          await sendLineReplyMessage(replyToken, '❌ 已放棄此筆記帳，未寫入帳本。若需重新記帳，隨時對我說喔！', accessToken, pinnedQuickReply);
          continue;
        }

        if (action === 'edit_amount') {
          const isTour = pendingTx?.isTour || userState.isTourActive;
          await setUserState(lineUserId, {
            state: 'WAITING_AMOUNT',
            tempTxId,
            isTourActive: isTour,
            tourStep: 4,
            updatedAt: Date.now(),
          });

          if (isTour) {
            const tourQuickReply = {
              items: [
                {
                  type: 'action',
                  action: { type: 'message', label: '599', text: '599' },
                },
              ],
            };
            await sendLineReplyMessage(
              replyToken,
              `💰【新手導覽・步驟 4/4】\n請直接輸入數字「599」（或點選下方快捷按鈕）：`,
              accessToken,
              tourQuickReply
            );
          } else {
            await sendLineReplyMessage(
              replyToken,
              `💰 請直接輸入修改後的金額（例如：48000、5萬 或 15000）：\n(目前金額為 ${pendingTx ? pendingTx.amount : '未知'}，若為分帳將為成員重新自動均分)`,
              accessToken,
              pinnedQuickReply
            );
          }
          continue;
        }

        if (action === 'edit_category') {
          await setUserState(lineUserId, { state: 'WAITING_CATEGORY', tempTxId, updatedAt: Date.now() });
          await sendLineReplyMessage(
            replyToken,
            `🏷️ 請直接輸入欲修改的分類名稱（例如：餐飲美食、交通運輸、居家生活、水電瓦斯、購物服飾、休閒娛樂、運動健身、醫療健康、數位訂閱、正職薪資）：`,
            accessToken
          );
          continue;
        }

        if (action === 'edit_account') {
          const isTour = pendingTx?.isTour || userState.isTourActive;
          const userAssetAccounts = await getUserAssetAccounts(targetUserId);
          const accList = userAssetAccounts && userAssetAccounts.length > 0
            ? userAssetAccounts.map((a, i) => `${i + 1}. ${a.name}${a.subAccounts?.length ? ` (含 ${a.subAccounts.map((s) => s.name).join('、')})` : ''}`).join('\n')
            : '1. 現金皮夾';
          await setUserState(lineUserId, {
            state: 'WAITING_ACCOUNT',
            tempTxId,
            isTourActive: isTour,
            tourStep: 3,
            updatedAt: Date.now(),
          });

          if (isTour) {
            const tourQuickReply = {
              items: [
                {
                  type: 'action',
                  action: { type: 'message', label: '💳 信用卡', text: '信用卡' },
                },
                {
                  type: 'action',
                  action: { type: 'message', label: '💵 現金皮夾', text: '現金皮夾' },
                },
              ],
            };
            await sendLineReplyMessage(
              replyToken,
              `💳【新手導覽・步驟 3/4】\n請在下方選擇或直接回傳【信用卡】（或點選快捷按鈕），體驗將扣款管道切換至信用卡！\n\n目前扣款帳戶清單：\n${accList}`,
              accessToken,
              tourQuickReply
            );
          } else {
            await sendLineReplyMessage(
              replyToken,
              `💳 請選擇或輸入扣款帳戶（可直接輸入編號或名稱）：\n${accList}`,
              accessToken
            );
          }
          continue;
        }

        if (action === 'edit_split') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到此筆暫存記錄。', accessToken);
            continue;
          }
          await handleSplitButtonClick({
            lineUserId,
            targetUserId,
            userName,
            pendingTx,
            replyToken,
            accessToken,
            sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
            sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
          });
          continue;
        }

        if (action === 'split_choose_ledger') {
          const targetLedgerId = params.get('ledgerId');
          if (!pendingTx || !targetLedgerId) {
            await sendLineReplyMessage(replyToken, '⚠️ 操作無效或找不到紀錄。', accessToken);
            continue;
          }
          const existingLedgers = await getUserExistingLedgers(targetUserId);
          const chosenLedger = existingLedgers.find((l) => l.id === targetLedgerId);
          if (!chosenLedger) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到指定的共管帳本。', accessToken);
            continue;
          }
          await promptSplitMembersForLedger(
            {
              lineUserId,
              targetUserId,
              userName,
              pendingTx,
              replyToken,
              accessToken,
              sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
              sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
            },
            chosenLedger
          );
          continue;
        }

        if (action === 'split_members_submit') {
          const membersParam = params.get('members');
          const targetLedgerId = params.get('ledgerId') || pendingTx?.ledgerId;
          if (!pendingTx || !targetLedgerId) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到暫存紀錄。', accessToken);
            continue;
          }
          const existingLedgers = await getUserExistingLedgers(targetUserId);
          const chosenLedger =
            existingLedgers.find((l) => l.id === targetLedgerId) ||
            existingLedgers.find((l) => l.isShared);
          if (!chosenLedger) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到對應的共管帳本。', accessToken);
            continue;
          }
          await executeSplitWithMembers(
            {
              lineUserId,
              targetUserId,
              userName,
              pendingTx,
              replyToken,
              accessToken,
              sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
              sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
            },
            chosenLedger,
            membersParam || 'all'
          );
          continue;
        }

        if (action === 'split_cancel') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到此筆暫存記錄。', accessToken);
            continue;
          }
          await cancelSplit({
            lineUserId,
            targetUserId,
            userName,
            pendingTx,
            replyToken,
            accessToken,
            sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
            sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
          });
          continue;
        }

        if (action === 'select_ledger') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到此筆暫存記錄。', accessToken);
            continue;
          }

          const existingLedgers = await getUserExistingLedgers(targetUserId);

          if (existingLedgers.length === 0) {
            await sendLineReplyMessage(
              replyToken,
              `⚠️ 系統中目前僅有預設帳本，若需使用其他個人帳本或共管帳本，請先至前台系統建立喔！`,
              accessToken
            );
            continue;
          }

          const ledgerListText = existingLedgers
            .map((l, idx) => `${idx + 1}. ${l.isShared ? '👥[共管]' : '📘[個人]'} ${l.name}`)
            .join('\n');

          await setUserState(lineUserId, { state: 'WAITING_LEDGER', tempTxId, updatedAt: Date.now() });

          const promptMsg = `📘 請選擇欲歸入的記帳帳本：\n（目前暫存：${pendingTx.title} ${pendingTx.currency} ${pendingTx.amount.toLocaleString()}）\n\n您現有的帳本：\n${ledgerListText}\n\n💬 請直接回傳帳本編號（例如「1」或「${existingLedgers[0].name}」）進行切換。`;
          await sendLineReplyMessage(replyToken, promptMsg, accessToken);
          continue;
        }

        if (action === 'choose_ledger') {
          const targetLedgerId = params.get('ledgerId');
          if (!pendingTx || !targetLedgerId) {
            await sendLineReplyMessage(replyToken, '⚠️ 操作無效或找不到紀錄。', accessToken);
            continue;
          }

          const existingLedgers = await getUserExistingLedgers(targetUserId);
          const chosen = existingLedgers.find((l) => l.id === targetLedgerId);

          if (!chosen) {
            await sendLineReplyMessage(replyToken, '⚠️ 找不到指定的記帳帳本。', accessToken);
            continue;
          }

          pendingTx.ledgerId = chosen.id;
          pendingTx.ledgerName = chosen.name;
          pendingTx.isSharedLedger = chosen.isShared;
          pendingTx.noSharedLedgerWarning = undefined;
          await savePendingTx(pendingTx);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
          await sendLineFlexMessage(
            replyToken,
            flexMsg,
            accessToken,
            `✅ 已切換至記帳帳本「${chosen.name}」！請核對並確認入帳。`
          );
          continue;
        }

        // --- 快捷操作：新增自訂分類並立即套用至卡片 ---
        if (action === 'quick_create_cat') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 暫存紀錄已逾期，請重新發送記帳訊息。', accessToken, pinnedQuickReply);
            continue;
          }
          const catName = (params.get('name') ? decodeURIComponent(params.get('name')!) : '') || userState.newTargetName || '新分類';
          const newCat = await createCategory(targetUserId, {
            name: catName,
            icon: '🏷️',
            type: pendingTx.type || 'expense',
          });
          pendingTx.categoryId = newCat.id;
          pendingTx.categoryName = newCat.name;
          await savePendingTx(pendingTx);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
          await sendLineFlexMessage(
            replyToken,
            flexMsg,
            accessToken,
            `🎉 已成功為您建立分類「${newCat.name}」並更新至記帳卡片！請點擊確認入帳。`
          );
          continue;
        }

        // --- 快捷操作：新增錢包/帳戶並立即套用至卡片 ---
        if (action === 'quick_create_acc') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 暫存紀錄已逾期，請重新發送記帳訊息。', accessToken, pinnedQuickReply);
            continue;
          }
          const accName = (params.get('name') ? decodeURIComponent(params.get('name')!) : '') || userState.newTargetName || '新錢包';
          let assetType: AssetType = 'cash';
          if (/信用卡|刷卡|visa|master/i.test(accName)) assetType = 'credit_card';
          else if (/銀行|郵局|合庫|信貸/i.test(accName)) assetType = 'bank';
          else if (/悠遊|line\s*pay|街口|電支|錢包/i.test(accName)) assetType = 'e_wallet';

          const newAcc = await createAssetAccount(targetUserId, {
            name: accName,
            type: assetType,
            balance: 0,
          });
          pendingTx.accountId = newAcc.id;
          pendingTx.accountName = newAcc.name;
          pendingTx.subAccountId = undefined;
          await savePendingTx(pendingTx);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
          await sendLineFlexMessage(
            replyToken,
            flexMsg,
            accessToken,
            `🎉 已成功為您建立錢包「${newAcc.name}」並更新至記帳卡片！請點擊確認入帳。`
          );
          continue;
        }

        // --- 快捷操作：新增帳本 (個人/共管) 並立即套用至卡片 ---
        if (action === 'quick_create_ledger') {
          if (!pendingTx) {
            await sendLineReplyMessage(replyToken, '⚠️ 暫存紀錄已逾期，請重新發送記帳訊息。', accessToken, pinnedQuickReply);
            continue;
          }
          const ledgerName = (params.get('name') ? decodeURIComponent(params.get('name')!) : '') || userState.newTargetName || '新帳本';
          const isSharedParam = params.get('shared') === '1';

          const newLedger = await createLedger(targetUserId, {
            name: ledgerName,
            currency: (pendingTx.currency as LedgerCurrency) || 'TWD',
            isShared: isSharedParam,
          });
          pendingTx.ledgerId = newLedger.id;
          pendingTx.ledgerName = newLedger.name;
          pendingTx.isSharedLedger = newLedger.isShared;
          pendingTx.noSharedLedgerWarning = undefined;
          await savePendingTx(pendingTx);
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

          const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
          await sendLineFlexMessage(
            replyToken,
            flexMsg,
            accessToken,
            `🎉 已成功為您建立${newLedger.isShared ? '共管' : '個人'}帳本「${newLedger.name}」並更新至記帳卡片！請點擊確認入帳。`
          );
          continue;
        }
      }

      // ==========================================
      // 分支 B: 處理訊息 (Message Event)
      // ==========================================
      if (event.type === 'message') {
        const targetChatId = event.source?.groupId || event.source?.roomId || lineUserId;

        // 分支 B-1: 處理圖片訊息 (發票、收據 OCR 辨識)
        if (event.message?.type === 'image') {
          await handleImageMessage(
            event,
            targetUserId,
            userName,
            lineUserId,
            replyToken,
            accessToken,
            targetChatId,
            pinnedQuickReply,
            config
          );
          continue;
        }

        // 分支 B-2: 處理文字以外的其他訊息類型
        if (event.message?.type !== 'text') {
          await sendLineReplyMessage(
            replyToken,
            '💬 收到您的訊息！目前「資產上羊」支援：\n1️⃣ 一句話文字記帳（例如：「吃燒肉和媽媽分共1千5」、「買冰箱 5萬」）\n2️⃣ 📸 拍照上傳發票與收據自動辨識記帳！\n\n歡迎直接對我打字或傳送發票/收據照片記帳喔！🐑✨',
            accessToken,
            pinnedQuickReply
          );
          continue;
        }

        const userText = event.message.text.trim();

        // --- 0.1 修改上一筆指令 ---
        if (/^(修改上一筆|改上一筆|上筆|編輯上一筆)$/i.test(userText)) {
          await handleEditLastTransaction(targetUserId, userName, lineUserId, replyToken, accessToken, pinnedQuickReply);
          continue;
        }

        // --- 0.2 快速記帳指令 ---
        if (/^(記帳|開始記帳|我要記帳|快速記帳)$/i.test(userText)) {
          const guideMsg = `✏️ 【快速記帳】\n您可以使用以下方式隨時記帳：\n\n1️⃣ 一句話打字或語音記帳：\n• 「買冰箱 5萬」\n• 「吃燒肉和媽媽分共1千5」\n• 「薪資收入 60000」\n• 「超商 120 跟小美平分」\n\n2️⃣ 📸 拍照上傳發票與收據：\n直接傳送電子發票證明聯、紙本發票、店家結帳單或刷卡簽單照片，小羊會自動透過 AI 視覺模型辨識店家、品項、日期與金額！\n\n我會自動解析並生成「確認卡片」供您核對與微調！🐑✨`;
          await sendLineReplyMessage(replyToken, guideMsg, accessToken, pinnedQuickReply);
          continue;
        }

        // --- 0.3 軟體&功能指令 (回傳乾淨專屬 Flex 卡片，含打開軟體、鬧鐘與快速記帳捷徑) ---
        if (/^(軟體[&＆與和]功能|功能|打開軟體|開軟體|開啟軟體|打開記帳軟體|打開|開記帳|進入軟體|進軟體|軟體|app)$/i.test(userText.trim())) {
          const flexMsg = buildOpenAppFlexMessage({
            userName,
            directInAppUrl,
            isRegister: false,
          });
          await sendLineFlexMessage(
            replyToken,
            flexMsg,
            accessToken,
            `📱 【資產上羊】軟體與功能中心 (${userName})`,
            pinnedQuickReply
          );
          continue;
        }

        // --- 0.3.1 註冊與我的帳號查詢 (維持原樣用文字呈現，便於長按複製 ID 貼給管理員協助解決問題) ---
        if (/^(註冊|註冊帳號|開帳號|加入|開始|我的帳號|帳號|登入|登錄|綁定|查詢帳號|身分|身份|id|user\s*id)$/i.test(userText)) {
          const isRegisterCmd = /^(註冊|註冊帳號|開帳號|加入|開始)$/i.test(userText);
          const welcomeTitle = isRegisterCmd
            ? `🎉 【資產上羊】恭喜完成註冊！財務環境已為您就緒！`
            : `🐑【資產上羊】用戶專屬帳號資訊：`;

          const accountText = `${welcomeTitle}\n\n👤 用戶暱稱：${userName}\n🔑 LINE User ID：\n${lineUserId}\n\n💡【溫馨提醒】：\n若您在系統使用上有任何狀況或帳號問題，請長按上方 LINE User ID 複製貼給管理員，我們將立即為您排查與協助解決！\n\n✨ 系統已為您配置：\n• 🔒 1 個日常私帳 (個人私密記帳)\n• 💳 3 個核心錢包帳戶 (現金皮夾、玉山銀行、電子錢包)\n• 👥 獨立虛擬好友名單與自動平帳\n\n📱 隨時打開軟體：\n請點擊下方狀態列【📱 軟體&功能】隨時進入。亦可直接對我輸入「晚餐 150」立即記帳！🐑✨`;

          await sendLineReplyMessage(replyToken, accountText, accessToken, pinnedQuickReply);
          continue;
        }

        // --- 0.4 每日記帳提醒鬧鐘指令 ---
        const cleanAlarmCmd = userText.replace(/^[\s⏰🔔🕒📅🔕]+/, '').trim();
        const isAlarmCommand =
          /^(鬧鐘|提醒|記帳鬧鐘|提醒鬧鐘|鬧鐘設定|設定鬧鐘|提醒設定|開啟鬧鐘|關閉鬧鐘|修改鬧鐘|每日提醒|每日鬧鐘|測試鬧鐘|測試提醒|測試推播|記帳提醒)$/i.test(cleanAlarmCmd) ||
          userText.includes('記帳鬧鐘') ||
          /^鬧鐘\b/i.test(cleanAlarmCmd) ||
          /^提醒\b/i.test(cleanAlarmCmd);

        if (isAlarmCommand) {
          const appUrl = getAppBaseUrl(baseUrl);
          const { buildAlarmQuickReply, buildAlarmTextGuide, sendTestReminderPush } = await import('./reminderService');

          // 測試推播指令
          if (/^(測試鬧鐘|測試提醒|測試推播)/i.test(cleanAlarmCmd) || cleanAlarmCmd.includes('測試')) {
            const reminder = await getUserReminder(targetUserId);
            const pushRes = await sendTestReminderPush(targetUserId, lineUserId);
            // 測試推播發送後，給予預設狀態機 (IDLE 與 pinnedQuickReply)
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
            const feedback = pushRes.success
              ? `🎉 測試提醒推播已發送！請查看本聊天室接收狀況。\n\n若您有看到通知，代表推播通道運作正常！每日 ${reminder.time} 小羊會在此準時提醒您。`
              : `⚠️ 測試推播失敗: ${pushRes.error || '請確認 LINE 官方 Token'}`;
            await sendLineReplyMessage(replyToken, feedback, accessToken, pinnedQuickReply);
            continue;
          }

          if (/^(開啟鬧鐘|打開鬧鐘|啟動鬧鐘|開啟提醒|開啟$)/i.test(cleanAlarmCmd)) {
            const updated = await toggleUserReminder(targetUserId, true);
            const alarmQuickReply = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
            const msg = `🔔 已為您開啟每日記帳提醒鬧鐘！將在每日 ${updated.time} 準時推播提醒。\n\n您可隨時點選下方快捷時段調整時間，或點選「📢 測試推播」進行測試。`;
            await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
            await sendLineDualMessage(replyToken, flexMsg, msg, accessToken, alarmQuickReply, `🔔 已開啟記帳鬧鐘 (${updated.time})`);
            continue;
          }

          if (/^(關閉鬧鐘|關掉鬧鐘|暫停鬧鐘|關閉提醒|關閉$)/i.test(cleanAlarmCmd)) {
            const updated = await toggleUserReminder(targetUserId, false);
            const alarmQuickReply = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
            const msg = `🔕 已為您關閉每日記帳提醒鬧鐘！未來將不再主動發送推播。\n\n若需重新開啟，可隨時點選下方「🔔 開啟鬧鐘」。`;
            await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
            await sendLineDualMessage(replyToken, flexMsg, msg, accessToken, alarmQuickReply, '🔕 已關閉記帳鬧鐘');
            continue;
          }

          // 自然語言設定時間（例如：「設定鬧鐘 20:30」或「鬧鐘 晚上9點」）
          let directParsedTime = '';
          const matchColon = cleanAlarmCmd.match(/(?:([01]?\d|2[0-3]))[:：]([0-5]\d)/);
          if (matchColon) {
            directParsedTime = `${matchColon[1].padStart(2, '0')}:${matchColon[2].padStart(2, '0')}`;
          } else {
            const matchZh = cleanAlarmCmd.match(/(?:晚上|下午|夜間|早上|上午)?\s*(\d{1,2})\s*點\s*(半|30|\d{1,2})?/);
            if (matchZh) {
              let h = parseInt(matchZh[1], 10);
              if (/晚上|下午|夜間/.test(cleanAlarmCmd) && h < 12) h += 12;
              const mStr = matchZh[2] === '半' ? '30' : matchZh[2] ? matchZh[2].padStart(2, '0') : '00';
              directParsedTime = `${String(h).padStart(2, '0')}:${mStr}`;
            }
          }

          if (directParsedTime) {
            const updated = await saveUserReminder(targetUserId, { time: directParsedTime, enabled: true });
            const alarmQuickReply = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
            const msg = `🕒 提醒時間已成功變更為【${directParsedTime}】！每日記帳鬧鐘已啟動。\n\n小羊會在每日 ${directParsedTime} 準時推播提醒您！`;
            await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
            await sendLineDualMessage(replyToken, flexMsg, msg, accessToken, alarmQuickReply, `🕒 記帳鬧鐘已設定為 ${directParsedTime}`);
            continue;
          }

          // 預設進入鬧鐘管理中心：發送 Flex 卡片與清晰引導，並開啟 WAITING_ALARM_INPUT 狀態
          const reminder = await getUserReminder(targetUserId);
          const flexMsg = buildAlarmFlexMessage(reminder, userName, appUrl);
          const textGuide = buildAlarmTextGuide(reminder, userName, appUrl);
          const alarmQuickReply = buildAlarmQuickReply(reminder, targetUserId, lineUserId);

          await setUserState(lineUserId, { state: 'WAITING_ALARM_INPUT', updatedAt: Date.now() });
          await sendLineDualMessage(
            replyToken,
            flexMsg,
            textGuide,
            accessToken,
            alarmQuickReply,
            `⏰ 記帳鬧鐘管理中心：每日 ${reminder.time} (${reminder.enabled ? '運作中' : '已關閉'})`
          );
          continue;
        }

        const userState = await getUserState(lineUserId);

        // --- 🛡️ 處理未確認草稿抉擇文字輸入 (完成上一筆 vs 放棄上一筆) ---
        if (userState.state === 'WAITING_DRAFT_RESOLUTION') {
          const { getPendingTx, getPendingBatch, removePendingBatch } = await import('./lineStateManager');
          const { commitSingleDraft, discardSingleDraft, checkAndCleanUserDraft } = await import('./draftManagerService');
          const { buildDraftResolutionFlexMessage, buildDraftResolutionQuickReply, buildDraftResolutionTextMessage } = await import('./draftFlexTemplates');
          const { commitBatchTransactions, buildBatchSummaryFlexMessage } = await import('./batchTransactionService');

          const cleanText = userText.trim();
          const pid = userState.tempTxId || userState.tempBatchId || '';
          const ptype = userState.tempBatchId ? 'batch' : 'single';

          // 1. 選擇完成上一筆
          if (
            /^(完成上一筆|完成|入帳|存上一筆|全入|全數入帳|是|好|確定|ok|yes|1|y|✅\s*完成上一筆)$/i.test(cleanText) ||
            /完成上一筆|確認入帳/i.test(cleanText)
          ) {
            let resolutionFeedback = '';
            if (ptype === 'single') {
              const res = await commitSingleDraft(pid, targetUserId, lineUserId);
              resolutionFeedback = res.success ? `🎉 上一筆草稿已入帳！\n` : `⚠️ 上一筆入帳未完全：${res.message}\n`;
            } else {
              const res = await commitBatchTransactions(pid, targetUserId);
              resolutionFeedback = res.success ? `🎉 上一筆批量記帳 (${res.insertedCount} 筆) 已全數入帳！\n` : `⚠️ 批量入帳失敗\n`;
            }

            const nextText = userState.incomingNewText;
            const nextImgId = userState.incomingImageMsgId;
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

            if (nextText) {
              await sendLinePushMessage(targetChatId, `${resolutionFeedback}👉 正在為您繼續處理剛才輸入的：「${nextText}」...`, accessToken);
              const { executeAccountingText } = await import('./lineAccountingExecutor');
              await executeAccountingText({
                userText: nextText,
                targetUserId,
                userName,
                lineUserId,
                replyToken,
                accessToken,
                targetChatId,
                pinnedQuickReply,
                config,
                baseUrl,
                userState: { state: 'IDLE', updatedAt: Date.now() },
                buildUserAppContext,
                resolveLedgerAndSplit,
                sendLinePushMessage,
                sendLineLoadingAnimation,
                sendLineReplyMessage,
                sendLineFlexMessage,
                sendLineDualMessage,
              });
              continue;
            } else if (nextImgId) {
              await sendLinePushMessage(targetChatId, `${resolutionFeedback}👉 正在為您辨識剛才傳送的發票收據照片...`, accessToken);
              await handleImageMessage(event, targetUserId, userName, lineUserId, replyToken, accessToken, targetChatId, pinnedQuickReply, config, nextImgId);
              continue;
            } else {
              await sendLineReplyMessage(replyToken, `${resolutionFeedback}隨時可輸入文字或傳送發票照片開始記帳！🐑✨`, accessToken, pinnedQuickReply);
              continue;
            }
          }

          // 2. 選擇放棄上一筆 (支援各種放棄指令，包含「❌ 放棄此筆」、「放棄此筆」、「不要」等)
          if (
            /^(放棄上一筆|放棄|捨棄|不要上一筆|刪除上一筆|改記這筆|不要|算了|取消|退出|no|2|n|❌\s*放棄此筆|放棄此筆|❌\s*放棄|捨棄此筆|刪除此筆)$/i.test(cleanText) ||
            /放棄上一筆|放棄此筆|捨棄此筆|刪除此筆/i.test(cleanText)
          ) {
            if (ptype === 'single') {
              await discardSingleDraft(pid, lineUserId);
            } else {
              await removePendingBatch(pid);
            }
            const resolutionFeedback = `🗑️ 已為您捨棄上一筆未確認草稿。\n`;

            const nextText = userState.incomingNewText;
            const nextImgId = userState.incomingImageMsgId;
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

            if (nextText) {
              await sendLinePushMessage(targetChatId, `${resolutionFeedback}👉 正在為您繼續處理剛才輸入的：「${nextText}」...`, accessToken);
              const { executeAccountingText } = await import('./lineAccountingExecutor');
              await executeAccountingText({
                userText: nextText,
                targetUserId,
                userName,
                lineUserId,
                replyToken,
                accessToken,
                targetChatId,
                pinnedQuickReply,
                config,
                baseUrl,
                userState: { state: 'IDLE', updatedAt: Date.now() },
                buildUserAppContext,
                resolveLedgerAndSplit,
                sendLinePushMessage,
                sendLineLoadingAnimation,
                sendLineReplyMessage,
                sendLineFlexMessage,
                sendLineDualMessage,
              });
              continue;
            } else if (nextImgId) {
              await sendLinePushMessage(targetChatId, `${resolutionFeedback}👉 正在為您辨識剛才傳送的發票收據照片...`, accessToken);
              await handleImageMessage(event, targetUserId, userName, lineUserId, replyToken, accessToken, targetChatId, pinnedQuickReply, config, nextImgId);
              continue;
            } else {
              await sendLineReplyMessage(replyToken, `${resolutionFeedback}隨時可輸入文字或傳送發票照片開始記帳！🐑✨`, accessToken, pinnedQuickReply);
              continue;
            }
          }

          // 3. 檢視上一筆
          if (
            /^(檢視上一筆|看上一筆|上一筆|查看|明細|3|👀\s*檢視上一筆|檢視|查看上一筆)$/i.test(cleanText) ||
            /檢視上一筆|看上一筆/i.test(cleanText)
          ) {
            if (ptype === 'single') {
              const prevTx = await getPendingTx(pid);
              if (prevTx) {
                const flexMsg = buildGoldenLayoutFlexMessage(prevTx);
                await sendLineFlexMessage(replyToken, flexMsg, accessToken, `【上一筆草稿】${prevTx.title} NT$ ${prevTx.amount.toLocaleString()} 元`, pinnedQuickReply, targetChatId);
                continue;
              }
            } else {
              const batch = await getPendingBatch(pid);
              if (batch) {
                const appUrl = getAppBaseUrl(baseUrl);
                const flexMsg = buildBatchSummaryFlexMessage(batch, appUrl);
                await sendLineDualMessage(replyToken, flexMsg, `📦 批量草稿：共 ${batch.validCount} 筆`, accessToken, pinnedQuickReply);
                continue;
              }
            }
            await sendLineReplyMessage(replyToken, '⚠️ 該草稿已不存在或已逾期。', accessToken, pinnedQuickReply);
            continue;
          }

          // 4. 若輸入非抉擇指令，更新本次新輸入內容並再次發送二擇一提示卡片
          const draftCheck = await checkAndCleanUserDraft(targetUserId, lineUserId);
          if (draftCheck.hasActiveDraft) {
            await setUserState(lineUserId, {
              state: 'WAITING_DRAFT_RESOLUTION',
              tempTxId: draftCheck.draftType === 'single' ? draftCheck.draftId : undefined,
              tempBatchId: draftCheck.draftType === 'batch' ? draftCheck.draftId : undefined,
              incomingNewText: userText,
              updatedAt: Date.now(),
            });
            const resolutionFlex = buildDraftResolutionFlexMessage(draftCheck, userText, 'tx_' + Date.now());
            const resolutionQR = buildDraftResolutionQuickReply(draftCheck, 'tx_' + Date.now());
            const resolutionText = buildDraftResolutionTextMessage(draftCheck, userText);
            await sendLineFlexMessage(
              replyToken,
              resolutionFlex,
              accessToken,
              resolutionText,
              resolutionQR,
              targetChatId
            );
            continue;
          } else {
            // 草稿已逾期 (放太久 > 30分鐘) 或已被清理，自動退出 WAITING_DRAFT_RESOLUTION，直接執行本次輸入記帳！
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
            const { executeAccountingText } = await import('./lineAccountingExecutor');
            await executeAccountingText({
              userText,
              targetUserId,
              userName,
              lineUserId,
              replyToken,
              accessToken,
              targetChatId,
              pinnedQuickReply,
              config,
              baseUrl,
              userState: { state: 'IDLE', updatedAt: Date.now() },
              buildUserAppContext,
              resolveLedgerAndSplit,
              sendLinePushMessage,
              sendLineLoadingAnimation,
              sendLineReplyMessage,
              sendLineFlexMessage,
              sendLineDualMessage,
            });
            continue;
          }
        }

        // 處理記帳鬧鐘之互動輸入狀態機 (WAITING_ALARM_INPUT, WAITING_ALARM_TIME, WAITING_ALARM_FREQ)
        if (
          userState.state === 'WAITING_ALARM_INPUT' ||
          userState.state === 'WAITING_ALARM_TIME' ||
          userState.state === 'WAITING_ALARM_FREQ'
        ) {
          const appUrl = getAppBaseUrl(baseUrl);
          const { buildAlarmQuickReply, sendTestReminderPush } = await import('./reminderService');

          // 若用戶輸入開啟/關閉
          if (/^(開啟|打開|啟動|on)$/i.test(userText) || userText.includes('開啟鬧鐘')) {
            const updated = await toggleUserReminder(targetUserId, true);
            const qr = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            await sendLineReplyMessage(replyToken, `🔔 已成功開啟每日記帳提醒鬧鐘！將在每日 ${updated.time} 準時推播提醒。`, accessToken, qr);
            continue;
          }
          if (/^(關閉|關掉|暫停|off)$/i.test(userText) || userText.includes('關閉鬧鐘')) {
            const updated = await toggleUserReminder(targetUserId, false);
            const qr = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            await sendLineReplyMessage(replyToken, `🔕 已成功關閉每日記帳提醒鬧鐘，未來將不再主動發送推播。`, accessToken, qr);
            continue;
          }

          // 測試推播
          if (/^(測試|測試推播|測試鬧鐘|推播)$/i.test(userText) || userText.includes('測試')) {
            const reminder = await getUserReminder(targetUserId);
            const pushRes = await sendTestReminderPush(targetUserId, lineUserId);
            // 測試推播發送後，給予預設狀態機 (IDLE 與 pinnedQuickReply)
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
            const feedback = pushRes.success
              ? `🎉 測試推播已發送至本聊天室！每日 ${reminder.time} 會準時發送通知。`
              : `⚠️ 測試推播失敗: ${pushRes.error}`;
            await sendLineReplyMessage(replyToken, feedback, accessToken, pinnedQuickReply);
            continue;
          }

          // 檢查是否為時間格式
          let parsedHHMM = '';
          const matchColon = userText.match(/(?:([01]?\d|2[0-3]))[:：]([0-5]\d)/);
          if (matchColon) {
            parsedHHMM = `${matchColon[1].padStart(2, '0')}:${matchColon[2].padStart(2, '0')}`;
          } else {
            const matchZh = userText.match(/(?:晚上|下午|夜間|早上|上午)?\s*(\d{1,2})\s*點\s*(半|30|\d{1,2})?/);
            if (matchZh) {
              let h = parseInt(matchZh[1], 10);
              if (/晚上|下午|夜間/.test(userText) && h < 12) h += 12;
              const mStr = matchZh[2] === '半' ? '30' : matchZh[2] ? matchZh[2].padStart(2, '0') : '00';
              parsedHHMM = `${String(h).padStart(2, '0')}:${mStr}`;
            } else {
              const matchDigits = userText.match(/^([01]?\d|2[0-3])([0-5]\d)$/);
              if (matchDigits) {
                parsedHHMM = `${matchDigits[1].padStart(2, '0')}:${matchDigits[2]}`;
              }
            }
          }

          if (parsedHHMM) {
            const updated = await saveUserReminder(targetUserId, { time: parsedHHMM, enabled: true });
            const qr = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            const flexMsg = buildAlarmFlexMessage(updated, userName, appUrl);
            await sendLineDualMessage(
              replyToken,
              flexMsg,
              `🕒 提醒時間已成功變更為【${parsedHHMM}】！鬧鐘已啟動。\n\n小羊會在每日 ${parsedHHMM} 準時向您推播提醒。點選「✏️ 開始記帳」可回到主選單。`,
              accessToken,
              qr,
              `🕒 記帳鬧鐘已更新為 ${parsedHHMM}`
            );
            continue;
          }

          // 檢查頻率
          if (/每天|每日|全週/i.test(userText)) {
            const updated = await saveUserReminder(targetUserId, { frequency: 'daily', enabled: true });
            const qr = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            await sendLineReplyMessage(replyToken, `📅 重複頻率已設定為【每天】！點選「✏️ 開始記帳」可回到主選單。`, accessToken, qr);
            continue;
          }
          if (/工作日|平日/i.test(userText)) {
            const updated = await saveUserReminder(targetUserId, { frequency: 'weekdays', enabled: true });
            const qr = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            await sendLineReplyMessage(replyToken, `📅 重複頻率已設定為【平日工作日】！點選「✏️ 開始記帳」可回到主選單。`, accessToken, qr);
            continue;
          }
          if (/週末|假期|六日/i.test(userText)) {
            const updated = await saveUserReminder(targetUserId, { frequency: 'weekends', enabled: true });
            const qr = buildAlarmQuickReply(updated, targetUserId, lineUserId);
            await sendLineReplyMessage(replyToken, `📅 重複頻率已設定為【週末假期】！點選「✏️ 開始記帳」可回到主選單。`, accessToken, qr);
            continue;
          }

          // 若用戶傳送「開始記帳」或「記帳」或「離開」或「結束」或「取消」或「返回」或「完成」
          if (/^(開始記帳|記帳|離開|結束|取消|返回|完成)$/i.test(userText)) {
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
            await sendLineReplyMessage(replyToken, '🐑 已退出記帳鬧鐘設定，回到主選單！隨時在此輸入文字即可記帳（例如：「午餐 120」）。', accessToken, pinnedQuickReply);
            continue;
          }

          // 若為一般記帳語意（例如「午餐 120」），自動解除鬧鐘等待狀態，進入記帳流程，絕不卡死使用者！
          await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
        }

        // --- 狀態機子流程：批量記帳確認與聊天室微調 ---
        if (userState.state === 'WAITING_BATCH_CONFIRM' && userState.tempBatchId) {
          const { getPendingBatch, savePendingBatch, removePendingBatch } = await import('./lineStateManager');
          const { commitBatchTransactions, buildBatchListTextMessage } = await import('./batchTransactionService');
          const batch = await getPendingBatch(userState.tempBatchId);

          if (!batch) {
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          } else {
            // 1. 確認全數入帳
            if (/^(全部入帳|確認入帳|入帳|確認|全入|ok|yes|好|確定|儲存|全數入帳)$/i.test(userText.trim())) {
              const res = await commitBatchTransactions(batch.id, targetUserId);
              await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
              if (res.success) {
                const successMsg = `🎉【批量記帳全數入帳成功！】\n\n✅ 成功匯入：${res.insertedCount} 筆交易\n💸 總支出：NT$ ${res.totalExpense.toLocaleString()} 元\n💰 總收入：NT$ ${res.totalIncome.toLocaleString()} 元\n\n已全數原子寫入資料庫，資產錢包餘額已同步即時扣抵！隨時輸入文字即可繼續記帳～🐑✨`;
                await sendLineReplyMessage(replyToken, successMsg, accessToken, pinnedQuickReply);
              } else {
                await sendLineReplyMessage(replyToken, `⚠️ 批量入帳失敗：${res.error}`, accessToken, pinnedQuickReply);
              }
              continue;
            }

            // 2. 取消/放棄
            if (/^(取消|放棄|不要|算了|離開|退出)$/i.test(userText.trim())) {
              await removePendingBatch(batch.id);
              await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
              await sendLineReplyMessage(replyToken, '🗑️ 已取消本次批量記帳，暫存紀錄已全數清除。隨時可再次輸入文字記帳！🐑✨', accessToken, pinnedQuickReply);
              continue;
            }

            // 3. 查看清單 / 明細 / 下一頁 / 上一頁
            if (/^(查看|清單|明細|看明細|逐筆|下一頁|上一頁|列表)$/i.test(userText.trim())) {
              const validItems = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
              const totalPages = Math.ceil(validItems.length / 15) || 1;
              const page = /下一頁/.test(userText) ? 2 : 1;
              const textList = buildBatchListTextMessage(batch, page);
              const { buildBatchQuickReply } = await import('./batchTransactionService');
              const appUrl = getAppBaseUrl(baseUrl);
              const batchQR = buildBatchQuickReply(batch.id, validItems.length, appUrl, page, totalPages);
              await setUserState(lineUserId, { state: 'WAITING_BATCH_CONFIRM', tempBatchId: batch.id, updatedAt: Date.now() });
              await sendLineReplyMessage(replyToken, textList, accessToken, batchQR);
              continue;
            }

            // 4. 刪除單筆：例如「刪除 5」或「刪掉第5筆」或「5刪除」
            const delMatch = userText.match(/(?:刪除|刪掉|移除|不要)?\s*(?:第)?\s*(\d{1,3})\s*(?:筆)?\s*(?:刪除|刪掉|移除|不要)?/);
            if (delMatch && /(?:刪除|刪掉|移除|不要)/.test(userText)) {
              const itemIdx = parseInt(delMatch[1], 10);
              const validItems = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
              if (itemIdx >= 1 && itemIdx <= validItems.length) {
                const targetItem = validItems[itemIdx - 1];
                targetItem.isIgnored = true;
                const remaining = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
                batch.totalExpense = remaining.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
                batch.totalIncome = remaining.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0);
                batch.validCount = remaining.length;
                await savePendingBatch(batch);

                const reply = `🗑️ 已為您排除第 #${itemIdx} 筆【${targetItem.title}】！\n目前剩餘 ${batch.validCount} 筆交易（總支出 NT$ ${batch.totalExpense.toLocaleString()} 元）。\n\n確認無誤請回傳「全部入帳」，或點擊按鈕進行儲存。`;
                const { buildBatchQuickReply } = await import('./batchTransactionService');
                const appUrl = getAppBaseUrl(baseUrl);
                const batchQR = buildBatchQuickReply(batch.id, batch.validCount, appUrl, 1, Math.ceil(batch.validCount / 15) || 1);
                await setUserState(lineUserId, { state: 'WAITING_BATCH_CONFIRM', tempBatchId: batch.id, updatedAt: Date.now() });
                await sendLineReplyMessage(replyToken, reply, accessToken, batchQR);
                continue;
              }
            }

            // 5. 修改單筆：例如「改 3 晚餐 180」或「第3筆改180」或「3 改 180」
            const editMatch = userText.match(/(?:改|修改)?\s*(?:第)?\s*(\d{1,3})\s*(?:筆)?\s*(?:改|修改|為)?\s*([^\d\s]+)?\s*(\d+)/);
            if (editMatch && /(?:改|修改)/.test(userText)) {
              const itemIdx = parseInt(editMatch[1], 10);
              const newTitle = editMatch[2]?.trim();
              const newAmt = parseInt(editMatch[3], 10);
              const validItems = batch.items.filter((i) => !i.isIgnored && i.amount > 0);

              if (itemIdx >= 1 && itemIdx <= validItems.length) {
                const targetItem = validItems[itemIdx - 1];
                if (newTitle) targetItem.title = newTitle;
                if (!isNaN(newAmt) && newAmt > 0) targetItem.amount = newAmt;

                const remaining = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
                batch.totalExpense = remaining.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
                batch.totalIncome = remaining.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0);
                await savePendingBatch(batch);

                const reply = `✏️ 已成功更新第 #${itemIdx} 筆為：【${targetItem.title}】NT$ ${targetItem.amount.toLocaleString()} 元！\n目前最新總支出為 NT$ ${batch.totalExpense.toLocaleString()} 元。\n\n確認無誤請回傳「全部入帳」即可儲存！`;
                const { buildBatchQuickReply } = await import('./batchTransactionService');
                const appUrl = getAppBaseUrl(baseUrl);
                const batchQR = buildBatchQuickReply(batch.id, batch.validCount, appUrl, 1, Math.ceil(batch.validCount / 15) || 1);
                await setUserState(lineUserId, { state: 'WAITING_BATCH_CONFIRM', tempBatchId: batch.id, updatedAt: Date.now() });
                await sendLineReplyMessage(replyToken, reply, accessToken, batchQR);
                continue;
              }
            }
          }
        }

        // --- 狀態機子流程：修改中處理 ---
        if (userState.state !== 'IDLE' && userState.tempTxId) {
          const pendingTx = await getPendingTx(userState.tempTxId);

          if (!pendingTx) {
            await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });
          } else {
            // 處理快速新增分類之文字確認 (回傳「是」、「好」、「新增」或「取消」)
            if (userState.state === 'CONFIRM_CREATE_CATEGORY') {
              if (/^(是|好|新增|要|確認|ok|yes|好啊|好的|確定)$/i.test(userText)) {
                const catName = userState.newTargetName || '新分類';
                const newCat = await createCategory(targetUserId, {
                  name: catName,
                  icon: '🏷️',
                  type: pendingTx.type || 'expense',
                });
                pendingTx.categoryId = newCat.id;
                pendingTx.categoryName = newCat.name;
                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `🎉 已成功為您建立分類「${newCat.name}」並更新至記帳卡片！請點擊確認入帳。`
                );
                continue;
              } else if (/^(否|不要|不用|取消|重新|算了|no)$/i.test(userText)) {
                await setUserState(lineUserId, { state: 'WAITING_CATEGORY', tempTxId: userState.tempTxId, updatedAt: Date.now() });
                const userCats = await getUserCategories(targetUserId);
                const catListText = userCats.map((c, i) => `${i + 1}. ${c.name}`).join('、');
                await sendLineReplyMessage(replyToken, `🏷️ 已取消新增。請從現有分類中輸入（例如：${catListText.substring(0, 80)}...）：`, accessToken);
                continue;
              }
            }

            // 處理快速新增錢包之文字確認 (回傳「是」、「好」、「新增」或「取消」)
            if (userState.state === 'CONFIRM_CREATE_ACCOUNT') {
              if (/^(是|好|新增|要|確認|ok|yes|好啊|好的|確定)$/i.test(userText)) {
                const accName = userState.newTargetName || '新錢包';
                let assetType: AssetType = 'cash';
                if (/信用卡|刷卡|visa|master/i.test(accName)) assetType = 'credit_card';
                else if (/銀行|郵局|合庫|信貸/i.test(accName)) assetType = 'bank';
                else if (/悠遊|line\s*pay|街口|電支|錢包/i.test(accName)) assetType = 'e_wallet';

                const newAcc = await createAssetAccount(targetUserId, {
                  name: accName,
                  type: assetType,
                  balance: 0,
                });
                pendingTx.accountId = newAcc.id;
                pendingTx.accountName = newAcc.name;
                pendingTx.subAccountId = undefined;
                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `🎉 已成功為您建立錢包「${newAcc.name}」並更新至記帳卡片！請點擊確認入帳。`
                );
                continue;
              } else if (/^(否|不要|不用|取消|重新|算了|no)$/i.test(userText)) {
                await setUserState(lineUserId, { state: 'WAITING_ACCOUNT', tempTxId: userState.tempTxId, updatedAt: Date.now() });
                await sendLineReplyMessage(replyToken, `💳 已取消新增。請輸入現有錢包名稱或編號：`, accessToken);
                continue;
              }
            }

            // 處理快速新增帳本之文字確認 (回傳「是」、「好」、「新增」或「取消」)
            if (userState.state === 'CONFIRM_CREATE_LEDGER') {
              if (/^(是|好|新增|要|確認|ok|yes|好啊|好的|確定)$/i.test(userText)) {
                const ledgerName = userState.newTargetName || '新帳本';
                const newLedger = await createLedger(targetUserId, {
                  name: ledgerName,
                  currency: (pendingTx.currency as LedgerCurrency) || 'TWD',
                  isShared: false,
                });
                pendingTx.ledgerId = newLedger.id;
                pendingTx.ledgerName = newLedger.name;
                pendingTx.isSharedLedger = false;
                pendingTx.noSharedLedgerWarning = undefined;
                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `🎉 已成功為您建立個人帳本「${newLedger.name}」並更新至記帳卡片！請點擊確認入帳。`
                );
                continue;
              } else if (/^(否|不要|不用|取消|重新|算了|no)$/i.test(userText)) {
                await setUserState(lineUserId, { state: 'WAITING_LEDGER', tempTxId: userState.tempTxId, updatedAt: Date.now() });
                await sendLineReplyMessage(replyToken, `📘 已取消新增。請輸入現有帳本名稱或編號：`, accessToken);
                continue;
              }
            }

            if (userState.state === 'WAITING_AMOUNT') {
              const parsed = parseChineseFinancialText(userText);
              const isTour = pendingTx.isTour || userState.isTourActive;

              if (parsed.amount > 0 || isTour) {
                pendingTx.amount = parsed.amount > 0 ? parsed.amount : 599;
                if (parsed.currency && parsed.currency !== 'TWD') {
                  pendingTx.currency = parsed.currency;
                }

                if (pendingTx.splitDetails && pendingTx.splitDetails.length > 0) {
                  const count = pendingTx.splitDetails.length;
                  const newPerPerson = Math.round((pendingTx.amount / count) * 100) / 100;
                  pendingTx.splitDetails = pendingTx.splitDetails.map((s) => ({
                    ...s,
                    amount: newPerPerson,
                  }));
                  pendingTx.splitNote = `${count}人均分 (每人 ${pendingTx.currency} ${newPerPerson.toLocaleString()} 元) - ${pendingTx.splitDetails.map((s) => s.memberName).join('、')}`;
                }

                if (isTour) {
                  pendingTx.isTour = true;
                  await savePendingTx(pendingTx);
                  await setUserState(lineUserId, {
                    state: 'IDLE',
                    tempTxId: userState.tempTxId,
                    isTourActive: true,
                    tourStep: 5,
                    updatedAt: Date.now(),
                  });

                  const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                  const tourGuideText = `✅ 金額已成功變更為 599 元！\n\n👉【新手導覽・最後確認】：\n請點擊上方卡片上的【✅ 確認記帳】按鈕，將這筆款項正式寫入帳本！`;
                  const tourQuickReply = {
                    items: [
                      {
                        type: 'action',
                        action: {
                          type: 'postback',
                          label: '✅ 確認記帳',
                          data: `action=confirm&id=${pendingTx.tempTxId}`,
                          displayText: '確認記帳',
                        },
                      },
                    ],
                  };

                  await sendLineFlexMessage(replyToken, flexMsg, accessToken, `金額已更新為 599 元`, tourQuickReply);
                  await sendLinePushMessage(targetChatId, tourGuideText, accessToken, tourQuickReply);
                  continue;
                }

                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `✅ 已更新金額為 ${pendingTx.currency} ${pendingTx.amount.toLocaleString()}！請點擊上方按鈕確認入帳。`
                );
                continue;
              } else {
                await sendLineReplyMessage(
                  replyToken,
                  `⚠️ 未能辨識出有效金額，請重新輸入數字（例如：50000 或 5萬）：`,
                  accessToken
                );
                continue;
              }
            }

            if (userState.state === 'WAITING_CATEGORY') {
              const userCats = await getUserCategories(targetUserId);
              const matchedCat = userCats.find(
                (c) =>
                  (pendingTx.type ? c.type === pendingTx.type : true) &&
                  (c.name.toLowerCase() === userText.toLowerCase() ||
                    c.name.includes(userText) ||
                    userText.includes(c.name))
              );

              if (matchedCat) {
                pendingTx.categoryName = matchedCat.name;
                pendingTx.categoryId = matchedCat.id;
                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `✅ 已更新分類為「${matchedCat.name}」！請點擊確認按鈕。`
                );
                continue;
              } else {
                // 不存在之分類：詢問使用者是否要快速新增該項目
                await setUserState(lineUserId, {
                  state: 'CONFIRM_CREATE_CATEGORY',
                  tempTxId: userState.tempTxId,
                  newTargetName: userText,
                  updatedAt: Date.now(),
                });

                const quickReplyPrompt = {
                  items: [
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: `➕ 新增「${userText.substring(0, 8)}」`,
                        data: `action=quick_create_cat&id=${pendingTx.tempTxId}&name=${encodeURIComponent(userText)}`,
                        displayText: `快速新增分類：${userText}`,
                      },
                    },
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: '🔄 選擇現有分類',
                        data: `action=edit_category&id=${pendingTx.tempTxId}`,
                        displayText: '選擇現有分類',
                      },
                    },
                  ],
                };

                const promptText = `💡 系統中目前尚無「${userText}」這個分類。\n\n請問是否要為您快速新增「${userText}」並直接套用至這筆記帳？\n（您可以點擊下方【➕ 新增】或直接回傳「是」）`;
                await sendLineReplyMessage(replyToken, promptText, accessToken, quickReplyPrompt);
                continue;
              }
            }

            if (userState.state === 'WAITING_ACCOUNT') {
              const userAssetAccounts = await getUserAssetAccounts(targetUserId);
              const isTour = pendingTx.isTour || userState.isTourActive;

              const index = parseInt(userText, 10);
              let matchedAcc = !isNaN(index) && index >= 1 && index <= userAssetAccounts.length
                ? userAssetAccounts[index - 1]
                : userAssetAccounts.find((a) => a.name.toLowerCase().includes(userText.toLowerCase()) || userText.toLowerCase().includes(a.name.toLowerCase()));

              if (!matchedAcc && /信用卡|刷卡/i.test(userText)) {
                matchedAcc = userAssetAccounts.find((a) => a.type === 'credit_card' || a.name.includes('信用卡'));
              } else if (!matchedAcc && /現金|皮夾/i.test(userText)) {
                matchedAcc = userAssetAccounts.find((a) => a.type === 'cash' || a.name.includes('現金'));
              } else if (!matchedAcc && /電子|錢包|line\s*pay|街口/i.test(userText)) {
                matchedAcc = userAssetAccounts.find((a) => a.type === 'e_wallet' || a.name.includes('電子') || a.name.includes('錢包'));
              }

              if (matchedAcc || isTour) {
                if (isTour && !matchedAcc) {
                  pendingTx.accountName = '信用卡';
                } else if (matchedAcc) {
                  pendingTx.accountId = matchedAcc.id;
                  const sub = matchedAcc.subAccounts && matchedAcc.subAccounts.length > 0 ? matchedAcc.subAccounts[0] : null;
                  pendingTx.subAccountId = sub ? sub.id : undefined;
                  pendingTx.accountName = `${matchedAcc.name}${sub ? ` · ${sub.name}` : ''}`;
                }

                if (isTour) {
                  pendingTx.isTour = true;
                  pendingTx.accountName = '信用卡';
                  await savePendingTx(pendingTx);
                  await setUserState(lineUserId, {
                    state: 'IDLE',
                    tempTxId: userState.tempTxId,
                    isTourActive: true,
                    tourStep: 4,
                    updatedAt: Date.now(),
                  });

                  const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                  const tourGuideText = `🎉 扣款錢包已成功變更為【信用卡】！\n\n👉【新手導覽・步驟 4/4】：\n請點擊上方卡片上的【💰 改金額】按鈕，並輸入「599」！`;
                  const tourQuickReply = {
                    items: [
                      {
                        type: 'action',
                        action: {
                          type: 'postback',
                          label: '💰 改金額',
                          data: `action=edit_amount&id=${pendingTx.tempTxId}`,
                          displayText: '修改金額',
                        },
                      },
                      {
                        type: 'action',
                        action: { type: 'message', label: '599', text: '599' },
                      },
                    ],
                  };

                  await sendLineFlexMessage(replyToken, flexMsg, accessToken, `已更新扣款錢包為信用卡`, tourQuickReply);
                  await sendLinePushMessage(targetChatId, tourGuideText, accessToken, tourQuickReply);
                  continue;
                }

                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `✅ 已更新扣款錢包為「${pendingTx.accountName}」！請點擊確認按鈕。`
                );
                continue;
              } else {
                // 不存在之錢包/帳戶：詢問使用者是否要快速新增
                await setUserState(lineUserId, {
                  state: 'CONFIRM_CREATE_ACCOUNT',
                  tempTxId: userState.tempTxId,
                  newTargetName: userText,
                  updatedAt: Date.now(),
                });

                const quickReplyPrompt = {
                  items: [
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: `➕ 新增「${userText.substring(0, 8)}」`,
                        data: `action=quick_create_acc&id=${pendingTx.tempTxId}&name=${encodeURIComponent(userText)}`,
                        displayText: `快速新增錢包：${userText}`,
                      },
                    },
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: '🔄 選擇現有錢包',
                        data: `action=edit_account&id=${pendingTx.tempTxId}`,
                        displayText: '選擇現有錢包',
                      },
                    },
                  ],
                };

                const promptText = `💡 系統中目前尚無「${userText}」這個錢包/帳戶。\n\n請問是否要為您快速新增「${userText}」並直接套用為扣款管道？\n（您可以點擊下方【➕ 新增】或直接回傳「是」）`;
                await sendLineReplyMessage(replyToken, promptText, accessToken, quickReplyPrompt);
                continue;
              }
            }

            if (userState.state === 'WAITING_SPLIT_LEDGER') {
              if (/取消分帳|不用分|不分|個人|取消/i.test(userText)) {
                await cancelSplit({
                  lineUserId,
                  targetUserId,
                  userName,
                  pendingTx,
                  replyToken,
                  accessToken,
                  sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
                  sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
                });
                continue;
              }

              const existingLedgers = await getUserExistingLedgers(targetUserId);
              const sharedLedgers = existingLedgers.filter((l) => l.isShared);

              let chosen: Ledger | undefined = undefined;
              const numInput = parseInt(userText, 10);
              if (!isNaN(numInput) && numInput >= 1 && numInput <= sharedLedgers.length) {
                chosen = sharedLedgers[numInput - 1];
              } else {
                chosen = sharedLedgers.find(
                  (l) =>
                    l.name.toLowerCase().includes(userText.toLowerCase()) ||
                    userText.toLowerCase().includes(l.name.toLowerCase())
                );
              }

              if (chosen) {
                await promptSplitMembersForLedger(
                  {
                    lineUserId,
                    targetUserId,
                    userName,
                    pendingTx,
                    replyToken,
                    accessToken,
                    sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
                    sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
                  },
                  chosen
                );
                continue;
              } else {
                await sendLineReplyMessage(
                  replyToken,
                  `⚠️ 找不到符合「${userText}」的共管帳本。\n\n請輸入上方清單中的帳本編號（例如「1」）或直接點選按鈕；若想取消分帳請回傳「取消」。`,
                  accessToken
                );
                continue;
              }
            }

            if (userState.state === 'WAITING_SPLIT_MEMBERS') {
              if (/取消分帳|不用分|不分|個人|取消/i.test(userText)) {
                await cancelSplit({
                  lineUserId,
                  targetUserId,
                  userName,
                  pendingTx,
                  replyToken,
                  accessToken,
                  sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
                  sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
                });
                continue;
              }

              const existingLedgers = await getUserExistingLedgers(targetUserId);
              const targetLid = userState.targetLedgerId || pendingTx.ledgerId;
              const chosenLedger =
                existingLedgers.find((l) => l.id === targetLid) ||
                existingLedgers.find((l) => l.isShared) ||
                existingLedgers[0];

              await executeSplitWithMembers(
                {
                  lineUserId,
                  targetUserId,
                  userName,
                  pendingTx,
                  replyToken,
                  accessToken,
                  sendReply: (text, qr) => sendLineReplyMessage(replyToken, text, accessToken, qr),
                  sendFlex: (flex, fb, qr) => sendLineFlexMessage(replyToken, flex, accessToken, fb, qr),
                },
                chosenLedger,
                userText
              );
              continue;
            }

            if (userState.state === 'WAITING_SPLIT') {
              if (/取消分帳|不用分|不分|個人/i.test(userText)) {
                const { ledgerId, ledgerName } = await resolveLedgerAndSplit(
                  targetUserId,
                  userName,
                  pendingTx.amount,
                  pendingTx.currency,
                  false,
                  []
                );
                pendingTx.isSharedLedger = false;
                pendingTx.ledgerId = ledgerId;
                pendingTx.ledgerName = ledgerName;
                pendingTx.splitDetails = undefined;
                pendingTx.splitNames = [];
                pendingTx.splitNote = undefined;
                pendingTx.noSharedLedgerWarning = undefined;
              } else {
                const parsedSplit = parseChineseFinancialText(userText);
                const newSplitNames =
                  parsedSplit.splitNames.length > 0
                    ? parsedSplit.splitNames
                    : [userText.replace(/跟|與|和|同|分帳|平分/g, '').trim() || '好友'];
                const { ledgerId, ledgerName, isSharedLedger, splitDetails, splitNote, noSharedLedgerWarning } =
                  await resolveLedgerAndSplit(
                    targetUserId,
                    userName,
                    pendingTx.amount,
                    pendingTx.currency,
                    true,
                    newSplitNames
                  );
                pendingTx.isSharedLedger = isSharedLedger;
                pendingTx.ledgerId = ledgerId;
                pendingTx.ledgerName = ledgerName;
                pendingTx.splitDetails = splitDetails;
                pendingTx.splitNames = newSplitNames;
                pendingTx.splitNote = splitNote;
                pendingTx.noSharedLedgerWarning = noSharedLedgerWarning;
              }

              await savePendingTx(pendingTx);
              await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

              const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
              await sendLineFlexMessage(
                replyToken,
                flexMsg,
                accessToken,
                `✅ 已更新分帳設定！請點擊上方按鈕確認入帳。`
              );
              continue;
            }

            if (userState.state === 'WAITING_LEDGER') {
              const existingLedgers = await getUserExistingLedgers(targetUserId);

              let chosen: Ledger | undefined = undefined;
              const numInput = parseInt(userText, 10);
              if (!isNaN(numInput) && numInput >= 1 && numInput <= existingLedgers.length) {
                chosen = existingLedgers[numInput - 1];
              } else {
                chosen = existingLedgers.find(
                  (l) => l.name.toLowerCase().includes(userText.toLowerCase()) || userText.includes(l.name)
                );
              }

              if (chosen) {
                pendingTx.ledgerId = chosen.id;
                pendingTx.ledgerName = chosen.name;
                pendingTx.isSharedLedger = chosen.isShared;
                pendingTx.noSharedLedgerWarning = undefined;
                await savePendingTx(pendingTx);
                await setUserState(lineUserId, { state: 'IDLE', updatedAt: Date.now() });

                const flexMsg = buildGoldenLayoutFlexMessage(pendingTx);
                await sendLineFlexMessage(
                  replyToken,
                  flexMsg,
                  accessToken,
                  `✅ 已成功切換至記帳帳本「${chosen.name}」！請核對並確認入帳。`
                );
                continue;
              } else {
                // 不存在之帳本：詢問使用者是否要快速新增新帳本
                await setUserState(lineUserId, {
                  state: 'CONFIRM_CREATE_LEDGER',
                  tempTxId: userState.tempTxId,
                  newTargetName: userText,
                  updatedAt: Date.now(),
                });

                const quickReplyPrompt = {
                  items: [
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: '📘 新增個人帳本',
                        data: `action=quick_create_ledger&id=${pendingTx.tempTxId}&name=${encodeURIComponent(userText)}&shared=0`,
                        displayText: `新增個人帳本：${userText}`,
                      },
                    },
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: '👥 新增共管帳本',
                        data: `action=quick_create_ledger&id=${pendingTx.tempTxId}&name=${encodeURIComponent(userText)}&shared=1`,
                        displayText: `新增共管帳本：${userText}`,
                      },
                    },
                    {
                      type: 'action',
                      action: {
                        type: 'postback',
                        label: '🔄 選擇記帳帳本',
                        data: `action=select_ledger&id=${pendingTx.tempTxId}`,
                        displayText: '選擇記帳帳本',
                      },
                    },
                  ],
                };

                const promptText = `💡 系統中目前尚無「${userText}」這個帳本。\n\n請問是否要為您快速新增「${userText}」並將這筆交易歸入？\n（您可以點選下方按鈕選擇建立個人帳本或共管帳本，亦可直接回傳「是」）`;
                await sendLineReplyMessage(replyToken, promptText, accessToken, quickReplyPrompt);
                continue;
              }
            }
          }
        }

        // --- 集中調用 lineAccountingExecutor (內建草稿過期清除/未確認二選一提示、批量解析與單筆語意解析) ---
        const { executeAccountingText } = await import('./lineAccountingExecutor');
        await executeAccountingText({
          userText,
          targetUserId,
          userName,
          lineUserId,
          replyToken,
          accessToken,
          targetChatId,
          pinnedQuickReply,
          config,
          baseUrl,
          userState,
          buildUserAppContext,
          resolveLedgerAndSplit,
          sendLinePushMessage,
          sendLineLoadingAnimation,
          sendLineReplyMessage,
          sendLineFlexMessage,
          sendLineDualMessage,
        });
        continue;
      }
    } catch (err: any) {
      console.error('[LINE Webhook Loop Error]:', err);
      if (replyToken) {
        const rawMsg = err?.message || '';
        const userFriendlyMsg = rawMsg.includes('Quota limit exceeded') || rawMsg.includes('quota')
          ? '⚠️ 雲端資料庫目前正在自動調節同步中，請稍候片刻再次發送，或點擊下方選單開啟記帳軟體喔！🐑✨'
          : `⚠️ 處理訊息時稍有延遲，請稍候再試一次喔！🐑✨`;
        await sendLineReplyMessage(replyToken, userFriendlyMsg, accessToken);
      }
    }
  }

  return { status: 200, message: 'Webhook events processed successfully' };
}
