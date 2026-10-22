import { doc, getDoc, collection, writeBatch } from 'firebase/firestore';
import { db, cleanForFirestore } from '../firebase/config';
import { BatchTransactionItem, PendingBatch, Transaction, AssetAccount } from '../types';
import { getAppBaseUrl, getLiffId } from '../utils/urlUtils';
import { UserAppContext } from './lineNlpParser';
import { getValidGeminiApiKey, getCandidateGeminiApiKeys } from './geminiService';
import { GoogleGenAI } from '@google/genai';
import { getPendingBatch, removePendingBatch, savePendingBatch } from './lineStateManager';

/**
 * 智慧偵測文字是否屬於大量/批量記帳文字
 */
export function detectIsBatchFinancialText(text: string): boolean {
  const clean = text.trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. 若超過 2 行，且其中至少 2 行包含數字與記帳特徵 (例如日期或品名+金額)
  if (lines.length >= 2) {
    let financialLineCount = 0;
    for (const line of lines) {
      if (/\d+/.test(line) && (/(元|塊|\$|NT|TWD|餐|飲|車|費|加油|全聯|買|超商)/i.test(line) || /\d+[/月.-]\d+/.test(line))) {
        financialLineCount++;
      }
    }
    if (financialLineCount >= 2) return true;
  }

  // 2. 單行但包含多個日期 (例如 9/13 晚餐 60 9/14 早餐 50)
  const dateMatches = clean.match(/\b\d{1,2}[/月.-]\d{1,2}[日號]?/g);
  if (dateMatches && dateMatches.length >= 2) {
    return true;
  }

  // 3. 單行但包含多個連續「品名+金額」組合 (例如 早餐55元 午餐140元 咖啡55)
  const itemAmountMatches = clean.match(/[\u4e00-\u9fa5a-zA-Z]{1,10}\s*\d{1,7}\s*(?:元|塊)?/g);
  if (itemAmountMatches && itemAmountMatches.length >= 3) {
    return true;
  }

  return false;
}

/**
 * 高精度本地兜底解析引擎 (純程式碼解析，防止大模型連線超時)
 */
