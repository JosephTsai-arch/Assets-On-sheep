import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, cleanForFirestore } from '../firebase/config';
import { TourStep, TourTopicId, UserTourProgress } from '../types';

export interface TourTopicConfig {
  id: TourTopicId;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  color: string;
  description: string;
  stepsCount: number;
}

export const TOUR_TOPIC_CONFIGS: TourTopicConfig[] = [
  {
    id: 'assets',
    title: '資產管理與排程',
    subtitle: '建立身家底氣',
    icon: '💳',
    badge: '基礎必修',
    color: 'from-amber-500 to-orange-600',
    description: '熟悉現金錢包調整、設定飲食分類預算，以及建立房租房貸等固定收支排程。',
    stepsCount: 7,
  },
  {
    id: 'transaction',
    title: '極速與 AI 記帳',
    subtitle: '秒速掌握收支',
    icon: '📝',
    badge: '核心操作',
    color: 'from-emerald-500 to-teal-600',
    description: '親手記錄一筆午餐，並體驗 AI 打字欄「晚餐吃牛排現金250」秒速智慧填單。',
    stepsCount: 4,
  },
  {
    id: 'overview_health',
    title: '總覽、雷達與 AI 健檢',
    subtitle: '看懂財務體質',
    icon: '📊',
    badge: '數據洞察',
    color: 'from-indigo-500 to-purple-600',
    description: '巡禮總覽四大指標卡片、12個月透支雷達圖，並執行 AI 財務健檢解讀報告。',
    stepsCount: 8,
  },
  {
    id: 'split',
    title: '好友與 AA 分帳',
    subtitle: '出遊聚餐不傷感情',
    icon: '🤝',
    badge: '協作平帳',
    color: 'from-blue-500 to-cyan-600',
    description: '開立全新分帳帳本、記錄一筆代墊分帳，並解說一鍵平帳 (Min-Cash-Flow) 神器。',
    stepsCount: 4,
  },
  {
    id: 'line_bot',
    title: 'LINE 機器人對話記帳',
    subtitle: '隨手打字秒入帳',
    icon: '💬',
    badge: '隨手神兵',
    color: 'from-green-500 to-emerald-700',
    description: '對話打字「吃到飽499」、呼叫真實狀態機改信用卡與599元，並完成釘選指引。',
    stepsCount: 6,
  },
];

