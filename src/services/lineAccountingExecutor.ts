import { FlexPendingTransactionData, buildGoldenLayoutFlexMessage } from './lineFlexTemplates';
import {
  detectIsBatchFinancialText,
  parseBatchTransactionsWithGemini,
  createPendingBatchEntity,
  buildBatchSummaryFlexMessage,
  buildBatchQuickReply,
} from './batchTransactionService';
import { parseLineMessageWithGemini } from './lineNlpParser';
import { getUserAssetAccounts } from './walletService';
import { getUserCategories } from './categoryService';
import { savePendingTx, setUserState } from './lineStateManager';
import { getAppBaseUrl } from '../utils/urlUtils';

interface ExecuteTextOptions {
  userText: string;
  targetUserId: string;
  userName: string;
  lineUserId: string;
  replyToken: string;
  accessToken: string;
  targetChatId: string;
  pinnedQuickReply: any;
  config: any;
  baseUrl?: string;
  userState?: any;
  buildUserAppContext: (userId: string) => Promise<any>;
  resolveLedgerAndSplit: (...args: any[]) => Promise<any>;
  sendLinePushMessage: (chatId: string, text: string, token: string) => Promise<any>;
  sendLineLoadingAnimation: (chatId: string, token: string, seconds: number) => Promise<any>;
  sendLineReplyMessage: (token: string, text: string, accToken: string, qr?: any) => Promise<any>;
  sendLineFlexMessage: (token: string, flex: any, accToken: string, altText?: string, qr?: any, targetChatId?: string) => Promise<any>;
  sendLineDualMessage: (token: string, flex: any, text: string, accToken: string, qr?: any, altText?: string) => Promise<any>;
}

/**
 * 集中處理一般文字記帳 (支援大量批量流水帳偵測與單筆 AI 語意解析)
 */