export function parseBatchTransactionsLocally(
  text: string,
  defaultYear: number = new Date().getFullYear()
): BatchTransactionItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: BatchTransactionItem[] = [];
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  let currentDate = todayStr;
  let idCounter = 1;

  for (const line of lines) {
    let remLine = line;
    // 檢查行首日期：例如 9/13, 10/01, 2026-09-13, 9月13日
    const dateMatch = remLine.match(/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[/月.-]\d{1,2}[日號]?)/);
    if (dateMatch) {
      const dStr = dateMatch[1];
      remLine = remLine.slice(dStr.length).trim();
      if (dStr.includes('-') && dStr.length >= 8) {
        currentDate = dStr;
      } else {
        const mParts = dStr.match(/(\d{1,2})[/月.-](\d{1,2})/);
        if (mParts) {
          const m = mParts[1].padStart(2, '0');
          const d = mParts[2].padStart(2, '0');
          currentDate = `${defaultYear}-${m}-${d}`;
        }
      }
    }

    if (!remLine) continue;

    // 正規化行內項目切分：在「數字+元/塊」與其後緊接的「文字品名」之間補齊空格，防止無空格連字
    let normalized = remLine.replace(/([0-9]+)\s*([元塊])\s*([^\s0-9]+)/g, '$1$2 $3');

    // 針對「品名+金額」緊貼的情境 (例如 悠遊卡35元)
    normalized = normalized.replace(/([^\s0-9]+)\s*([0-9]+)\s*([元塊])?/g, ' $1 $2$3 ');

    const tokens = normalized.split(/[\s,，、]+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length) {
      const cur = tokens[i];

      // 檢查是否為「金額品名倒裝」 (例如 755元高鐵費)
      const mAmountFirst = cur.match(/^(\d+(?:\.\d+)?)\s*(?:元|塊)?([^\s\d]+)$/);
      if (mAmountFirst) {
        const amt = parseFloat(mAmountFirst[1]);
        const title = mAmountFirst[2].trim();
        const type: 'expense' | 'income' = /貼|收入|退款|薪水|獎金/i.test(title) ? 'income' : 'expense';
        items.push({
          id: `item_${idCounter++}`,
          date: currentDate,
          title: title || '日常消費',
          amount: amt,
          type,
          category: inferCategoryFromTitle(title, type),
          isIgnored: amt === 0,
        });
        i++;
        continue;
      }

      // 檢查是否當前 token 是純數字，且後一個 token 是品名 (例如 755 高鐵費)
      if (/^\d+(?:\.\d+)?(?:元|塊)?$/.test(cur) && i + 1 < tokens.length && !/^\d+/.test(tokens[i + 1])) {
        const amt = parseFloat(cur.replace(/[元塊]/g, ''));
        const title = tokens[i + 1].trim();
        const type: 'expense' | 'income' = /貼|收入|退款|薪水|獎金/i.test(title) ? 'income' : 'expense';
        items.push({
          id: `item_${idCounter++}`,
          date: currentDate,
          title: title || '日常消費',
          amount: amt,
          type,
          category: inferCategoryFromTitle(title, type),
          isIgnored: amt === 0,
        });
        i += 2;
        continue;
      }

      // 檢查是否當前 token 是品名，且下一個 token 是純數字 (例如 術科練習費 6000元)
      if (!/^\d+/.test(cur) && i + 1 < tokens.length && /^\d+(?:\.\d+)?(?:元|塊)?$/.test(tokens[i + 1])) {
        const title = cur.trim();
        const amt = parseFloat(tokens[i + 1].replace(/[元塊]/g, ''));
        const type: 'expense' | 'income' = /貼|收入|退款|薪水|獎金/i.test(title) ? 'income' : 'expense';
        items.push({
          id: `item_${idCounter++}`,
          date: currentDate,
          title: title || '日常消費',
          amount: amt,
          type,
          category: inferCategoryFromTitle(title, type),
          isIgnored: amt === 0,
        });
        i += 2;
        continue;
      }

      // 單一 token 內含品名與金額 (例如 晚餐60元 或 咖啡55)
      const mInline = cur.match(/^([^\d]+)\s*(\d+(?:\.\d+)?)\s*(?:元|塊)?$/);
      if (mInline) {
        const title = mInline[1].trim();
        const amt = parseFloat(mInline[2]);
        const type: 'expense' | 'income' = /貼|收入|退款|薪水|獎金/i.test(title) ? 'income' : 'expense';
        items.push({
          id: `item_${idCounter++}`,
          date: currentDate,
          title: title || '日常消費',
          amount: amt,
          type,
          category: inferCategoryFromTitle(title, type),
          isIgnored: amt === 0,
        });
        i++;
        continue;
      }

      // 孤立 0元 (例如 0元)
      if (/^0(?:元|塊)?$/.test(cur)) {
        items.push({
          id: `item_${idCounter++}`,
          date: currentDate,
          title: '無支出',
          amount: 0,
          type: 'expense',
          category: '其他雜支',
          isIgnored: true,
        });
        i++;
        continue;
      }

      i++;
    }
  }

  return items;
}

/**
 * 依據品名自動推測分類 (精準對齊台灣會計生活分類)
 */
export function inferCategoryFromTitle(title: string, type: 'expense' | 'income' = 'expense'): string {
  if (type === 'income') {
    if (/薪|底薪|本薪|全勤|加給/.test(title)) return '正職薪資';
    if (/獎金|年終|分紅|業績/.test(title)) return '獎金津貼';
    if (/貼|親友|紅包|長輩|餽贈/.test(title)) return '親友餽贈';
    if (/股|利息|股息|理財|基金/.test(title)) return '投資理財';
    return '其他收入';
  }

  if (/早|午|晚|中餐|晚餐|早餐|午餐|飯|麵|便當|火鍋|肉|牛|豬|烤|魚|菜|湯|排|麥當勞|肯德基|摩斯|漢堡|壽司|拉麵|宵夜|飲料|茶|咖啡|奶茶|手搖|水|礦泉水|豆花|布丁|點心|甜點|麵包|蛋撻/.test(title)) {
    return '餐飲美食';
  }
  if (/高鐵|火車|捷運|公車|ubike|uber|計程車|車票|客運|悠遊卡|一卡通|飛機|機票/.test(title)) {
    return '交通運輸';
  }
  if (/加油|停車|洗車|保養|輪胎|機油|過路費|etc|驗車|維修/.test(title)) {
    return '汽機車輛';
  }
  if (/全聯|家樂福|大潤發|好市多|超市|日用品|毛巾|牙膏|衛生紙|洗衣精|垃圾袋|生活/.test(title)) {
    return '居家生活';
  }
  if (/學費|補習|課程|書籍|書|文具|列印|影印|練習費|考照|檢定|考試|講座/.test(title)) {
    return '學習進修';
  }
  if (/出遊|玩|門票|展覽|電影|遊戲|ktv|酒吧|羽球|運動|健身|打球|桌遊|露營/.test(title)) {
    return '休閒娛樂';
  }
  if (/住宿|飯店|民宿|旅館|機票|行程|渡假|溫泉/.test(title)) {
    return '旅遊渡假';
  }
  if (/診所|掛號|藥|看病|醫院|頭皮|牙醫|醫美|保健品|口罩/.test(title)) {
    return '醫療健康';
  }
  if (/衣服|褲|鞋|包|外套|飾品|美妝|保養品|化妝/.test(title)) {
    return '購物服飾';
  }

  return '其他雜支';
}

