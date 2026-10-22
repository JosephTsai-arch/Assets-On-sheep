import { SplitDetail } from '../types';

/**
 * LINE 官方 Flex Message 樣板引擎 (Golden Layout)
 * 卡片佈局（由上至下）：
 * (第1列/綠滿版) ✅ 確認入帳 / ✅ 確認更新
 * (第2列/並排) 💰 改金額 | 💳 付款方式
 * (第3列/並排) 🏷️ 修正分類 | 👥 與人平分
 * (第4列/淺紅滿版) ❌ 放棄此筆 / 🗑️ 刪除此筆
 */

export interface FlexPendingTransactionData {
  tempTxId: string;
  existingTxId?: string; // 若為修改歷史明細，標記原始 Transaction ID
  title: string;
  amount: number;
  currency: string;
  categoryId?: string;
  categoryName: string;
  accountName: string;
  accountId?: string;
  subAccountId?: string;
  ledgerId: string;
  ledgerName: string;
  isSharedLedger?: boolean;
  date: string;
  type: 'expense' | 'income';
  userId: string;
  userName: string;
  lineUserId: string;
  rawText?: string;
  isSplit?: boolean;
  splitNote?: string;
  splitNames?: string[];
  splitDetails?: SplitDetail[];
  noSharedLedgerWarning?: string;
  isTour?: boolean;
  createdAt?: string;
  note?: string;
  invoiceNumber?: string;
}