export const TOUR_STEPS: TourStep[] = [
  // ==================== 主題 1：資產管理 ====================
  {
    id: 'assets_1',
    topicId: 'assets',
    stepNumber: 1,
    totalSteps: 7,
    title: '前往「資產錢包」專區',
    description: '請點擊上方導覽列的【💳 資產錢包】按鈕，帶您查看您的所有實體帳戶、銀行卡與預算水庫。',
    targetSelector: '[data-tour="nav-wallet"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「資產錢包」導覽標籤',
    requiredTab: 'overview',
    autoActionText: '前往錢包',
  },
  {
    id: 'assets_2',
    topicId: 'assets',
    stepNumber: 2,
    totalSteps: 7,
    title: '編輯目前手頭「現金皮夾」',
    description: '看見您的「現金皮夾」了嗎？點擊卡片右上角編輯按鈕，將目前皮夾中的金額更新為真實數字（例如 5,000 元）。',
    targetSelector: '[data-tour="asset-cash-card"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊現金卡片的編輯按鈕',
    requiredTab: 'wallet',
    autoActionText: '示範設定現金',
  },
  {
    id: 'assets_3',
    topicId: 'assets',
    stepNumber: 3,
    totalSteps: 7,
    title: '進入「預算管理」功能表',
    description: '記帳最怕不知不覺花超額！請點擊【預算管理】分頁標籤，為各類別設立消費天花板。',
    targetSelector: '[data-tour="tab-budgets"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「預算管理」分頁',
    requiredTab: 'wallet',
    autoActionText: '切換至預算',
  },
  {
    id: 'assets_4',
    topicId: 'assets',
    stepNumber: 4,
    totalSteps: 7,
    title: '設定本月飲食預算 9,000 元',
    description: '在類別預算清單中，為【餐飲美食】設定預算上限為 9,000 元，小羊會在超支時主動提醒您！',
    targetSelector: '[data-tour="budget-input-section"]',
    placement: 'top',
    actionPrompt: '👉 設定飲食預算為 9,000 元',
    requiredTab: 'wallet',
    autoActionText: '代填飲食預算 9,000 元',
  },
  {
    id: 'assets_5',
    topicId: 'assets',
    stepNumber: 5,
    totalSteps: 7,
    title: '切換至「固定收支排程」',
    description: '每個月都有房租、房貸或薪水要處理？點擊【固定收支排程】，讓系統自動幫您按月均攤與排程！',
    targetSelector: '[data-tour="tab-sinking"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「固定收支排程」',
    requiredTab: 'wallet',
    autoActionText: '查看固定收支',
  },
  {
    id: 'assets_6',
    topicId: 'assets',
    stepNumber: 6,
    totalSteps: 7,
    title: '設定固定支出（房租或房貸）',
    description: '點擊【＋ 新增固定支出】，設定每月 1 號自動扣除房租或房貸 15,000 元，大筆固定支出不再忘記。',
    targetSelector: '[data-tour="btn-add-fixed-expense"]',
    placement: 'left',
    actionPrompt: '👉 點擊「＋ 新增固定支出」',
    requiredTab: 'wallet',
    autoActionText: '示範建立房租支出',
  },
  {
    id: 'assets_7',
    topicId: 'assets',
    stepNumber: 7,
    totalSteps: 7,
    title: '設定固定收入（薪水/被動收入）',
    description: '點擊【＋ 新增固定收入】，設定每月 5 號入帳的薪資 50,000 元，讓未來的現金流預測更加精準！',
    targetSelector: '[data-tour="btn-add-fixed-income"]',
    placement: 'left',
    actionPrompt: '👉 點擊「＋ 新增固定收入」',
    requiredTab: 'wallet',
    autoActionText: '示範建立正職薪資',
  },

  // ==================== 主題 2：記帳功能 ====================
  {
    id: 'tx_1',
    topicId: 'transaction',
    stepNumber: 1,
    totalSteps: 4,
    title: '點擊右上角「記一筆」',
    description: '無論身處哪個頁面，點擊右上角顯眼的【＋ 記一筆】按鈕，隨時隨地 3 秒開啟記帳視窗。',
    targetSelector: '[data-tour="btn-record"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊右上角「＋ 記一筆」按鈕',
    autoActionText: '開啟記帳視窗',
  },
  {
    id: 'tx_2',
    topicId: 'transaction',
    stepNumber: 2,
    totalSteps: 4,
    title: '手動記一筆：午餐 150 元',
    description: '在表單填入項目「午餐」、金額「150」、類別「餐飲美食」，帳戶選定「現金皮夾」，點擊確認入帳！',
    targetSelector: '[data-tour="tx-modal-body"]',
    placement: 'right',
    actionPrompt: '👉 填寫午餐 150 元並儲存',
    interactiveModal: 'transaction',
    autoActionText: '幫我填入午餐 150 元並儲存',
  },
  {
    id: 'tx_3',
    topicId: 'transaction',
    stepNumber: 3,
    totalSteps: 4,
    title: '體驗 AI 智慧解析打字欄',
    description: '重新點開記帳視窗，看頂部的【✨ AI 智慧解析】欄位！只需打口語：「晚餐吃牛排現金250」，AI 就會動態分析！',
    targetSelector: '[data-tour="tx-ai-input-box"]',
    placement: 'bottom',
    actionPrompt: '👉 在輸入框填入「晚餐吃牛排現金250」',
    interactiveModal: 'transaction',
    autoActionText: '填入「晚餐吃牛排現金250」',
  },
  {
    id: 'tx_4',
    topicId: 'transaction',
    stepNumber: 4,
    totalSteps: 4,
    title: '點擊 AI 智慧解析並儲存',
    description: '點擊【✨ AI 智能解析】按鈕，看 AI 如何在一秒內自動勾選金額 250、分類餐飲美食與現金帳戶，點擊儲存完成！',
    targetSelector: '[data-tour="tx-ai-parse-btn"]',
    placement: 'top',
    actionPrompt: '👉 點擊解析並確認儲存',
    interactiveModal: 'transaction',
    autoActionText: '解析並儲存入帳',
  },

  // ==================== 主題 3：總覽、分析、健檢 ====================
  {
    id: 'overview_1',
    topicId: 'overview_health',
    stepNumber: 1,
    totalSteps: 8,
    title: '回到「總覽概況」',
    description: '點擊上方導覽列的【🏠 總覽概況】，這是您個人的財務中樞大腦，帶您一一盤點四大核心資訊卡。',
    targetSelector: '[data-tour="nav-overview"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「總覽概況」',
    requiredTab: 'wallet',
    autoActionText: '前往總覽',
  },
  {
    id: 'overview_2',
    topicId: 'overview_health',
    stepNumber: 2,
    totalSteps: 8,
    title: '卡片 1：全帳戶淨資產總額',
    description: '即時加總現金、銀行帳戶、外幣（自動以當日匯率折算新台幣）與信用卡負債，掌握真實個人總身家。',
    targetSelector: '[data-tour="overview-networth-card"]',
    placement: 'bottom',
    actionPrompt: '👀 檢視全帳戶淨資產折算結果',
    requiredTab: 'overview',
    autoActionText: '看下一張卡片',
  },
  {
    id: 'overview_3',
    topicId: 'overview_health',
    stepNumber: 3,
    totalSteps: 8,
    title: '卡片 2：本月總開銷與收入概況',
    description: '嚴格排除他人的墊付款項，僅精確計算屬於您本人的當月總開銷與總進帳，收支節奏一目瞭然。',
    targetSelector: '[data-tour="overview-monthly-card"]',
    placement: 'bottom',
    actionPrompt: '👀 檢視本月總開銷與收入',
    requiredTab: 'overview',
    autoActionText: '看下一張卡片',
  },
  {
    id: 'overview_4',
    topicId: 'overview_health',
    stepNumber: 4,
    totalSteps: 8,
    title: '卡片 3：本月預算總執行進度',
    description: '視覺化色彩進度條：綠色代表安全、黃色提醒緊繃、紅色發出超支警告，隨時提醒您踩煞車！',
    targetSelector: '[data-tour="overview-budget-card"]',
    placement: 'top',
    actionPrompt: '👀 檢視預算進度條與餘額',
    requiredTab: 'overview',
    autoActionText: '看下一張卡片',
  },
  {
    id: 'overview_5',
    topicId: 'overview_health',
    stepNumber: 5,
    totalSteps: 8,
    title: '卡片 4：共管帳本待收/待付總額',
    description: '與朋友室友出遊聚餐代墊？這裡即時匯總所有未平帳的債務淨額，讓您清楚知道誰該給您錢。',
    targetSelector: '[data-tour="overview-shared-card"]',
    placement: 'top',
    actionPrompt: '👀 檢視共管債務即時淨值',
    requiredTab: 'overview',
    autoActionText: '查看透支雷達',
  },
  {
    id: 'overview_6',
    topicId: 'overview_health',
    stepNumber: 6,
    totalSteps: 8,
    title: '探索「12 個月透支雷達」',
    description: '我們來到錢包的固定收支區，觀看【未來 12 個月資金預測與透支雷達圖】，大額稅金或保費提前 12 個月均攤預警！',
    targetSelector: '[data-tour="overview-radar-card"]',
    placement: 'top',
    actionPrompt: '👀 檢視 12 個月透支雷達預測走勢',
    requiredTab: 'wallet',
    autoActionText: '前往統計分析',
  },
  {
    id: 'overview_7',
    topicId: 'overview_health',
    stepNumber: 7,
    totalSteps: 8,
    title: '切換至「統計分析」專區',
    description: '點擊導覽列【📊 統計分析】，查看分類圓餅佔比、近月收支柱狀走勢與財務健檢存檔。',
    targetSelector: '[data-tour="nav-analytics"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「統計分析」',
    requiredTab: 'wallet',
    autoActionText: '進入統計分析',
  },
  {
    id: 'overview_8',
    topicId: 'overview_health',
    stepNumber: 8,
    totalSteps: 8,
    title: '執行 AI 財務健檢並解讀結果',
    description: '點擊底部【🩺 開始 AI 財務健檢】，系統將依據恩格爾係數、儲蓄率與會計模型生成健康評分與專屬羊羊理財建議！',
    targetSelector: '[data-tour="analytics-health-btn"]',
    placement: 'top',
    actionPrompt: '👉 點擊執行 AI 財務健檢',
    requiredTab: 'analytics',
    autoActionText: '生成健檢報告',
  },

  // ==================== 主題 4：分帳功能 ====================
  {
    id: 'split_1',
    topicId: 'split',
    stepNumber: 1,
    totalSteps: 4,
    title: '前往「好友與 AA 共管」',
    description: '點擊上方導覽列的【🤝 好友與AA共管】，這裡是您與伴侶、室友或出遊夥伴管理共同基金的基地。',
    targetSelector: '[data-tour="nav-collaboration"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「好友與AA共管」',
    requiredTab: 'overview',
    autoActionText: '進入分帳專區',
  },
  {
    id: 'split_2',
    topicId: 'split',
    stepNumber: 2,
    totalSteps: 4,
    title: '建立新的分帳帳本',
    description: '點擊【＋ 建立共管帳本】，輸入名稱「週末小旅行」或「合租公基金」，即可生成專屬成員協作空間。',
    targetSelector: '[data-tour="collab-add-ledger-btn"]',
    placement: 'bottom',
    actionPrompt: '👉 點擊「＋ 建立共管帳本」',
    requiredTab: 'collaboration',
    autoActionText: '示範建立旅行帳本',
  },
  {
    id: 'split_3',
    topicId: 'split',
    stepNumber: 3,
    totalSteps: 4,
    title: '記錄一筆 AA 分帳記帳',
    description: '在共管帳本中記錄一筆代墊聚餐費用，系統會自動在成員間均分，並即時產生成員個別欠款明細。',
    targetSelector: '[data-tour="btn-record"]',
    placement: 'bottom',
    actionPrompt: '👉 記錄一筆 AA 分帳項目',
    requiredTab: 'collaboration',
    autoActionText: '示範記錄分帳 600 元',
  },
  {
    id: 'split_4',
    topicId: 'split',
    stepNumber: 4,
    totalSteps: 4,
    title: '解說與體驗「一鍵平帳」神器',
    description: '點擊【前往平帳中心】，Min-Cash-Flow 演算法會自動計算「誰還誰最少筆」最佳路徑，點擊一鍵平帳自動結清！',
    targetSelector: '[data-tour="collab-settle-btn"]',
    placement: 'top',
    actionPrompt: '👉 查看平帳中心與一鍵平帳',
    requiredTab: 'collaboration',
    autoActionText: '查看平帳中心',
  },

  // ==================== 主題 5：LINE 對話記帳 ====================
  {
    id: 'line_1',
    topicId: 'line_bot',
    stepNumber: 1,
    totalSteps: 6,
    title: '進入 LINE 機器人實戰新手導覽',
    description: '揮別假模擬器！帶您直接進入真實 LINE 官方機器人（@381dzsqt）對話，透過 Webhook 與後端狀態機完成真實記帳！',
    placement: 'center',
    actionPrompt: '👉 點擊開啟真實 LINE 導覽',
    interactiveModal: 'line_real',
    autoActionText: '前往真實 LINE 導覽',
  },
  {
    id: 'line_2',
    topicId: 'line_bot',
    stepNumber: 2,
    totalSteps: 6,
    title: '發送推播與開啟 LINE 對話',
    description: '點擊「啟動導覽並前往 LINE」，後端將透過 Webhook 與 Push Message 發送推播至您的 LINE 聊天室，並開啟官方小幫手。',
    placement: 'center',
    actionPrompt: '👉 啟動導覽並前往 LINE',
    interactiveModal: 'line_real',
    autoActionText: '啟動真實 LINE 導覽',
  },
  {
    id: 'line_3',
    topicId: 'line_bot',
    stepNumber: 3,
    totalSteps: 6,
    title: '在 LINE 聊天室傳送「吃到飽499」',
    description: '在 LINE 對話框輸入「吃到飽499」並送出，後端 NLP 將智慧辨識金額 499 與餐飲分類，並回傳 Golden Layout 確認卡片。',
    placement: 'center',
    actionPrompt: '💬 在 LINE 傳送「吃到飽499」',
    interactiveModal: 'line_real',
    autoActionText: '在 LINE 傳送吃到飽499',
  },
  {
    id: 'line_4',
    topicId: 'line_bot',
    stepNumber: 4,
    totalSteps: 6,
    title: '在卡片點擊【💳 改付款方式】選信用卡',
    description: '在 LINE 互動卡片上點擊【💳 改付款方式】，依引導回傳或點選「信用卡」，狀態機立即將扣款管道切換至信用卡！',
    placement: 'center',
    actionPrompt: '💳 在 LINE 改用信用卡',
    interactiveModal: 'line_real',
    autoActionText: '改用信用卡扣款',
  },
  {
    id: 'line_5',
    topicId: 'line_bot',
    stepNumber: 5,
    totalSteps: 6,
    title: '點擊【💰 修改金額】改為 599 並確認',
    description: '在 LINE 卡片點擊【💰 修改金額】輸入「599」，確認卡片更新後點擊【✅ 確認記帳】，正式寫入個人帳本！',
    placement: 'center',
    actionPrompt: '💰 改 599 並確認記帳',
    interactiveModal: 'line_real',
    autoActionText: '改 599 並確認入帳',
  },
  {
    id: 'line_6',
    topicId: 'line_bot',
    stepNumber: 6,
    totalSteps: 6,
    title: '重要提醒：將機器人設為釘選',
    description: '恭喜完成全套導覽！出門記帳只要在 LINE 傳一句話。建議您在手機 LINE 中長按將【資產上羊】設為「📌 釘選（Pin to Top）」，隨時記帳超神速！',
    placement: 'center',
    actionPrompt: '🎉 完成新手導覽！',
    interactiveModal: 'line_real',
    autoActionText: '完成全套導覽 🎉',
  },
];