/**
 * 呼叫 Gemini AI 逐筆解析大量文字，並自動對齊用戶的真實分類、錢包與帳本
 */
export async function parseBatchTransactionsWithGemini(
  text: string,
  appContext: UserAppContext,
  customApiKey?: string
): Promise<BatchTransactionItem[]> {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);
  const currentYear = parseInt(todayStr.split('-')[0], 10) || now.getFullYear();
  const localItems = parseBatchTransactionsLocally(text, currentYear);

  try {
    const candidateKeys = await getCandidateGeminiApiKeys(customApiKey);
    if (candidateKeys.length === 0) return localItems;

    const userExpenseCats = appContext.categories?.filter((c) => c.type === 'expense').map((c) => c.name) || [];
    const userIncomeCats = appContext.categories?.filter((c) => c.type === 'income').map((c) => c.name) || [];
    const defaultAccName = appContext.accounts?.[0]?.name || '現金皮夾';
    const defaultLedgerName = appContext.ledgers?.[0]?.name || '個人日常帳本';

    const prompt = `你是一位精通台灣日常生活、財務記帳與會計分類的頂尖 AI 助理。
請將使用者輸入的「整段大量流水記帳文字」逐筆解析為標準結構化 JSON 陣列。
基準年份: ${currentYear}年。
基準記帳日期 / 今日日期: ${todayStr}。

【使用者環境分類與設定】：
1. 支出分類：[${userExpenseCats.length ? userExpenseCats.join(', ') : '餐飲美食, 交通運輸, 汽機車輛, 居家生活, 水電瓦斯, 購物服飾, 休閒娛樂, 運動健身, 醫療健康, 學習進修, 數位訂閱, 社交禮金, 旅遊渡假, 毛孩寵物, 保險稅務, 其他雜支'}]
2. 收入分類：[${userIncomeCats.length ? userIncomeCats.join(', ') : '正職薪資, 獎金津貼, 兼職副業, 投資理財, 股息利息, 租金收入, 發票中獎, 親友餽贈, 拍賣出清, 退稅回饋, 其他收入'}]
3. 預設錢包: "${defaultAccName}"
4. 預設帳本: "${defaultLedgerName}"

【關鍵解析與日期規則（極重要）】：
1. 一行若有多筆項目（例如「9/22早餐55元 午餐140元 咖啡55 礦泉水35 停車費20 術科練習費 6000元 晚餐150元」），必須拆分成多筆獨立項目！
2. 日期判斷與預設原則：
   - 若整段文字、整行或某項目「完全沒有提及日期」，其 date 欄位請一律填入今日日期「${todayStr}」（嚴格禁止填入 01-01、1月1日 或其他預設值）！
   - 若日期僅有月/日（例如 9/22 轉為 ${currentYear}-09-22；10/05 轉為 ${currentYear}-10-05；5月3日 轉為 ${currentYear}-05-03）。
   - 日期繼承：若同批後續項目在同一行或未寫日期，必須繼承前一筆或該行的日期；若前一筆也沒有日期，則同樣預設為今日「${todayStr}」。
3. 項目若為 0 元（例如「9/16 0元」），保留該項目但標記 amount 為 0。
4. 收支判斷：一般消費為 'expense'；若為收入、補貼、貼錢（例如「婉琦姐貼300」）則判定為 'income'。
5. 金額與品名倒裝（例如「755元高鐵費」）請正確將 755 設為 amount，品名設為「高鐵費」。
6. 分類 category 必須精準符合上述可用分類。

請嚴格僅回傳 JSON 陣列，例如：
[
  {
    "date": "${todayStr}",
    "title": "早餐",
    "amount": 55,
    "type": "expense",
    "category": "餐飲美食",
    "note": ""
  }
]

待解析大量文字：
${text.trim()}
`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    const textHasJanFirst = /(?:^|[^\d])(?:0?1[/月.-]0?1[日號]?|01-01|01\/01)/.test(text);

    for (const rawKey of candidateKeys) {
      const apiKey = rawKey.replace(/^['"]|['"]$/g, '').trim();
      if (!apiKey) continue;

      const ai = new GoogleGenAI({ apiKey });
      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
          });

          const rawJson = response.text?.trim() || '[]';
          const parsedArray = JSON.parse(rawJson);

          if (Array.isArray(parsedArray) && parsedArray.length > 0) {
            let inheritedDate = todayStr;

            const result: BatchTransactionItem[] = parsedArray.map((p, idx) => {
              const amt = Math.abs(Number(p.amount) || 0);
              const title = String(p.title || '日常支出').trim();
              const type = p.type === 'income' ? 'income' : 'expense';
              const cat = String(p.category || inferCategoryFromTitle(title, type)).trim();

              // 智慧日期繼承與防呆修復：
              // 若模型回傳空、無效日期，或是在原文根本沒有提到 1/1 的情況下回傳 01-01，修正為 inheritedDate 或 todayStr
              let rawDate = (p.date || '').trim();
              let finalDate = todayStr;

              if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                if (rawDate.endsWith('-01-01') && !textHasJanFirst) {
                  finalDate = inheritedDate || todayStr;
                } else {
                  finalDate = rawDate;
                  inheritedDate = rawDate;
                }
              } else if (rawDate && /^\d{1,2}[/月.-]\d{1,2}/.test(rawDate)) {
                const mParts = rawDate.match(/(\d{1,2})[/月.-](\d{1,2})/);
                if (mParts) {
                  finalDate = `${currentYear}-${mParts[1].padStart(2, '0')}-${mParts[2].padStart(2, '0')}`;
                  inheritedDate = finalDate;
                }
              } else {
                finalDate = inheritedDate || todayStr;
              }

              return {
                id: `item_${idx + 1}`,
                date: finalDate,
                title,
                amount: amt,
                type,
                category: cat,
                accountName: defaultAccName,
                ledgerName: defaultLedgerName,
                note: p.note || '',
                isIgnored: amt === 0,
              };
            });

            return result;
          }
        } catch (err: any) {
          console.warn(`[Batch Gemini ${model} Error]:`, err?.message);
        }
      }
    }
  } catch (e: any) {
    console.warn('[parseBatchTransactionsWithGemini Fallback to Local]:', e?.message);
  }

  return localItems;
}