export function buildGoldenLayoutFlexMessage(data: FlexPendingTransactionData) {
  const isIncome = data.type === 'income';
  const typeTag = data.existingTxId
    ? '【修改歷史明細】'
    : data.isSharedLedger
    ? '【共管分帳確認】'
    : isIncome
    ? '【收入確認】'
    : '【支出確認】';
  const currencySymbol = data.currency || 'TWD';
  const formattedAmount = `${currencySymbol} ${data.amount.toLocaleString()}`;

  const bodyContents: any[] = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '類別', size: 'sm', color: '#64748B', flex: 2 },
        {
          type: 'text',
          text: `${data.categoryName} (${isIncome ? '收入' : '支出'})`,
          size: 'sm',
          color: '#0F172A',
          flex: 4,
          weight: 'bold',
        },
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '扣款帳戶', size: 'sm', color: '#64748B', flex: 2 },
        { type: 'text', text: data.accountName || '預設現金', size: 'sm', color: '#0F172A', flex: 4 },
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '歸入帳本', size: 'sm', color: '#64748B', flex: 2 },
        {
          type: 'text',
          text: `${data.ledgerName} ${data.isSharedLedger ? '👥(共管帳本)' : '📘(個人帳本)'}`,
          size: 'sm',
          color: data.isSharedLedger ? '#2563EB' : '#0F172A',
          flex: 4,
          weight: 'bold',
        },
      ],
    },
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '入帳日期', size: 'sm', color: '#64748B', flex: 2 },
        { type: 'text', text: data.date, size: 'sm', color: '#0F172A', flex: 4 },
      ],
    },
  ];

  if (data.invoiceNumber) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '發票號碼', size: 'sm', color: '#64748B', flex: 2 },
        { type: 'text', text: data.invoiceNumber, size: 'sm', color: '#0F172A', flex: 4, weight: 'bold' },
      ],
    });
  }

  if (data.note) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '明細清單', size: 'sm', color: '#64748B', flex: 2 },
        { type: 'text', text: data.note, size: 'xs', color: '#334155', flex: 4, wrap: true },
      ],
    });
  }

  // 若使用者無共管帳本但有分帳，提示警示
  if (data.noSharedLedgerWarning) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FEF3C7',
      cornerRadius: 'sm',
      paddingAll: 'xs',
      contents: [
        {
          type: 'text',
          text: data.noSharedLedgerWarning,
          size: 'xxs',
          color: '#B45309',
          wrap: true,
        },
      ],
    });
  }

  // 若偵測到分帳情境，呈現專屬分帳成員與均分區塊
  if (data.splitDetails && data.splitDetails.length > 0) {
    const memberCount = data.splitDetails.length;
    const perPerson = data.splitDetails[0].amount;
    const membersDisplay = data.splitDetails
      .map((m) => `${m.memberName} (${currencySymbol} ${m.amount.toLocaleString()})`)
      .join('、');

    bodyContents.push(
      {
        type: 'separator',
        margin: 'md',
        color: '#E2E8F0',
      },
      {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        backgroundColor: '#EFF6FF',
        cornerRadius: 'md',
        paddingAll: 'sm',
        contents: [
          {
            type: 'text',
            text: `⚖️ ${memberCount}人均分 (每人 ${currencySymbol} ${perPerson.toLocaleString()} 元)`,
            size: 'xs',
            weight: 'bold',
            color: '#1D4ED8',
          },
          {
            type: 'text',
            text: `分攤成員：${membersDisplay}`,
            size: 'xxs',
            color: '#3B82F6',
            wrap: true,
          },
        ],
      }
    );
  } else if (data.splitNote || (data.splitNames && data.splitNames.length > 0)) {
    const splitText = data.splitNote || `與 ${data.splitNames?.join('、')} 分帳`;
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: '分帳對象', size: 'sm', color: '#64748B', flex: 2 },
        { type: 'text', text: splitText, size: 'sm', color: '#D97706', flex: 4, weight: 'bold' },
      ],
    });
  }

  return {
    type: 'flex',
    altText: `記帳確認：${data.title} ${formattedAmount} (請點擊確認)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: data.isSharedLedger ? '#F0F9FF' : '#FAF7F2',
        contents: [
          {
            type: 'text',
            text: `🐑 資產上羊 ${typeTag}`,
            weight: 'bold',
            color: data.isSharedLedger ? '#0284C7' : '#10B981',
            size: 'sm',
          },
          {
            type: 'text',
            text: data.title,
            weight: 'bold',
            size: 'xl',
            color: '#1E293B',
            margin: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: formattedAmount,
            weight: 'bold',
            size: 'xxl',
            color: isIncome ? '#059669' : '#0F172A',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#FFFFFF',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FAF7F2',
        contents: [
          // 第 1 列/綠色滿版強調：【✅ 確認入帳】（或修改模式下的【✅ 確認更新】）
          {
            type: 'button',
            style: 'primary',
            color: '#10B981',
            height: 'sm',
            action: {
              type: 'postback',
              label: data.existingTxId ? '✅ 確認更新' : '✅ 確認入帳',
              data: `action=confirm&id=${data.tempTxId}`,
              displayText: data.existingTxId ? '✅ 完成修改並更新' : '✅ 確認入帳',
            },
          },
          // 第 2 列：【💰 改金額】、【💳 付款方式】這兩個按鈕並排
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                color: '#F1F5F9',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '💰 改金額',
                  data: `action=edit_amount&id=${data.tempTxId}`,
                  displayText: '💰 修改金額',
                },
                flex: 1,
              },
              {
                type: 'button',
                style: 'secondary',
                color: '#F1F5F9',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '💳 付款方式',
                  data: `action=edit_account&id=${data.tempTxId}`,
                  displayText: '💳 修改付款方式',
                },
                flex: 1,
              },
            ],
          },
          // 第 3 列：【🏷️ 修正分類】、【👥 與人平分】這兩個按鈕並排
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                color: '#F1F5F9',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '🏷️ 修正分類',
                  data: `action=edit_category&id=${data.tempTxId}`,
                  displayText: '🏷️ 修正分類',
                },
                flex: 1,
              },
              {
                type: 'button',
                style: 'secondary',
                color: '#EEF2FF',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '👥 與人平分',
                  data: `action=edit_split&id=${data.tempTxId}`,
                  displayText: '👥 與人平分',
                },
                flex: 1,
              },
            ],
          },
          // 第 4 列/淺紅滿版：【❌ 放棄此筆】（或【🗑️ 刪除此筆】）— 收斂於最底部
          {
            type: 'button',
            style: 'secondary',
            color: '#FEE2E2',
            height: 'sm',
            action: {
              type: 'postback',
              label: data.existingTxId ? '🗑️ 刪除此筆' : '❌ 放棄此筆',
              data: data.existingTxId
                ? `action=delete_existing&id=${data.tempTxId}`
                : `action=cancel&id=${data.tempTxId}`,
              displayText: data.existingTxId ? '🗑️ 刪除此筆紀錄' : '❌ 放棄此筆',
            },
          },
        ],
      },
    },
  };
}

/**
 * LINE 官方全域公告 Flex Message 樣板引擎
 * 卡片下方內建狀態機按鈕：
 * (第一列/綠滿版) 📱 打開軟體 (原生開啟或 LIFF)
 * (第二列/灰底半版) ✏️ 記帳 | 👤 我的帳號
 * (第三列/淺灰滿版) 🔄 修改上一筆
 */
export function buildAnnouncementFlexMessage(data: {
  title: string;
  content: string;
  category: string;
  catLabel: string;
  directInAppUrl: string;
}) {
  const categoryColorMap: Record<string, string> = {
    feature: '#059669', // 翡翠綠
    system: '#D97706',  // 琥珀橘
    maintenance: '#DC2626', // 紅色
    notice: '#2563EB',  // 藍色
  };
  const categoryColor = categoryColorMap[data.category] || '#059669';

  return {
    type: 'flex',
    altText: `【資產上羊・${data.catLabel}】${data.title}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FAF7F2',
        paddingAll: 'lg',
        paddingBottom: 'md',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: `📢 ${data.catLabel}`,
                size: 'xs',
                color: categoryColor,
                weight: 'bold',
              },
            ],
          },
          {
            type: 'text',
            text: data.title,
            weight: 'bold',
            size: 'lg',
            color: '#1C1917',
            margin: 'sm',
            wrap: true,
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: data.content,
            size: 'sm',
            color: '#44403C',
            wrap: true,
            lineSpacing: '4px',
          },
          {
            type: 'separator',
            margin: 'lg',
            color: '#E7E5E4',
          },
          {
            type: 'text',
            text: '👉 點擊下方狀態機按鈕快速操作：',
            size: 'xs',
            color: '#78716C',
            weight: 'bold',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FAF7F2',
        paddingAll: 'md',
        contents: [
          // 第一列/綠滿版：📱 打開軟體
          {
            type: 'button',
            style: 'primary',
            color: '#059669',
            height: 'sm',
            action: {
              type: 'uri',
              label: '📱 打開軟體',
              uri: data.directInAppUrl,
            },
          },
          // 第二列/灰底半版：✏️ 記帳 | 👤 我的帳號
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                color: '#E7E5E4',
                height: 'sm',
                action: {
                  type: 'message',
                  label: '✏️ 記帳',
                  text: '記帳',
                },
                flex: 1,
              },
              {
                type: 'button',
                style: 'secondary',
                color: '#E7E5E4',
                height: 'sm',
                action: {
                  type: 'message',
                  label: '👤 我的帳號',
                  text: '我的帳號',
                },
                flex: 1,
              },
            ],
          },
          // 第三列/淺灰底滿版：🔄 修改上一筆
          {
            type: 'button',
            style: 'secondary',
            color: '#F5F5F4',
            height: 'sm',
            action: {
              type: 'postback',
              label: '🔄 修改上一筆',
              data: 'action=edit_last',
              displayText: '修改上一筆',
            },
          },
        ],
      },
    },
  };
}