/**
 * 取得使用者的新手導覽完成紀錄
 */
export async function fetchUserTourProgress(userId: string): Promise<UserTourProgress> {
  const localKey = `aos_tour_progress_${userId}`;
  let localProgress: UserTourProgress = {
    userId,
    completedTopics: [],
    isFullyCompleted: false,
    updatedAt: new Date().toISOString(),
  };

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localProgress = JSON.parse(raw);
  } catch {}

  try {
    const snap = await getDoc(doc(db, 'user_tour_progress', userId));
    if (snap.exists()) {
      const remote = snap.data() as UserTourProgress;
      const mergedTopics = Array.from(
        new Set([...(localProgress.completedTopics || []), ...(remote.completedTopics || [])])
      );
      const isFullyCompleted = mergedTopics.length >= TOUR_TOPIC_CONFIGS.length;
      const finalProgress: UserTourProgress = {
        userId,
        completedTopics: mergedTopics,
        isFullyCompleted,
        lastActiveTopic: remote.lastActiveTopic || localProgress.lastActiveTopic,
        updatedAt: remote.updatedAt || localProgress.updatedAt,
      };
      localStorage.setItem(localKey, JSON.stringify(finalProgress));
      return finalProgress;
    }
  } catch (err) {
    console.warn('[fetchUserTourProgress warn]:', err);
  }

  return localProgress;
}

