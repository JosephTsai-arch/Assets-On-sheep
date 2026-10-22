import { DraftCheckResult } from './draftManagerService';

/**
 * 產生未確認草稿二擇一 (完成上一筆 vs 放棄上一筆) 純文字指引訊息 (保證 100% 成功送達，無破版可能)
 */
export function buildDraftResolutionTextMessage(
  prevDraft: DraftCheckResult,
  newInputSummary: string
): string {
  const title = (prevDraft.summaryTitle || '待確認記帳').trim();
  const amt = (prevDraft.summaryAmount || 0).toLocaleString();
  const cur = prevDraft.summaryCurrency || 'NT$';
  const age = prevDraft.ageMinutes || 1;
  const newSummary = (newInputSummary || '新記帳輸入').trim();

  return (
    `⚠️【偵測到上一筆記帳尚未確認】\n` +
    `您在約 ${age} 分鐘前輸入了：\n` +
    `📌【${title}】${cur} ${amt} 元 (${prevDraft.summaryCategory || '一般支出'} · ${prevDraft.summaryLedger || '個人帳本'})\n\n` +
    `📝 您剛才新輸入了：「${newSummary}」\n\n` +
    `請問要如何處理上一筆？\n` +
    `1️⃣ 點選【✅ 完成上一筆】：將上一筆入帳，並繼續處理剛才輸入的記帳\n` +
    `2️⃣ 點選【🗑️ 放棄上一筆】：捨棄上一筆，直接記剛才輸入的內容\n` +
    `3️⃣ 點選【👀 檢視上一筆】：重新調出上一筆確認卡片\n\n` +
    `👉 您可直接點選下方快捷按鈕，或在此直接回傳「完成」或「放棄」！`
  );
}

/**
 * 產生未確認草稿二擇一 (完成上一筆 vs 放棄上一筆) 專屬 LINE Flex Message 樣板
 * 嚴格遵循 LINE Messaging API 規範 (無非法 CSS、無 baseline、合法 borderWidth: light)
 */
export function buildDraftResolutionFlexMessage(
  prevDraft: DraftCheckResult,
  newInputSummary: string,
  pendingActionKey: string
): any {
  const safeTitle = (prevDraft.summaryTitle || '待確認項目').substring(0, 30);
  const safeAmt = `${prevDraft.summaryCurrency || 'NT$'} ${(prevDraft.summaryAmount || 0).toLocaleString()}`;
  const safeAge = prevDraft.ageMinutes || 1;
  const safeNewInput = (newInputSummary || '新記帳輸入').substring(0, 80);
  const safePid = prevDraft.draftId || '';
  const safePtype = prevDraft.draftType || 'single';

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      backgroundColor: '#78350F',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '⚠️ 偵測到上一筆記帳尚未確認！',
              weight: 'bold',
              color: '#FDE68A',
              size: 'sm',
              flex: 1,
            },
          ],
        },
        {
          type: 'text',
          text: `約 ${safeAge} 分鐘前輸入，尚未儲存為正式交易`,
          color: '#FEF3C7',
          size: 'xxs',
          margin: 'xs',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'md',
      backgroundColor: '#FFFFFF',
      spacing: 'sm',
      contents: [
        // 上一筆草稿內容卡片
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#FFFBEB',
          cornerRadius: 'md',
          paddingAll: 'md',
          borderColor: '#FDE68A',
          borderWidth: 'light',
          contents: [
            {
              type: 'text',
              text: '📌 上一筆未完成草稿：',
              size: 'xs',
              weight: 'bold',
              color: '#92400E',
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              alignItems: 'center',
              contents: [
                {
                  type: 'text',
                  text: safeTitle,
                  size: 'sm',
                  weight: 'bold',
                  color: '#1E293B',
                  flex: 3,
                  wrap: true,
                },
                {
                  type: 'text',
                  text: safeAmt,
                  size: 'sm',
                  weight: 'bold',
                  color: '#DC2626',
                  align: 'end',
                  flex: 2,
                },
              ],
            },
            {
              type: 'text',
              text: `分類：${prevDraft.summaryCategory || '一般支出'} · 帳本：${prevDraft.summaryLedger || '個人帳本'}`,
              size: 'xxs',
              color: '#78350F',
              margin: 'xs',
            },
          ],
        },

        // 本次新輸入內容
        {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#F8FAFC',
          cornerRadius: 'md',
          paddingAll: 'md',
          contents: [
            {
              type: 'text',
              text: '📝 您本次新輸入的內容：',
              size: 'xs',
              weight: 'bold',
              color: '#475569',
            },
            {
              type: 'text',
              text: safeNewInput,
              size: 'xs',
              color: '#0F172A',
              weight: 'bold',
              margin: 'xs',
              wrap: true,
            },
          ],
        },
        {
          type: 'text',
          text: '💡 請問您希望如何處理上一筆草稿？',
          size: 'xs',
          color: '#64748B',
          align: 'center',
          margin: 'sm',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      backgroundColor: '#F8FAFC',
      paddingAll: 'md',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#10B981',
          height: 'sm',
          action: {
            type: 'postback',
            label: '✅ 完成上一筆',
            data: `action=draft_resolve&mode=commit_prev&pid=${safePid}&ptype=${safePtype}&k=${pendingActionKey}`,
            displayText: '完成上一筆，並記這筆',
          },
        },
        {
          type: 'button',
          style: 'secondary',
          color: '#EF4444',
          height: 'sm',
          action: {
            type: 'postback',
            label: '🗑️ 放棄上一筆',
            data: `action=draft_resolve&mode=discard_prev&pid=${safePid}&ptype=${safePtype}&k=${pendingActionKey}`,
            displayText: '放棄上一筆，改記這筆',
          },
        },
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          color: '#475569',
          action: {
            type: 'postback',
            label: '👀 檢視上一筆卡片',
            data: `action=draft_resolve&mode=view_prev&pid=${safePid}&ptype=${safePtype}`,
            displayText: '檢視上一筆草稿',
          },
        },
      ],
    },
  };
}

/**
 * 產生未確認草稿快捷回覆 (Quick Reply)
 */
export function buildDraftResolutionQuickReply(
  prevDraft: DraftCheckResult,
  pendingActionKey: string
): any {
  const safePid = prevDraft.draftId || '';
  const safePtype = prevDraft.draftType || 'single';

  return {
    items: [
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '✅ 完成上一筆',
          data: `action=draft_resolve&mode=commit_prev&pid=${safePid}&ptype=${safePtype}&k=${pendingActionKey}`,
          displayText: '完成上一筆，並記這筆',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🗑️ 放棄上一筆',
          data: `action=draft_resolve&mode=discard_prev&pid=${safePid}&ptype=${safePtype}&k=${pendingActionKey}`,
          displayText: '放棄上一筆，改記這筆',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '👀 檢視上一筆',
          data: `action=draft_resolve&mode=view_prev&pid=${safePid}&ptype=${safePtype}`,
          displayText: '檢視上一筆草稿',
        },
      },
    ],
  };
}