/**
 * LINE 官方【📱 打開軟體】專屬 Flex Message 樣板引擎
 * - 徹底移除內部 LIFF 技術名詞與贅字說明，提供簡潔專業的用戶引導
 * - 整合【⏰ 記帳鬧鐘】按鈕，卡片功能一次到位
 */
export function buildOpenAppFlexMessage(data: {
  userName: string;
  directInAppUrl: string;
  isRegister?: boolean;
}) {
  return {
    type: 'flex',
    altText: `📱 打開【資產上羊】智慧記帳 (${data.userName})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#059669',
        paddingAll: 'lg',
        contents: [
          {
            type: 'text',
            text: data.isRegister ? '🎉 恭喜完成註冊！' : '🐑【資產上羊】智慧記帳',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
          },
          {
            type: 'text',
            text: `嗨，${data.userName}！隨時點擊下方按鈕進入記帳空間`,
            color: '#D1FAE5',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FFFFFF',
        paddingAll: 'lg',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'xs',
            contents: [
              {
                type: 'text',
                text: '✨ 專屬個人與協作理財空間：',
                size: 'xs',
                color: '#334155',
                weight: 'bold',
              },
              {
                type: 'text',
                text: '• 🔒 日常私帳 (個人私密記帳)',
                size: 'xxs',
                color: '#64748B',
              },
              {
                type: 'text',
                text: '• 💳 現金、玉山銀行與電子錢包即時餘額',
                size: 'xxs',
                color: '#64748B',
              },
              {
                type: 'text',
                text: '• 👥 好友共管帳本與自動 AA 平帳',
                size: 'xxs',
                color: '#64748B',
              },
              {
                type: 'text',
                text: '• 📊 即時聯動預算與 12 個月資產水位走勢',
                size: 'xxs',
                color: '#64748B',
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FAF7F2',
        paddingAll: 'md',
        contents: [
          // 第一列/綠滿版：📱 打開軟體
          {
            type: 'button',
            style: 'primary',
            color: '#059669',
            height: 'sm',
            action: {
              type: 'uri',
              label: '📱 打開軟體',
              uri: data.directInAppUrl,
            },
          },
          // 第二列/灰底半版：✏️ 記帳 | ⏰ 記帳鬧鐘 (加入鬧鐘按鈕)
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'secondary',
                color: '#E7E5E4',
                height: 'sm',
                action: {
                  type: 'message',
                  label: '✏️ 記帳',
                  text: '記帳',
                },
                flex: 1,
              },
              {
                type: 'button',
                style: 'secondary',
                color: '#E7E5E4',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '⏰ 記帳鬧鐘',
                  data: 'action=alarm_settings',
                  displayText: '⏰ 記帳鬧鐘設定',
                },
                flex: 1,
              },
            ],
          },
          // 第三列/淺灰滿版：🔄 修改上一筆
          {
            type: 'button',
            style: 'secondary',
            color: '#F5F5F4',
            height: 'sm',
            action: {
              type: 'postback',
              label: '🔄 修改上一筆',
              data: 'action=edit_last',
              displayText: '修改上一筆',
            },
          },
        ],
      },
    },
  };
}

// 相容歷史呼叫
export const buildAccountFlexMessage = buildOpenAppFlexMessage;