/**
 * 標記特定主題已完成
 */
export async function saveUserTourTopicCompleted(
  userId: string,
  topicId: TourTopicId
): Promise<UserTourProgress> {
  const current = await fetchUserTourProgress(userId);
  const updatedTopics = Array.from(new Set([...current.completedTopics, topicId]));
  const isFullyCompleted = updatedTopics.length >= TOUR_TOPIC_CONFIGS.length;

  const newProgress: UserTourProgress = {
    userId,
    completedTopics: updatedTopics,
    isFullyCompleted,
    lastActiveTopic: topicId,
    updatedAt: new Date().toISOString(),
  };

  const localKey = `aos_tour_progress_${userId}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(newProgress));
  } catch {}

  try {
    await setDoc(doc(db, 'user_tour_progress', userId), cleanForFirestore(newProgress), { merge: true });
  } catch (err) {
    console.warn('[saveUserTourTopicCompleted warn]:', err);
  }

  return newProgress;
}

/**
 * 重設特定用戶的導覽進度 (供使用者重複學習體驗)
 */
export async function resetUserTourProgress(userId: string): Promise<UserTourProgress> {
  const fresh: UserTourProgress = {
    userId,
    completedTopics: [],
    isFullyCompleted: false,
    updatedAt: new Date().toISOString(),
  };

  const localKey = `aos_tour_progress_${userId}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(fresh));
  } catch {}

  try {
    await setDoc(doc(db, 'user_tour_progress', userId), cleanForFirestore(fresh));
  } catch (err) {
    console.warn('[resetUserTourProgress warn]:', err);
  }

  return fresh;
}