/**
 * 組合並建立待確認的 PendingBatch 實體
 */
export async function createPendingBatchEntity(
  userId: string,
  lineUserId: string,
  userName: string,
  items: BatchTransactionItem[],
  appContext: UserAppContext
): Promise<PendingBatch> {
  const batchId = `pbatch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const defaultAcc = appContext.accounts?.[0];
  const defaultSub = (defaultAcc as any)?.subAccounts?.[0];
  const defaultLedger = appContext.ledgers?.[0];

  const enrichedItems = items.map((item, index) => {
    // 綁定真實分類 ID
    const matchedCat = appContext.categories?.find(
      (c) => c.name === item.category && (item.type ? c.type === item.type : true)
    );
    const categoryId =
      (matchedCat as any)?.id ||
      (item.type === 'income' ? `cat_inc_${userId}_其他收入` : `cat_exp_${userId}_其他雜支`);

    return {
      ...item,
      id: `item_${index + 1}`,
      categoryId,
      accountId: defaultAcc?.id,
      subAccountId: defaultSub?.id,
      accountName: defaultAcc?.name || item.accountName || '現金皮夾',
      ledgerId: defaultLedger?.id,
      ledgerName: defaultLedger?.name || item.ledgerName || '個人日常帳本',
    };
  });

  const validItems = enrichedItems.filter((i) => !i.isIgnored && i.amount > 0);
  const zeroItems = enrichedItems.filter((i) => i.isIgnored || i.amount === 0);

  const totalExpense = validItems
    .filter((i) => i.type === 'expense')
    .reduce((sum, i) => sum + i.amount, 0);

  const totalIncome = validItems
    .filter((i) => i.type === 'income')
    .reduce((sum, i) => sum + i.amount, 0);

  const dates = validItems.map((i) => i.date).filter(Boolean).sort();
  const dateRange =
    dates.length > 0
      ? dates[0] === dates[dates.length - 1]
        ? dates[0]
        : `${dates[0]} ~ ${dates[dates.length - 1]}`
      : '今日';

  const batch: PendingBatch = {
    id: batchId,
    userId,
    lineUserId,
    userName,
    items: enrichedItems,
    totalExpense,
    totalIncome,
    validCount: validItems.length,
    zeroCount: zeroItems.length,
    dateRange,
    createdAt: new Date().toISOString(),
    status: 'PENDING',
  };

  await savePendingBatch(batch);
  return batch;
}

/**
 * 產生批量記帳專屬的 LINE Flex Message 核對總表
 */
export function buildBatchSummaryFlexMessage(
  batch: PendingBatch,
  appUrl: string,
  liffId?: string
): any {
  const validItems = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
  const previewItems = validItems.slice(0, 6);
  const resolvedLiffId = getLiffId(liffId);
  const editUri = resolvedLiffId
    ? `https://liff.line.me/${resolvedLiffId}?openModal=batch&bid=${batch.id}`
    : `${getAppBaseUrl(appUrl)}?openModal=batch&bid=${batch.id}`;

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      backgroundColor: '#1E293B',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '📦 批量記帳智慧辨識結果',
              weight: 'bold',
              color: '#38BDF8',
              size: 'md',
              flex: 1,
            },
            {
              type: 'text',
              text: `共 ${batch.validCount} 筆`,
              weight: 'bold',
              color: '#F8FAFC',
              size: 'xs',
              align: 'end',
            },
          ],
        },
        {
          type: 'text',
          text: `涵蓋區間：${batch.dateRange}`,
          color: '#94A3B8',
          size: 'xxs',
          margin: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      backgroundColor: '#FFFFFF',
      contents: [
        // 總支出與總收入儀表板
        {
          type: 'box',
          layout: 'horizontal',
          backgroundColor: '#F8FAFC',
          cornerRadius: 'md',
          paddingAll: 'md',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              contents: [
                {
                  type: 'text',
                  text: '總支出',
                  size: 'xxs',
                  color: '#64748B',
                  weight: 'bold',
                },
                {
                  type: 'text',
                  text: `NT$ ${batch.totalExpense.toLocaleString()}`,
                  size: 'sm',
                  color: '#EF4444',
                  weight: 'bold',
                  margin: 'xs',
                },
              ],
            },
            {
              type: 'separator',
              margin: 'md',
            },
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              margin: 'md',
              contents: [
                {
                  type: 'text',
                  text: '總收入',
                  size: 'xxs',
                  color: '#64748B',
                  weight: 'bold',
                },
                {
                  type: 'text',
                  text: `NT$ ${batch.totalIncome.toLocaleString()}`,
                  size: 'sm',
                  color: '#10B981',
                  weight: 'bold',
                  margin: 'xs',
                },
              ],
            },
          ],
        },

        // 0 元過濾提醒 (若有)
        ...(batch.zeroCount > 0
          ? [
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                contents: [
                  {
                    type: 'text',
                    text: `💡 提示：系統已自動替您排除 ${batch.zeroCount} 筆 0 元項目`,
                    size: 'xxs',
                    color: '#F59E0B',
                    weight: 'bold',
                  },
                ],
              },
            ]
          : []),

        // 精選明細一覽清單 (前 6 筆代表)
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '📋 明細摘要預覽 (部分列出)：',
              size: 'xs',
              color: '#334155',
              weight: 'bold',
            },
            ...previewItems.map((item, idx) => ({
              type: 'box',
              layout: 'horizontal',
              alignItems: 'center',
              contents: [
                {
                  type: 'text',
                  text: `${idx + 1}. ${item.date.slice(5)} ${item.title}`,
                  size: 'xxs',
                  color: '#475569',
                  flex: 3,
                  maxLines: 1,
                },
                {
                  type: 'text',
                  text: `${item.type === 'income' ? '+' : '-'}$${item.amount.toLocaleString()}`,
                  size: 'xxs',
                  color: item.type === 'income' ? '#059669' : '#DC2626',
                  weight: 'bold',
                  align: 'end',
                  flex: 2,
                },
                {
                  type: 'text',
                  text: item.category,
                  size: 'xxs',
                  color: '#94A3B8',
                  align: 'end',
                  flex: 2,
                },
              ],
            })),
            ...(validItems.length > 6
              ? [
                  {
                    type: 'text',
                    text: `... 其餘尚有 ${validItems.length - 6} 筆明細，點選下方按鈕可查看/編輯全部`,
                    size: 'xxs',
                    color: '#94A3B8',
                    align: 'center',
                    margin: 'sm',
                  },
                ]
              : []),
          ],
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
            label: `✅ 一鍵全部確認入帳 (${batch.validCount}筆)`,
            data: `action=batch_confirm_all&bid=${batch.id}`,
            displayText: '✅ 一鍵全部確認入帳',
          },
        },
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: {
            type: 'uri',
            label: '📱 進入軟體編輯 ',
            uri: editUri,
          },
        },
        {
          type: 'button',
          style: 'secondary',
          height: 'sm',
          action: {
            type: 'postback',
            label: '👀 聊天室查清單 (逐筆核對)',
            data: `action=batch_view_list&bid=${batch.id}&page=1`,
            displayText: '查看逐筆清單',
          },
        },
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          color: '#94A3B8',
          action: {
            type: 'postback',
            label: '🗑️ 放棄本次輸入',
            data: `action=batch_cancel&bid=${batch.id}`,
            displayText: '取消批量記帳',
          },
        },
      ],
    },
  };
}

