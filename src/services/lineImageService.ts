import {
  checkAndCleanUserDraft,
  buildDraftResolutionFlexMessage,
  buildDraftResolutionQuickReply,
  buildDraftResolutionTextMessage,
} from './draftManagerService';
import {
  setUserState,
  savePendingTx,
  resolveLedgerAndSplit,
} from './lineStateManager';
import {
  sendLineFlexMessage,
  sendLinePushMessage,
  sendLineLoadingAnimation,
  fetchLineMessageContent,
  sendLineReplyMessage,
} from './lineMessagingService';
import { buildUserAppContext } from './lineUserContextService';
import { parseReceiptImageWithGemini } from './geminiService';
import { getUserAssetAccounts } from './walletService';
import { getUserCategories } from './categoryService';
import {
  buildGoldenLayoutFlexMessage,
  FlexPendingTransactionData,
} from './lineFlexTemplates';

/**
 * 處理 LINE 圖片訊息：先快速回應用戶「正在解析中」，再下載圖片並透過 Gemini 視覺多模態 API 辨識發票/收據，
 * 回填標準記帳要素模塊，並進入 LINE 常規五列互動卡片記帳確認流程。
 */
export async function handleImageMessage(
  event: any,
  targetUserId: string,
  userName: string,
  lineUserId: string,
  replyToken: string,
  accessToken: string,
  targetChatId: string,
  pinnedQuickReply: any,
  config: any,
  overrideMessageId?: string
): Promise<void> {
  const messageId = overrideMessageId || event?.message?.id;
  if (!messageId) return;

  // 0. 若非由草稿解決後直接觸發，檢查使用者是否有未確認之草稿
  if (!overrideMessageId) {
    const draftCheck = await checkAndCleanUserDraft(targetUserId, lineUserId);
    if (draftCheck.hasActiveDraft) {
      await setUserState(lineUserId, {
        state: 'WAITING_DRAFT_RESOLUTION',
        tempTxId: draftCheck.draftType === 'single' ? draftCheck.draftId : undefined,
        tempBatchId: draftCheck.draftType === 'batch' ? draftCheck.draftId : undefined,
        incomingImageMsgId: messageId,
        updatedAt: Date.now(),
      });
      const resolutionFlex = buildDraftResolutionFlexMessage(draftCheck, '📸 [發票/收據照片]', 'img_' + Date.now());
      const resolutionQR = buildDraftResolutionQuickReply(draftCheck, 'img_' + Date.now());
      const resolutionText = buildDraftResolutionTextMessage(draftCheck, '📸 [發票/收據照片]');
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
  }

  // 1. 先快速回應正在解析中 (主動發送 Push 訊息 + 啟動 LINE 官方原生打字載入動畫)
  await Promise.allSettled([
    sendLinePushMessage(
      targetChatId,
      '📸 收到發票/收據照片！小羊正在透過 AI 視覺模型為您精準辨識明細與金額，請耐心稍候片刻喔...🐑✨',
      accessToken
    ),
    sendLineLoadingAnimation(targetChatId, accessToken, 20),
  ]);

  // 2. 從 LINE Messaging API 取得該圖片之二進位資料
  const imageContent = await fetchLineMessageContent(messageId, accessToken);
  if (!imageContent || !imageContent.buffer) {
    await sendLineReplyMessage(
      replyToken,
      '⚠️ 無法從 LINE 伺服器下載該圖片，可能是圖片傳送逾期或網路連線暫態異常，請再傳送一次照片喔！🐑',
      accessToken,
      pinnedQuickReply
    );
    return;
  }

  const base64Data = imageContent.buffer.toString('base64');
  const appContext = await buildUserAppContext(targetUserId);

  // 3. 呼叫 Gemini 視覺多模態 API 解析發票與收據 (傳入真實財務帳本環境)
  const parsed = await parseReceiptImageWithGemini(
    base64Data,
    imageContent.mimeType,
    appContext,
    config?.geminiApiKey
  );

  // 4. 若圖片模糊或非發票收據，未能成功識別出金額，給出原因與歉意引導
  if (parsed.amount <= 0) {
    const errorReasonText = parsed.errorReason || '發票收據字體過淺、光線反光或服務器連線波動';
    const guideMsg = `📸 抱歉，小羊未能從這張照片中清晰識別出發票或收據的金額。\n（原因：${errorReasonText}）\n\n🙇‍♂️ 誠摯跟您說聲抱歉！建議您可以：\n1️⃣ 降低輸入難度，直接對小羊打字輸入（例如：「全聯買菜 ${parsed.title && parsed.title !== '發票收據消費' ? parsed.title : '380'}」）進行極速記帳\n2️⃣ 靠近票面水平重拍一張，避免反光並確認「總計金額」與「店家名稱」完整清晰！🐑✨`;
    await sendLineReplyMessage(replyToken, guideMsg, accessToken, pinnedQuickReply);
    return;
  }

  // 5. 回填跟文字模糊辨識一樣的填空模塊，進入 LINE 常規記帳流程
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

  // 優先比對 Gemini 視覺推測之扣款帳戶
  if (parsed.suggestedAccountName && userAssetAccounts && userAssetAccounts.length > 0) {
    const matchedSuggested = userAssetAccounts.find(
      (a) => a.name.includes(parsed.suggestedAccountName!) || parsed.suggestedAccountName!.includes(a.name)
    );
    if (matchedSuggested) {
      defaultAcc = matchedSuggested;
      defaultSub = matchedSuggested.subAccounts && matchedSuggested.subAccounts.length > 0 ? matchedSuggested.subAccounts[0] : null;
    }
  }

  // 智慧比對發票/收據辨識出的支付方式 (例如信用卡、現金、街口、LINE Pay)
  if (userAssetAccounts && userAssetAccounts.length > 0) {
    const pm = (parsed.paymentMethod || '') + ' ' + (parsed.note || '') + ' ' + parsed.title;
    if (/刷卡|信用卡|卡結帳|visa|mastercard|jcb/i.test(pm)) {
      const ccAcc = userAssetAccounts.find((a) => a.type === 'credit_card' || a.name.includes('信用卡'));
      if (ccAcc) {
        defaultAcc = ccAcc;
        defaultSub = null;
      }
    } else if (/現金|皮夾|付現/i.test(pm)) {
      const cashAcc = userAssetAccounts.find((a) => a.type === 'cash' || a.name.includes('現金') || a.name.includes('皮夾'));
      if (cashAcc) {
        defaultAcc = cashAcc;
        defaultSub = null;
      }
    } else if (/街口|line\s*pay|電子支付|電支|悠遊/i.test(pm)) {
      const ewAcc = userAssetAccounts.find((a) => a.type === 'e_wallet' || a.name.includes('街口') || a.name.includes('電子') || a.name.includes('錢包'));
      if (ewAcc) {
        defaultAcc = ewAcc;
        defaultSub = null;
      }
    }
  }

  const defaultAccountName = defaultAcc
    ? `${defaultAcc.name}${defaultSub ? ` · ${defaultSub.name}` : ''}`
    : '現金皮夾';

  // 撈取真實分類
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
    rawText: `[發票收據照片辨識] ${parsed.title}`,
    isSplit: parsed.isSplit,
    splitNote,
    splitNames: parsed.splitNames,
    splitDetails,
    noSharedLedgerWarning,
    note: parsed.note || undefined,
    invoiceNumber: parsed.invoiceNumber || undefined,
    createdAt: new Date().toISOString(),
  };

  const invoiceExtra = parsed.invoiceNumber ? `\n發票號碼：${parsed.invoiceNumber}` : '';
  const noteExtra = parsed.note ? `\n明細：${parsed.note}` : '';
  const fallbackText = `🐑【發票/收據辨識確認】${pendingData.title}\n金額：${pendingData.currency} ${pendingData.amount.toLocaleString()} 元\n分類：${pendingData.categoryName}\n帳本：${pendingData.ledgerName} (${isSharedLedger ? '共管帳本' : '個人帳本'})${invoiceExtra}${noteExtra}\n\n請在下方確認入帳，或點擊按鈕修改金額、分類、扣款帳戶與帳本。`;

  // 儲存待確認暫存紀錄與使用者狀態
  await savePendingTx(pendingData);
  await setUserState(lineUserId, { state: 'IDLE', tempTxId, updatedAt: Date.now() });

  // 發送五列黃金版型 Flex Message 卡片，包含完整的狀態機互動按鈕
  const flexMsg = buildGoldenLayoutFlexMessage(pendingData);
  await sendLineFlexMessage(replyToken, flexMsg, accessToken, fallbackText, pinnedQuickReply);
}