export async function executeAccountingText(options: ExecuteTextOptions): Promise<void> {
  const {
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
  } = options;

  const appUrl = getAppBaseUrl(baseUrl);

  // 0. 🛡️ 檢查使用者是否有未確認之草稿 (單筆或批量)
  // 若草稿已逾期 (放太久 > 30分鐘)，自動安靜徹底清除，絕不阻擋新記帳；
  // 若仍在短時間內 (<= 30分鐘)，則彈出選擇，讓使用者選擇「完成上一筆」或「放棄上一筆」！
  const { checkAndCleanUserDraft, buildDraftResolutionFlexMessage, buildDraftResolutionQuickReply, buildDraftResolutionTextMessage } = await import('./draftManagerService');
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
    return;
  }

  // 1. 偵測到大量流水帳文字時，自動觸發批量逐筆解析流程
  if (detectIsBatchFinancialText(userText)) {
    await Promise.allSettled([
      sendLinePushMessage(
        targetChatId,
        '📦 偵測到大量流水記帳文字！小羊正在召喚 Gemini AI 進行逐筆語意拆解與自動分類，請稍候片刻喔...🐑✨',
        accessToken
      ),
      sendLineLoadingAnimation(targetChatId, accessToken, 30),
    ]);

    const appContext = await buildUserAppContext(targetUserId);
    const batchItems = await parseBatchTransactionsWithGemini(userText, appContext, config?.geminiApiKey);

    if (!batchItems || batchItems.length === 0) {
      await sendLineReplyMessage(
        replyToken,
        '⚠️ 抱歉，未能自您的文字中成功解析出有效金額與交易項目，請確認格式（例如：9/13 列印30元）後再次嘗試。',
        accessToken,
        pinnedQuickReply
      );
      return;
    }

    const batch = await createPendingBatchEntity(targetUserId, lineUserId, userName, batchItems, appContext);
    await setUserState(lineUserId, {
      state: 'WAITING_BATCH_CONFIRM',
      tempBatchId: batch.id,
      updatedAt: Date.now(),
    });

    const flexMsg = buildBatchSummaryFlexMessage(batch, appUrl);
    const altText = `📦 批量記帳解析完成：共 ${batch.validCount} 筆交易 (總計 NT$ ${batch.totalExpense.toLocaleString()})`;
    const totalPages = Math.ceil(batch.validCount / 15) || 1;
    const batchQuickReply = buildBatchQuickReply(batch.id, batch.validCount, appUrl, 1, totalPages);

    await sendLineDualMessage(
      replyToken,
      flexMsg,
      `📦 批量記帳解析完成！共 ${batch.validCount} 筆（總支出 NT$ ${batch.totalExpense.toLocaleString()} 元），請點擊下方按鈕一鍵入帳或查看清單。`,
      accessToken,
      batchQuickReply,
      altText
    );
    return;
  }

  // 2. 單筆文字記帳 AI 語意解析
  await Promise.allSettled([
    sendLinePushMessage(
      targetChatId,
      '⏳ 收到訊息！小羊正在開始為您解析語意與金額，請耐心稍候片刻喔...🐑✨',
      accessToken
    ),
    sendLineLoadingAnimation(targetChatId, accessToken, 20),
  ]);

  const appContext = await buildUserAppContext(targetUserId);
  const parsed = await parseLineMessageWithGemini(userText, appContext, config?.geminiApiKey);

  if (parsed.amount <= 0) {
    const apologyReason = parsed.reasonIfFallback || '未能精準提取有效金額數值';
    const guideMsg = `⚠️ 抱歉，小羊未能從您的訊息中識別出記帳金額與項目。（原因：${apologyReason}）\n\n🙇‍♂️ 非常抱歉給您帶來不便！建議您可以改為更直白的生活化格式，例如：\n• 「買冰箱 5萬」\n• 「吃燒肉和媽媽分共1千5」\n• 「7-11 早餐 85」\n• 「薪資收入 60000」\n\n📸 您也可以直接傳送發票或收據照片給我自動辨識喔！🐑✨`;
    await sendLineReplyMessage(replyToken, guideMsg, accessToken, pinnedQuickReply);
    return;
  }

  const { ledgerId, ledgerName, isSharedLedger, splitDetails, splitNote, noSharedLedgerWarning } =
    await resolveLedgerAndSplit(
      targetUserId,
      userName,
      parsed.amount,
      parsed.currency,
      parsed.isSplit,
      parsed.splitNames
    );

  const tempTxId = `ptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const todayStr = parsed.date || new Date().toISOString().split('T')[0];

  // 撈取用戶真實資產帳戶與子帳戶
  const userAssetAccounts = await getUserAssetAccounts(targetUserId);
  let defaultAcc = userAssetAccounts && userAssetAccounts.length > 0 ? userAssetAccounts[0] : null;
  let defaultSub = defaultAcc?.subAccounts && defaultAcc.subAccounts.length > 0 ? defaultAcc.subAccounts[0] : null;

  if (parsed.suggestedAccountName && userAssetAccounts && userAssetAccounts.length > 0) {
    const matchedSuggested = userAssetAccounts.find(
      (a) => a.name.includes(parsed.suggestedAccountName!) || parsed.suggestedAccountName!.includes(a.name)
    );
    if (matchedSuggested) {
      defaultAcc = matchedSuggested;
      defaultSub = matchedSuggested.subAccounts && matchedSuggested.subAccounts.length > 0 ? matchedSuggested.subAccounts[0] : null;
    }
  }

  if (userAssetAccounts && userAssetAccounts.length > 0) {
    for (const acc of userAssetAccounts) {
      if (userText.includes(acc.name)) {
        defaultAcc = acc;
        defaultSub = acc.subAccounts && acc.subAccounts.length > 0 ? acc.subAccounts[0] : null;
        break;
      }
      if (acc.subAccounts) {
        const matchedSubAcc = acc.subAccounts.find((s) => userText.includes(s.name));
        if (matchedSubAcc) {
          defaultAcc = acc;
          defaultSub = matchedSubAcc;
          break;
        }
      }
    }

    if (/現金|皮夾|掏錢|付現|鈔票/i.test(userText)) {
      const cashAcc = userAssetAccounts.find((a) => a.type === 'cash' || a.name.includes('現金') || a.name.includes('皮夾'));
      if (cashAcc) {
        defaultAcc = cashAcc;
        defaultSub = null;
      }
    } else if (/刷卡|信用卡|卡結帳/i.test(userText)) {
      const ccAcc = userAssetAccounts.find((a) => a.type === 'credit_card' || a.name.includes('信用卡'));
      if (ccAcc) {
        defaultAcc = ccAcc;
        defaultSub = null;
      }
    } else if (/街口|line\s*pay|電子支付|電支|悠遊付/i.test(userText)) {
      const ewAcc = userAssetAccounts.find((a) => a.type === 'e_wallet' || a.name.includes('街口') || a.name.includes('電子'));
      if (ewAcc) {
        defaultAcc = ewAcc;
        defaultSub = null;
      }
    }
  }

  const defaultAccountName = defaultAcc
    ? `${defaultAcc.name}${defaultSub ? ` · ${defaultSub.name}` : ''}`
    : '現金皮夾';

  const userCats = await getUserCategories(targetUserId);
  const matchedCat = userCats.find(
    (c) =>
      (parsed.type ? c.type === parsed.type : true) &&
      (c.name === parsed.category ||
        c.name.includes(parsed.category) ||
        parsed.category.includes(c.name))
  );
  const finalResolvedCatName = matchedCat?.name || parsed.category;
  const finalResolvedCatId =
    matchedCat?.id ||
    (parsed.type === 'income'
      ? `cat_inc_${targetUserId}_其他收入`
      : `cat_exp_${targetUserId}_其他雜支`);

  const pendingData: FlexPendingTransactionData = {
    tempTxId,
    title: parsed.title,
    amount: parsed.amount,
    currency: parsed.currency,
    categoryId: finalResolvedCatId,
    categoryName: finalResolvedCatName,
    accountName: defaultAccountName,
    accountId: defaultAcc?.id,
    subAccountId: defaultSub?.id,
    ledgerId,
    ledgerName,
    isSharedLedger,
    date: todayStr,
    type: parsed.type,
    userId: targetUserId,
    userName,
    lineUserId,
    rawText: userText,
    isSplit: parsed.isSplit,
    splitNote,
    splitNames: parsed.splitNames,
    splitDetails,
    noSharedLedgerWarning,
    createdAt: new Date().toISOString(),
  };

  const fallbackText = `🐑【記帳確認】${pendingData.title}\n金額：${pendingData.currency} ${pendingData.amount.toLocaleString()} 元\n分類：${pendingData.categoryName}\n帳本：${pendingData.ledgerName} (${isSharedLedger ? '共管帳本' : '個人帳本'})${splitNote ? `\n分帳：${splitNote}` : ''}\n\n請在下方確認入帳，或點擊按鈕修改金額、分類、成員與帳本。`;

  const isTourInput =
    userState?.isTourActive ||
    /吃到飽\s*499/i.test(userText) ||
    (/吃到飽/i.test(userText) && /499/i.test(userText));

  if (isTourInput) {
    pendingData.isTour = true;
    await savePendingTx(pendingData);
    await setUserState(lineUserId, {
      state: 'IDLE',
      tempTxId,
      isTourActive: true,
      tourStep: 2,
      updatedAt: Date.now(),
    });

    const flexMsg = buildGoldenLayoutFlexMessage(pendingData);
    const tourGuideText = `👉【新手導覽・步驟 2/4】：\n後端狀態機已產生成員與金額卡片！\n請點擊上方卡片上的【💳 改付款方式】按鈕，體驗隨時切換扣款管道！`;
    const tourQuickReply = {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: '💳 改付款方式',
            data: `action=edit_account&id=${tempTxId}`,
            displayText: '改付款方式',
          },
        },
      ],
    };

    await sendLineFlexMessage(replyToken, flexMsg, accessToken, fallbackText, tourQuickReply);
    await sendLinePushMessage(targetChatId, tourGuideText, accessToken);
    return;
  }

  await savePendingTx(pendingData);
  await setUserState(lineUserId, { state: 'IDLE', tempTxId, updatedAt: Date.now() });

  const flexMsg = buildGoldenLayoutFlexMessage(pendingData);
  await sendLineFlexMessage(replyToken, flexMsg, accessToken, fallbackText, pinnedQuickReply);
}