/**
 * 產生批量記帳專屬的 LINE 快捷狀態機 (Quick Reply 按鈕列)
 */
export function buildBatchQuickReply(
  batchId: string,
  validCount: number,
  appUrl: string,
  currentPage: number = 1,
  totalPages: number = 1,
  liffId?: string
): any {
  const resolvedLiffId = getLiffId(liffId);
  const editUri = resolvedLiffId
    ? `https://liff.line.me/${resolvedLiffId}?openModal=batch&bid=${batchId}`
    : `${getAppBaseUrl(appUrl)}?openModal=batch&bid=${batchId}`;

  const items: any[] = [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: `✅ 全數入帳 (${validCount}筆)`,
        data: `action=batch_confirm_all&bid=${batchId}`,
        displayText: '✅ 一鍵全部確認入帳',
      },
    },
    {
      type: 'action',
      action: {
        type: 'uri',
        label: '📱 逐筆快速編輯',
        uri: editUri,
      },
    },
  ];

  if (totalPages > 1 && currentPage < totalPages) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: `📄 下一頁 (${currentPage + 1}/${totalPages})`,
        data: `action=batch_view_list&bid=${batchId}&page=${currentPage + 1}`,
        displayText: '下一頁',
      },
    });
  }

  if (totalPages > 1 && currentPage > 1) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: `📄 上一頁 (${currentPage - 1}/${totalPages})`,
        data: `action=batch_view_list&bid=${batchId}&page=${currentPage - 1}`,
        displayText: '上一頁',
      },
    });
  }

  items.push({
    type: 'action',
    action: {
      type: 'postback',
      label: '🗑️ 放棄批量記帳',
      data: `action=batch_cancel&bid=${batchId}`,
      displayText: '取消批量記帳',
    },
  });

  return { items };
}

