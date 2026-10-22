import { collection, doc, getDocs, setDoc, query, where, limit } from 'firebase/firestore';
import { db, cleanForFirestore, isFirestoreQuotaExceeded, markQuotaExceeded } from '../firebase/config';
import { HealthReport, Transaction, SinkingFund } from '../types';
import { getUserExpenseForTransaction, getUserIncomeForTransaction } from '../utils/mathUtils';
import { convertToTWD } from '../utils/formatters';

/**
 * 判定該筆交易是否認列為「生活最終消費支出」科目 (恩格爾係數分母)
 * 依據國際國民經濟會計 (SNA) 標準：嚴格排除非消費性資本配置、金融投資、債務清償與帳戶互轉
 */
export function isLivingConsumptionExpense(tx: Transaction): boolean {
  if (tx.type !== 'expense' || tx.transferPairId) return false;
  const cat = (tx.categoryName || '').toLowerCase().trim();
  const title = (tx.title || '').toLowerCase().trim();
  const catId = (tx.categoryId || '').toLowerCase().trim();

  // 排除資本投資、金融資產配置、貸款本金還款、信用卡繳款等非消費性科目
  const nonConsumptionKeywords = [
    '股票', '證券', '基金', '投資', '理財', '存股', '購屋', '買房', '頭期款',
    '房貸本金', '信貸本金', '貸款本金', '信用卡繳款', '信用卡費', '卡費', '還款',
    '定存', '儲蓄險', '轉帳', '調撥', '保證金', '押金', '所得稅', '牌照稅', '燃料稅',
    '房屋稅', '地價稅', '罰單', '罰鍰'
  ];
  if (nonConsumptionKeywords.some((k) => cat.includes(k) || title.includes(k) || catId.includes(k))) {
    return false;
  }
  return true;
}

/**
 * 判定該筆交易是否認列為「食品與民生飲食消費」科目 (恩格爾係數分子)
 * 依據聯合國農糧組織 (FAO) 與國民經濟會計生活消費支出科目標準
 */
export function isFoodExpenditure(tx: Transaction): boolean {
  if (!isLivingConsumptionExpense(tx)) return false;
  const cat = (tx.categoryName || '').toLowerCase().trim();
  const icon = tx.categoryIcon || '';
  const title = (tx.title || '').toLowerCase().trim();
  const catId = (tx.categoryId || '').toLowerCase().trim();

  // 1. 嚴格排除非人類民生食品開銷 (如毛孩寵物用品、動物飼料、公共事業等)
  const nonFoodKeywords = [
    '寵物', '毛孩', '飼料', '貓砂', '獸醫', '汪汪', '喵喵', '罐罐',
    '水電', '房租', '瓦斯', '保險', '交通', '機票', '油錢', '車資',
    '加油', '停車', '通訊', '電信', '網路費', '管理費', '維修', '看診', '醫藥'
  ];
  if (nonFoodKeywords.some((nk) => cat.includes(nk) || title.includes(nk))) {
    return false;
  }

  // 2. 支出類別圖示認列
  const foodIcons = [
    '🍽️', '🍜', '🍱', '☕', '🍔', '🍕', '🍣', '🥗', '🍞', '🥪',
    '🍲', '🍳', '🍰', '🧋', '🍎', '🥩', '🥟', '🍻', '🥢', '🥘',
    '🌭', '🍟', '🍩', '🍨', '🍶', '🍷', '🍺', '🍵', '🥤', '🧃',
    '🍙', '🍤', '🎂', '🍦', '🍇', '🍉', '🍌', '🍍', '🍓', '🍒',
    '🥑', '🥕', '🌽', '🥐', '🥞', '🧇', '🥓', '🍗', '🍫', '🍬',
    '🍭', '🍮', '🍯', '🍼', '🍢', '🍡', '🍥', '🥮', '🧆', '🥣'
  ];
  if (foodIcons.some((i) => icon.includes(i))) return true;

  // 3. 支出科目名稱關鍵字認列
  const foodCatKeywords = [
    '餐飲', '美食', '飲食', '伙食', '外食', '正餐', '早餐', '午餐', '晚餐',
    '下午茶', '宵夜', '點心', '生鮮', '食材', '超市', '食品', '飲料', '咖啡',
    '甜點', '手搖', '水果', '小吃', '麵包', '蔬菜', '肉品', '海鮮', '外帶',
    '聚餐', '便當', '三餐', '飯錢', '糧食', '民生採買', '日常採買', '大餐', '夜市',
    'food', 'dining', 'drink', 'meal', 'cafe', 'restaurant', 'grocery', 'supermarket', 'bakery', 'snack'
  ];
  if (foodCatKeywords.some((k) => cat.includes(k) || catId.includes(k))) return true;

  // 4. 明細標題常用餐飲通路、外送、連鎖店與食品關鍵字認列
  const foodTitleKeywords = [
    '早餐', '午餐', '晚餐', '早午餐', '便當', '飲料', '星巴克', '麥當勞',
    '肯德基', '摩斯', '全聯', '家樂福', '7-11', '全家', '萊爾富', 'ok超商', '美聯社',
    '大潤發', '愛買', '好市多', 'costco', 'uber eats', 'ubereats', 'foodpanda',
    '外送', '外帶', '咖啡', '下午茶', '宵夜', '點心', '聚餐', '吃麵', '吃飯',
    '火鍋', '燒肉', '拉麵', '手搖', '麵包', '買菜', '菜市場', '超市', '爭鮮',
    '壽司', '水餃', '雞排', '牛排', '熱炒', '滷肉飯', '牛肉麵', '自助餐', '義大利麵',
    '漢堡', '披薩', '炸雞', '壽喜燒', '生魚片', '甜點', '蛋糕', '鬆餅', '珍奶',
    '珍珠奶茶', '手搖杯', '路易莎', 'cama', '八方雲集', '大埔鐵板燒', '壽司郎',
    '藏壽司', '鼎泰豐', '春水堂', '瓦城', '乾杯', '胡同', '屋馬', '海底撈'
  ];
  if (foodTitleKeywords.some((k) => title.includes(k))) return true;

  // 5. 標題包含餐飲核心動詞/食材字元判定 (如 "吃xx", "喝xx", "xx飯", "xx麵", "xx湯")
  if (/(吃|喝|餐|飯|麵|肉|菜|茶|酒|冰|湯|蛋|奶|鍋|燒|堡|排|魚|蝦|餅)/.test(title)) {
    return true;
  }

  return false;
}

