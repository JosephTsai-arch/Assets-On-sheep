import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Transaction } from '../types';
import {
  getUserExistingLedgers,
  savePendingTx,
  setUserState,
} from './lineStateManager';
import { getUserAssetAccounts } from './walletService';
import {
  buildGoldenLayoutFlexMessage,
  FlexPendingTransactionData,
} from './lineFlexTemplates';
import {
  sendLineFlexMessage,
  sendLineReplyMessage,
} from './lineMessagingService';

/**
 * 處理「修改上一筆」：查詢最新交易明細並以 Golden Layout 卡片提供修改與刪除選項
 */
export async function handleEditLastTransaction(
  targetUserId: string,
  userName: string,
  lineUserId: string,
  replyToken: string,
  accessToken: string,
  pinnedQuickReply: any
): Promise<void> {
  try {
    const txSnap = await getDocs(
      query(
        collection(db, 'transactions'),
        where('userId', '==', targetUserId)
      )
    );
    const activeTxs = txSnap.docs
      .map((d) => d.data() as Transaction)
      .filter((t) => !t.deletedAt)
      .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

    if (activeTxs.length === 0) {
      await sendLineReplyMessage(
        replyToken,
        '⚠️ 目前帳戶中尚無歷史記帳明細可供修改。您可以直接對我說一句話開始記帳喔！',
        accessToken,
        pinnedQuickReply
      );
      return;
    }

    const lastTx = activeTxs[0];
    const userLedgers = await getUserExistingLedgers(targetUserId);
    const userAssets = await getUserAssetAccounts(targetUserId);
    const currentLedger = userLedgers.find((l) => l.id === lastTx.ledgerId);
    const currentAsset = userAssets.find((a) => a.id === lastTx.accountId) || userAssets[0];
    const currentSub = currentAsset?.subAccounts?.find((s) => s.id === lastTx.subAccountId) || currentAsset?.subAccounts?.[0];
    const ledgerName = currentLedger ? currentLedger.name : '日常個人帳本';
    const isSharedLedger = Boolean(currentLedger?.isShared || (lastTx.splitDetails && lastTx.splitDetails.length > 0));
    const assetDisplayName = currentAsset
      ? `${currentAsset.name}${currentSub ? ` · ${currentSub.name}` : ''}`
      : '現金皮夾';

    const tempTxId = `ptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const pendingData: FlexPendingTransactionData = {
      tempTxId,
      existingTxId: lastTx.id,
      title: lastTx.title,
      amount: lastTx.amount,
      currency: lastTx.currency || 'TWD',
      categoryName: lastTx.categoryName || '一般',
      accountName: assetDisplayName,
      accountId: currentAsset?.id,
      subAccountId: currentSub?.id,
      ledgerId: lastTx.ledgerId,
      ledgerName,
      isSharedLedger,
      date: lastTx.date,
      type: lastTx.type === 'income' ? 'income' : 'expense',
      userId: targetUserId,
      userName,
      lineUserId,
      splitDetails: lastTx.splitDetails || undefined,
      splitNote: lastTx.splitDetails
        ? `分攤成員：${lastTx.splitDetails.map((s) => `${s.memberName} (${lastTx.currency || 'TWD'} ${s.amount})`).join('、')}`
        : undefined,
      rawText: lastTx.title,
    };

    await savePendingTx(pendingData);
    await setUserState(lineUserId, { state: 'IDLE', tempTxId, updatedAt: Date.now() });

    const flexMsg = buildGoldenLayoutFlexMessage(pendingData);
    await sendLineFlexMessage(
      replyToken,
      flexMsg,
      accessToken,
      `✏️ 修改上一筆：${lastTx.title} ${lastTx.currency || 'TWD'} ${lastTx.amount}`,
      pinnedQuickReply
    );
  } catch (err: any) {
    console.error('[handleEditLastTransaction Error]:', err);
    await sendLineReplyMessage(
      replyToken,
      '⚠️ 查詢上一筆紀錄時發生問題，請稍候重試。',
      accessToken,
      pinnedQuickReply
    );
  }
}