/**
 * 產生聊天室文字版逐筆清單 (含分頁與修改指示)
 */
export function buildBatchListTextMessage(batch: PendingBatch, page = 1, pageSize = 15): string {
  const validItems = batch.items.filter((i) => !i.isIgnored && i.amount > 0);
  const totalPages = Math.ceil(validItems.length / pageSize) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = validItems.slice(startIdx, startIdx + pageSize);

  let msg = `📋【批量記帳逐筆核對清單】(第 ${currentPage}/${totalPages} 頁，共 ${validItems.length} 筆)\n\n`;

  pageItems.forEach((item, idx) => {
    const globalIndex = startIdx + idx + 1;
    const sign = item.type === 'income' ? '+' : '-';
    msg += `#${globalIndex} [${item.date.slice(5)}] ${item.title}：${sign}$${item.amount.toLocaleString()} (${item.category})\n`;
  });

  msg += `\n💬 【如需要修改】：\n• 直接點擊進入軟體修改\n• 確認無誤請回傳「全部入帳」即可儲存！`;

  if (currentPage < totalPages) {
    msg += `\n\n👉 輸入「下一頁」可查看第 ${currentPage + 1} 頁`;
  }

  return msg;
}

/**
 * 執行批量入帳：利用 Firestore writeBatch 一次性原子寫入所有交易並同步更新錢包餘額
 */