/**
 * 財務健檢 (後端代理端點，嚴禁生物、生理、醫學比喻，強制採用經濟學與會計學專業術語)
 */
export async function generateFinancialHealthReport(
  userId: string,
  userName: string,
  userAvatar: string,
  transactions: Transaction[],
  sinkingFunds: SinkingFund[],
  targetMonth: string,
  customApiKey?: string
): Promise<HealthReport> {
  const currentMonthTxs = transactions.filter(
    (t) => t.date.startsWith(targetMonth) && !t.deletedAt
  );

  // 精算個人實質收入 (排除他人代墊，折算 TWD)
  const totalIncome = currentMonthTxs
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + convertToTWD(getUserIncomeForTransaction(t, userId), t.currency), 0);

  // 精算個人生活最終消費支出 (嚴格依據 SNA 標準：排除金融資本配置、信用卡還款、貸款本金等非消費科目，折算 TWD)
  const totalLivingExpense = currentMonthTxs
    .filter((t) => isLivingConsumptionExpense(t))
    .reduce((acc, t) => acc + convertToTWD(getUserExpenseForTransaction(t, userId), t.currency), 0);

  // 精算個人生活總支出 (排除內部互轉 transferPairId，用於個人資產損益表自由現金流)
  const totalExpense = currentMonthTxs
    .filter((t) => t.type === 'expense' && !t.transferPairId)
    .reduce((acc, t) => acc + convertToTWD(getUserExpenseForTransaction(t, userId), t.currency), 0);

  // 精算個人食品飲食民生剛需支出 (折算 TWD)
  const foodExpense = currentMonthTxs
    .filter((t) => isFoodExpenditure(t))
    .reduce((acc, t) => acc + convertToTWD(getUserExpenseForTransaction(t, userId), t.currency), 0);

  // 恩格爾係數 (Engel's coefficient): 食品消費支出佔個人生活最終消費支出的比重
  // 依據經濟學標準：以實質生活消費支出 (Living Consumption) 為分母
  // 當總支出為 0 時，係數嚴格為 0% (避免無消費時虛假顯示預設值)
  const effectiveDenominator = totalLivingExpense > 0 ? totalLivingExpense : totalExpense;
  const safeFoodExpense = Math.min(effectiveDenominator, foodExpense);
  const engelCoefficient =
    effectiveDenominator > 0 ? Math.min(100, Math.round((safeFoodExpense / effectiveDenominator) * 100)) : 0;

  // 固定支出占比 (Fixed expense ratio) - 排除固定收入，精算月度均攤固定支出
  const monthlySinkingTotal = sinkingFunds
    .filter((s) => !s.deletedAt && s.type !== 'income')
    .reduce((acc, s) => {
      const divisor = s.cycle === 'yearly' ? 12 : s.cycle === 'semi_annually' ? 6 : s.cycle === 'quarterly' ? 3 : 1;
      return acc + (s.targetAmount / divisor);
    }, 0);

  const fixedExpenseRatio =
    totalIncome > 0
      ? Math.round((monthlySinkingTotal / totalIncome) * 100)
      : Math.round((monthlySinkingTotal / (totalExpense || 1)) * 100);

  // 儲蓄資本累積健康度 (Capital accumulation efficiency)
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  let score = 75;
  if (savingsRate > 25) score += 15;
  else if (savingsRate < 0) score -= 25;

  if (engelCoefficient > 45) score -= 10;
  if (fixedExpenseRatio > 50) score -= 10;
  score = Math.max(30, Math.min(98, score));

  let savingsHealthEvaluation = '資本儲蓄率符合標準會計穩健原則。';
  if (savingsRate >= 30) {
    savingsHealthEvaluation = '高流動性資產積累優異，資本沉澱與儲蓄率顯著高於平均標準。';
  } else if (savingsRate < 0) {
    savingsHealthEvaluation = '本月處於現金流量赤字(入不敷出)狀態，需啟動財務邊界縮減機制。';
  }

  // 依據經濟學標準定義恩格爾消費層級
  const engelTierText =
    engelCoefficient === 0
      ? '無食品消費紀錄'
      : engelCoefficient < 20
      ? '富裕型消費結構 (食品剛需佔比低於20%，資本彈性極佳)'
      : engelCoefficient <= 30
      ? '寬裕型消費結構 (恩格爾比重適中，兼顧品質與資產配置)'
      : engelCoefficient <= 40
      ? '小康型消費結構 (符合現代都會標準生活開銷水平)'
      : engelCoefficient <= 50
      ? '溫飽型消費結構 (民生餐飲剛需佔比偏高，建議控管外食邊界)'
      : '高剛需承壓結構 (恩格爾係數逾50%，維生飲食佔據多數開支)';

  // 預設純會計學分析文案 (禁止任何生物比喻)
  let summary = `本週期淨現金流量為 ${netSavings >= 0 ? '+' : ''}${netSavings.toLocaleString()}。恩格爾係數為 ${engelCoefficient}% (${engelTierText})，固定支出資本佔比為 ${fixedExpenseRatio}%。`;
  let recommendations = [
    '維持定期儲蓄投資計劃，將自由現金流沉澱至專屬專款帳戶。',
    '嚴格控管非必要之彈性消費邊界，以優化個人資產負債表結構。',
  ];

  // 【後端代理鐵律】：絕對禁止前端直接呼叫 Gemini API，發送至後端 /api/gemini/health-check
  try {
    const res = await fetch('/api/gemini/health-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        metrics: {
          totalIncome,
          totalExpense,
          netSavings,
          savingsRate,
          engelCoefficient,
          fixedExpenseRatio,
          score,
        },
        customApiKey,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.analysis) {
      if (data.analysis.summary) summary = data.analysis.summary;
      if (Array.isArray(data.analysis.recommendations) && data.analysis.recommendations.length > 0) {
        recommendations = data.analysis.recommendations;
      }
    } else {
      console.warn('[AI Financial Analysis Proxy Notice]:', data.error || res.statusText);
      if (data.error) {
        summary = `${summary}\n(※ ${data.error})`;
      }
    }
  } catch (err) {
    console.warn('[AI Financial Health Check Network Notice]:', err);
  }

  const id = `report_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const report: HealthReport = {
    id,
    userId,
    userName,
    userAvatar,
    score,
    engelCoefficient,
    fixedExpenseRatio,
    savingsHealthEvaluation,
    summary,
    recommendations,
    month: targetMonth,
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'healthReports', id), cleanForFirestore(report));
  return report;
}

export async function getUserHealthReports(userId: string): Promise<HealthReport[]> {
  try {
    const q = query(collection(db, 'healthReports'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const reports = snap.docs.map((d) => d.data() as HealthReport);
    return reports.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

// 5 分鐘記憶體快取
let memoryHealthReports: { timestamp: number; data: HealthReport[] } | null = null;

/**
 * 總管理員專屬：調閱全體會員機密財務健檢存檔報告
 */
export async function getAllArchivedHealthReports(): Promise<HealthReport[]> {
  if (memoryHealthReports && Date.now() - memoryHealthReports.timestamp < 5 * 60 * 1000) {
    return memoryHealthReports.data;
  }
  if (isFirestoreQuotaExceeded()) {
    return memoryHealthReports?.data || [];
  }
  try {
    const snap = await getDocs(query(collection(db, 'healthReports'), limit(50)));
    const reports = snap.docs.map((d) => d.data() as HealthReport);
    const sorted = reports.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    memoryHealthReports = { timestamp: Date.now(), data: sorted };
    return sorted;
  } catch (err: any) {
    if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
    return memoryHealthReports?.data || [];
  }
}