export async function commitBatchTransactions(
  batchId: string,
  userId: string
): Promise<{
  success: boolean;
  insertedCount: number;
  totalExpense: number;
  totalIncome: number;
  error?: string;
}> {
  try {
    const batchData = await getPendingBatch(batchId);
    if (!batchData || batchData.status !== 'PENDING') {
      return { success: false, insertedCount: 0, totalExpense: 0, totalIncome: 0, error: '該批次資料已過期或已入帳' };
    }

    const validItems = batchData.items.filter((i) => !i.isIgnored && i.amount > 0);
    if (validItems.length === 0) {
      await removePendingBatch(batchId);
      return { success: true, insertedCount: 0, totalExpense: 0, totalIncome: 0 };
    }

    // 撈取使用者真實預設資產帳戶
    let defaultAcc: AssetAccount | null = null;
    let defaultAccId = validItems[0].accountId;
    if (defaultAccId) {
      const snap = await getDoc(doc(db, 'assetAccounts', defaultAccId));
      if (snap.exists()) {
        defaultAcc = snap.data() as AssetAccount;
      }
    }

    // 若無預設帳戶，撈取第一個資產帳戶
    if (!defaultAcc) {
      try {
        const { getUserAssetAccounts } = await import('./walletService');
        const accounts = await getUserAssetAccounts(userId);
        if (accounts && accounts.length > 0) {
          defaultAcc = accounts[0];
          defaultAccId = defaultAcc.id;
        }
      } catch {}
    }

    // 計算總淨額變動以同步更新錢包餘額
    let netBalanceDelta = 0;
    const nowIso = new Date().toISOString();

    // 分批使用 Firestore writeBatch (每次上限 400 筆)
    const BATCH_SIZE = 400;
    for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
      const chunk = validItems.slice(i, i + BATCH_SIZE);
      const fsBatch = writeBatch(db);

      for (const item of chunk) {
        const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const delta = item.type === 'income' ? item.amount : -item.amount;
        netBalanceDelta += delta;

        const tx: Transaction = {
          id: txId,
          userId,
          payerId: userId,
          payerName: batchData.userName || '本人',
          title: item.title,
          amount: item.amount,
          currency: 'TWD',
          type: item.type,
          categoryId: item.categoryId || (item.type === 'income' ? `cat_inc_${userId}_其他收入` : `cat_exp_${userId}_其他雜支`),
          categoryName: item.category,
          accountId: defaultAccId || 'acc_cash_default',
          subAccountId: item.subAccountId || defaultAcc?.subAccounts?.[0]?.id,
          ledgerId: item.ledgerId || 'ledger_personal_default',
          date: item.date,
          note: item.note || '批量文字極速記帳匯入',
          createdAt: nowIso,
          deletedAt: null,
        };

        fsBatch.set(doc(db, 'transactions', txId), cleanForFirestore(tx));
      }

      await fsBatch.commit();
    }

    // 更新帳戶餘額
    if (defaultAcc) {
      const accRef = doc(db, 'assetAccounts', defaultAcc.id);
      const newBalance = (defaultAcc.balance || 0) + netBalanceDelta;
      let subAccounts = defaultAcc.subAccounts || [];
      if (subAccounts.length > 0) {
        subAccounts[0] = {
          ...subAccounts[0],
          balance: (subAccounts[0].balance || 0) + netBalanceDelta,
        };
      }
      await writeBatch(db)
        .update(accRef, cleanForFirestore({ balance: newBalance, subAccounts, updatedAt: nowIso }))
        .commit()
        .catch(() => {});
    }

    // 標記批次完成並刪除暫存
    batchData.status = 'CONFIRMED';
    await removePendingBatch(batchId);

    return {
      success: true,
      insertedCount: validItems.length,
      totalExpense: batchData.totalExpense,
      totalIncome: batchData.totalIncome,
    };
  } catch (err: any) {
    console.error('[commitBatchTransactions Error]:', err);
    return {
      success: false,
      insertedCount: 0,
      totalExpense: 0,
      totalIncome: 0,
      error: err?.message || '批次入帳失敗',
    };
  }
}
