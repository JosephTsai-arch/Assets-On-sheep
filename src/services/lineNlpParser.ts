import { GoogleGenAI } from '@google/genai';
import { getValidGeminiApiKey, getCandidateGeminiApiKeys } from './geminiService';

export interface ParsedLineTransaction {
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  title: string;
  category: string;
  isSplit: boolean;
  splitNames: string[];
  splitNote?: string;
  date?: string;
  suggestedAccountName?: string;
  suggestedLedgerName?: string;
  note?: string;
}

export interface UserAppContext {
  categories?: { name: string; type: 'expense' | 'income' }[];
  accounts?: { id: string; name: string; type: string }[];
  ledgers?: { id: string; name: string; isShared: boolean; memberNames?: string[] }[];
  friends?: { id: string; name: string }[];
  todayStr?: string;
}

/**
 * 高精度在地化中文財務自然語言解析引擎 (Chinese Financial NLP Parser)
 * 覆蓋台灣在地生活所有口語單位、多幣別、收支判定、日期識別與細緻會計分類
 */
export function parseChineseFinancialText(text: string): ParsedLineTransaction {
  const clean = text.trim();
  const now = new Date();
  const formatYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // 0. 特殊品牌與單位遮罩保護 (例如 7-11、711、2杯、3個，避免干擾金額提取)
  let textForParsing = clean
    .replace(/7-11|711|seven-eleven|seven eleven/gi, '__BRAND_SEVEN__')
    .replace(/family\s*mart/gi, '__BRAND_FAMILY__');

  // 遮罩明確的品項數量 (例如 2杯、3份、1個)，避免將數量誤認為消費金額
  textForParsing = textForParsing.replace(/(\d+)\s*(杯|個|份|碗|盤|件|本|支|張|罐|瓶|包|盒|顆|串|粒|條|台|輛)/g, '__QTY_$1_$2__');

  // 0.1 日期提取 (支援 今天、昨天、前天、明天、X月X日、X/X、民國年)
  let date = formatYMD(now);
  if (/前天/i.test(clean)) {
    date = formatYMD(new Date(now.getTime() - 2 * 86400000));
  } else if (/昨天|昨日/i.test(clean)) {
    date = formatYMD(new Date(now.getTime() - 86400000));
  } else if (/明天/i.test(clean)) {
    date = formatYMD(new Date(now.getTime() + 86400000));
  } else {
    const rocM = clean.match(/民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日號]?/);
    if (rocM) {
      const ceYear = parseInt(rocM[1], 10) + 1911;
      date = `${ceYear}-${String(rocM[2]).padStart(2, '0')}-${String(rocM[3]).padStart(2, '0')}`;
    } else {
      const fullDateM = clean.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})[日號]?/);
      if (fullDateM) {
        date = `${fullDateM[1]}-${String(fullDateM[2]).padStart(2, '0')}-${String(fullDateM[3]).padStart(2, '0')}`;
      } else {
        const shortDateM = clean.match(/(\d{1,2})[月/.](\d{1,2})[日號]?/);
        if (shortDateM) {
          date = `${now.getFullYear()}-${String(shortDateM[1]).padStart(2, '0')}-${String(shortDateM[2]).padStart(2, '0')}`;
        }
      }
    }
  }

  // 1. 收支類別精準判定
  let type: 'expense' | 'income' = 'expense';
  if (
    /薪水|薪資|底薪|本薪|獎金|年終|分紅|股息|股利|利息|退稅|報銷|退款|收到|轉入|零用錢|兼職|外快|租金收入|租金|賣出|賣掉|賣二手|回饋|現金回饋|發票中獎|收入|入帳/i.test(
      clean
    )
  ) {
    type = 'income';
  }

  // 2. 幣別偵測 (依優先順序嚴謹比對，避免將 $ 或 NT 誤判為美金)
  let currency = 'TWD';
  if (/日幣|日圓|日元|円|jpy|¥/i.test(clean)) {
    currency = 'JPY';
  } else if (/美金|美元|\busd\b/i.test(clean)) {
    currency = 'USD';
  } else if (/歐元|€|\beur\b/i.test(clean)) {
    currency = 'EUR';
  } else if (/人民幣|人民币|\bcny\b|\brmb\b/i.test(clean)) {
    currency = 'CNY';
  } else if (/韓元|韓幣|₩|\bkrw\b/i.test(clean)) {
    currency = 'KRW';
  } else if (/英鎊|£|\bgbp\b/i.test(clean)) {
    currency = 'GBP';
  } else if (/港幣|\bhkd\b/i.test(clean)) {
    currency = 'HKD';
  } else if (/泰銖|泰幣|฿|\bthb\b/i.test(clean)) {
    currency = 'THB';
  } else if (/新幣|新加坡幣|\bsgd\b/i.test(clean)) {
    currency = 'SGD';
  } else if (/澳幣|\baud\b/i.test(clean)) {
    currency = 'AUD';
  } else if (/加幣|\bcad\b/i.test(clean)) {
    currency = 'CAD';
  }

  // 3. 金額提取 (全面支援：1千5, 5萬, 1.5萬, 一萬五, 兩萬三, 5千, 3k, 5w, 8百5, 純數字)
  let amount = 0;

  const parseCnOrArabic = (str: string): number => {
    const dMap: Record<string, number> = {
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    };
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    return dMap[str] || 0;
  };

  // 3.1 複合萬位 (例如: 1萬5, 2萬3, 一萬五, 兩萬三, 3萬5千, 五萬二)
  const compoundWan = textForParsing.match(/([0-9一二兩三四五六七八九十]+)\s*萬\s*([0-9一二兩三四五六七八九])(?:千)?/);
  if (compoundWan) {
    amount = parseCnOrArabic(compoundWan[1]) * 10000 + parseCnOrArabic(compoundWan[2]) * 1000;
  } else {
    // 3.2 複合千位 (例如: 1千5, 2千3, 一千五, 兩千八, 3千5百)
    const compoundQian = textForParsing.match(/([0-9一二兩三四五六七八九]+)\s*千\s*([0-9一二兩三四五六七八九])(?:百)?/);
    if (compoundQian) {
      amount = parseCnOrArabic(compoundQian[1]) * 1000 + parseCnOrArabic(compoundQian[2]) * 100;
    } else {
      // 3.3 複合百位 (例如: 8百5, 八百五, 1百2)
      const compoundBai = textForParsing.match(/([0-9一二兩三四五六七八九]+)\s*百\s*([0-9一二兩三四五六七八九])(?:十)?/);
      if (compoundBai) {
        amount = parseCnOrArabic(compoundBai[1]) * 100 + parseCnOrArabic(compoundBai[2]) * 10;
      } else {
        // 3.4 萬級單位：數字/小數 + 萬 / w / W (例如 5萬, 1.5萬, 5w)
        const wanMatch = textForParsing.match(/(\d+(?:\.\d+)?)\s*(?:萬|w|W)/);
        if (wanMatch) {
          amount = Math.round(parseFloat(wanMatch[1]) * 10000);
        } else {
          // 3.5 中文整數萬：五萬、兩萬、十萬
          const cnWanOnly = textForParsing.match(/([一二兩三四五六七八九十])\s*萬/);
          if (cnWanOnly) {
            amount = parseCnOrArabic(cnWanOnly[1]) * 10000;
          } else {
            // 3.6 千級單位：數字/小數 + 千 / k / K (例如 5千, 3k, 12k, 1.5k)
            const qianMatch = textForParsing.match(/(\d+(?:\.\d+)?)\s*(?:千|k|K)/);
            if (qianMatch) {
              amount = Math.round(parseFloat(qianMatch[1]) * 1000);
            } else {
              // 3.7 中文整數千：三千、五千
              const cnQianOnly = textForParsing.match(/([一二兩三四五六七八九十])\s*千/);
              if (cnQianOnly) {
                amount = parseCnOrArabic(cnQianOnly[1]) * 1000;
              } else {
                // 3.8 百級單位：數字/中文 + 百
                const baiMatch = textForParsing.match(/([0-9一二兩三四五六七八九]+)\s*百/);
                if (baiMatch) {
                  amount = parseCnOrArabic(baiMatch[1]) * 100;
                } else {
                  // 3.9 優先尋找帶有貨幣標記的數字 (例如: 85元, 1500塊, $250, NT$300)
                  const markedMatch = textForParsing.match(/(?:[$¥€£]|NT\$?)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:元|塊|塊錢|NT)/i);
                  if (markedMatch) {
                    amount = parseFloat(markedMatch[1] || markedMatch[2]);
                  } else {
                    // 3.10 一般標準數字格式：優先從遮罩後的文字中提取最後一個純數值 (例如: 7-11 早餐 85 -> 85)
                    const allNums = Array.from(textForParsing.matchAll(/\b(\d+(?:\.\d+)?)\b/g)).map((m) => parseFloat(m[1]));
                    if (allNums.length > 0) {
                      // 若有多個數字，通常取最後一個出現的金額
                      amount = allNums[allNums.length - 1];
                    } else {
                      // 若仍未找到，嘗試直接匹配數字
                      const anyNum = textForParsing.match(/\d+(?:\.\d+)?/);
                      if (anyNum) {
                        amount = parseFloat(anyNum[0]);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 4. 分帳意圖與成員提取 (支援「X人平分」、「跟小美、阿倫分帳」、「與媽媽平分」)
  const splitNames: string[] = [];
  let isSplit = false;

  if (/分帳|平分|拆帳|均分|各付|各半/i.test(clean)) {
    isSplit = true;
  }

  // 檢查「X人平分」
  const multiPersonMatch = clean.match(/([2-9二兩三四五六七八九])\s*人\s*(?:平分|均分|分帳|拆帳)/);
  if (multiPersonMatch) {
    isSplit = true;
    const numMap: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    };
    const count = numMap[multiPersonMatch[1]] || 2;
    for (let i = 1; i < count; i++) {
      splitNames.push(`成員 ${i}`);
    }
  }

  // 檢查「跟/與/和/同 [人名列表] 分帳」
  // 特殊詞彙保護（例如「和牛」、「和風」不應將「和」視為分帳介詞）
  const sanitizedForKeywords = clean
    .replace(/和牛/g, '__WAGYU__')
    .replace(/和風/g, '__WAFU__');

  const splitKeywords = ['跟', '與', '和', '同'];
  for (const kw of splitKeywords) {
    const reg = new RegExp(kw + '([\\u4e00-\\u9fa5a-zA-Z0-9、，\\s]+?)(?:分帳|分|平分|拆帳|均分|算|一起|各付|各半)');
    const match = sanitizedForKeywords.match(reg);
    if (match && match[1]) {
      const rawNames = match[1]
        .replace(/__WAGYU__/g, '和牛')
        .replace(/__WAFU__/g, '和風')
        .split(/[、，, ]+/)
        .filter(Boolean);

      for (const n of rawNames) {
        const cleanN = n.trim();
        // 排除包含金額、數字、幣別或動作詞的雜訊
        if (cleanN && !/\d|日幣|日圓|美金|台幣|元|塊|跟|與|吃|喝|買/.test(cleanN) && cleanN.length <= 10) {
          if (!splitNames.includes(cleanN)) splitNames.push(cleanN);
        }
      }
      isSplit = true;
    }
  }

  // 常見親屬或好友關係偵測
  const commonRelations = ['媽媽', '爸爸', '小美', '阿倫', '老公', '老婆', '女友', '男友', '室友', '同事'];
  for (const rel of commonRelations) {
    if (clean.includes(rel) && (isSplit || clean.includes('跟' + rel) || clean.includes('與' + rel))) {
      if (!splitNames.includes(rel)) splitNames.push(rel);
      isSplit = true;
    }
  }

  // 5. 會計分類情境比對 (精準對齊官方 16 大支出與 11 大收入標準分類，擴充台灣在地高頻關鍵字)
  let category = type === 'income' ? '正職薪資' : '餐飲美食';
  if (
    /水電|電費|水費|瓦斯|天然氣|第四台|網路費|寬頻|市話|中華電信|遠傳|台灣大哥大|台哥大|管理費|房租|房貸|修繕|漏水|水電工|清洗冷氣|清潔費/i.test(clean)
  ) {
    category = '水電瓦斯';
  } else if (
    /加油|92|95|98|柴油|機車|機油|換機油|汽車|汽油|洗車|輪胎|車險|驗車|停車|停車費|etc|悠遊聯名卡|過路費|中油|台塑|保養|修車|強制險|牌照稅|燃料稅/i.test(clean)
  ) {
    category = '汽機車輛';
  } else if (
    /高鐵|捷運|公車|客運|計程車|小黃|uber|yoxi|機票|火車|車票|交通|悠遊卡|一卡通|icash|租車|高鐵票|台鐵|搭車|irent|wemo|goshare|youbike|ubike|客運票/i.test(clean)
  ) {
    category = '交通運輸';
  } else if (
    /netflix|spotify|disney\+?|youtube|yt\s*premium|icloud|apple\s*music|chatgpt|openai|claude|midjourney|google\s*one|playstation|ps\s*plus|ps5|nintendo|switch\s*online|訂閱|月費|會員費|雲端空間/i.test(clean)
  ) {
    category = '數位訂閱';
  } else if (
    /健身|健身房|運動|瑜珈|羽球|籃球|游泳|跑步|教練課|攀岩|重訓|拳擊|皮拉提斯|運動服|運動鞋|蛋白粉|乳清|健身工廠|world\s*gym/i.test(clean)
  ) {
    category = '運動健身';
  } else if (
    /貓|狗|飼料|罐頭|獸醫|寵物|貓砂|結紮|驅蟲|看獸醫|動物醫院|洗澡|寵物美容|肉泥|化毛膏|貓抓板|牽繩|寵物推車|疫苗/i.test(clean)
  ) {
    category = '毛孩寵物';
  } else if (
    /保險|勞保|健保|福委金|地價稅|房屋稅|所得稅|牌照稅|燃料稅|稅|儲蓄險|意外險|壽險|醫療險|產險|防疫險|年金/i.test(clean)
  ) {
    category = '保險稅務';
  } else if (
    /飯店|民宿|機票|住宿|旅遊|渡假|出國|自由行|行程|門票|露營|泡湯|溫泉|行李箱|景點|遊樂園|環球影城|迪士尼|簽證/i.test(clean)
  ) {
    category = '旅遊渡假';
  } else if (
    /紅包|白包|禮金|禮物|送禮|伴手禮|請客|捐款|贊助|喜帖|結婚禮金|奠儀|彌月禮|生日禮物/i.test(clean)
  ) {
    category = '社交禮金';
  } else if (
    /學費|書|買書|誠品|博客來|補習|課程|演講|教育|考試|多益|補習班|講座|教材|線上課|hahow|pressplay|證照|報名費/i.test(clean)
  ) {
    category = '學習進修';
  } else if (
    /看診|掛號|醫生|醫院|診所|藥|健保|自費|醫療|牙醫|洗牙|拔牙|植牙|眼科|皮膚科|中醫|推拿|復健|維他命|保健品|葉黃素|益生菌|魚油|營養食品|醫藥費|藥局|大樹藥局|屈臣氏藥妝|快篩|口罩/i.test(clean)
  ) {
    category = '醫療健康';
  } else if (
    /電影|威秀|國賓|秀泰|新光影城|唱歌|ktv|好樂迪|錢櫃|遊戲|steam|switch|xbox|展覽|娛樂|課金|演唱會|玩具|盲盒|轉蛋|密室逃脫|桌遊|桌球|撞球|遊樂場|湯姆熊/i.test(clean)
  ) {
    category = '休閒娛樂';
  } else if (
    /衣服|褲子|鞋|包|購物|特價|網購|蝦皮|momo|pchome|酷澎|coupang|超商|7-11|711|統一超商|全家|萊爾富|ok超商|全聯|好市多|costco|家樂福|大潤發|愛買|美廉社|屈臣氏|康是美|寶雅|松本清|唐吉訶德|唐吉|muji|無印良品|uniqlo|gu|zara|net|化妝品|保養品|飾品|包包/i.test(clean)
  ) {
    category = '購物服飾';
  } else if (
    /冰箱|冷氣|洗衣機|電視|家電|家具|沙發|床墊|床架|衣櫃|書桌|椅子|修繕|裝潢|吸塵器|除濕機|吹風機|日常用品|家飾|清潔用品|衛生紙|洗衣精|洗碗精|特力屋|ikea|宜得利/i.test(clean)
  ) {
    category = '居家生活';
  } else if (
    /和牛|牛排|吃|喝|午餐|晚餐|早餐|便當|咖啡|星巴克|路易莎|cama|得正|麻古|迷客夏|50嵐|五十嵐|清心|可不可|手搖|飲料|火鍋|拉麵|牛肉麵|壽司|爭鮮|藏壽司|壽喜燒|鐵板燒|麻辣鍋|早午餐|八方雲集|便當店|麥當勞|肯德基|摩斯|漢堡王|披薩|pizza|義大利麵|丼飯|烏龍麵|滷肉飯|燒肉|餐廳|美食|小吃|甜點|宵夜|外送|foodpanda|ubereats/i.test(clean)
  ) {
    category = '餐飲美食';
  } else if (
    /雜支|手續費|影印|其他|雜項/i.test(clean)
  ) {
    category = '其他雜支';
  }

  // 收入細分
  if (type === 'income') {
    if (/年終|獎金|績效|三節|津貼|分紅|加班費/i.test(clean)) {
      category = '獎金津貼';
    } else if (/兼職|外快|副業|接案|稿費|演講費|外送兼差/i.test(clean)) {
      category = '兼職副業';
    } else if (/股票|0050|0056|00878|基金|加密貨幣|比特幣|理財|賣股|獲利|波段/i.test(clean)) {
      category = '投資理財';
    } else if (/股息|配息|利息|定存利息|股利|ETF配息/i.test(clean)) {
      category = '股息利息';
    } else if (/租金|客房租金|房租收入|出租|車位出租/i.test(clean)) {
      category = '租金收入';
    } else if (/發票|中獎|樂透|刮刮樂|對獎/i.test(clean)) {
      category = '發票中獎';
    } else if (/紅包|餽贈|禮金|親友|孝親費/i.test(clean)) {
      category = '親友餽贈';
    } else if (/拍賣|出清|二手|賣出|賣掉|旋轉拍賣/i.test(clean)) {
      category = '拍賣出清';
    } else if (/退稅|現金回饋|點數折抵|回饋金|刷卡回饋|line\s*points/i.test(clean)) {
      category = '退稅回饋';
    } else if (/其他收入|入帳|轉入/i.test(clean)) {
      category = '其他收入';
    } else {
      category = '正職薪資';
    }
  }

  // 6. 標題提取
  let titleWork = clean
    .replace(/7-11|711/gi, '__BRAND_SEVEN__')
    .replace(/和牛/g, '__WAGYU__')
    .replace(/和風/g, '__WAFU__');

  let title = titleWork
    .replace(
      /\d+(?:\.\d+)?\s*(?:萬|千|百|w|W|k|K|元|塊|日幣|日圓|美金|美元|歐元|人民幣|韓元|英鎊|TWD|JPY|USD|EUR|CNY|KRW|GBP)?/gi,
      ''
    )
    .replace(/[0-9一二兩三四五六七八九十]\s*萬(?:[0-9一二兩三四五六七八九]\s*千)?/g, '')
    .replace(/[0-9一二兩三四五六七八九十]\s*千(?:[0-9一二兩三四五六七八九]\s*百)?/g, '')
    .replace(/[0-9一二兩三四五六七八九十]\s*百(?:[0-9一二兩三四五六七八九]\s*十)?/g, '')
    .replace(/[和與跟][\u4e00-\u9fa5a-zA-Z0-9、，\s]+?(?:分帳|分共|分|平分|算|拆帳|均分)/g, '')
    .replace(/[2-9二兩三四五六七八九]\s*人\s*(?:平分|均分|分帳|拆帳)/g, '')
    .replace(/分帳|平分|均分|拆帳|各付|分共|各半/g, '')
    .replace(/今天|今日|昨天|昨日|前天|明天/g, '')
    .replace(/__BRAND_SEVEN__/g, '7-11')
    .replace(/__WAGYU__/g, '和牛')
    .replace(/__WAFU__/g, '和風')
    .replace(/^[、，,\s\-–—]+|[、，,\s\-–—]+$/g, '')
    .trim();

  if (!title) title = clean;
  if (!title) title = category;

  let suggestedAccountName: string | undefined = undefined;
  if (/信用卡|刷卡|卡結帳|visa|mastercard|jcb/i.test(clean)) {
    suggestedAccountName = '信用卡';
  } else if (/現金|皮夾|掏錢|付現|鈔票/i.test(clean)) {
    suggestedAccountName = '現金皮夾';
  } else if (/街口|line\s*pay|電子支付|電支|悠遊/i.test(clean)) {
    suggestedAccountName = '電子錢包';
  } else if (/銀行|轉帳|匯款/i.test(clean)) {
    suggestedAccountName = '玉山銀行';
  }

  return {
    amount,
    currency,
    type,
    title,
    category,
    isSplit,
    splitNames,
    date,
    suggestedAccountName,
  };
}

/**
 * 調用 Gemini API 讓大模型精準進行語意與財務元素解析，並結合帳號環境回填固定模塊 (附帶本地中文 NLP 兜底)
 */
export async function parseLineMessageWithGemini(
  text: string,
  contextOrApiKey?: UserAppContext | string,
  customApiKey?: string
): Promise<ParsedLineTransaction & { reasonIfFallback?: string }> {
  let context: UserAppContext | undefined = undefined;
  let effectiveApiKey = customApiKey;

  if (typeof contextOrApiKey === 'string') {
    effectiveApiKey = contextOrApiKey;
  } else if (contextOrApiKey && typeof contextOrApiKey === 'object') {
    context = contextOrApiKey;
  }

  const cleanText = text.trim();
  const localParsed = parseChineseFinancialText(cleanText);

  const todayStr = context?.todayStr || localParsed.date || new Date().toISOString().split('T')[0];
  const userExpenseCats = context?.categories?.filter((c) => c.type === 'expense').map((c) => c.name) || [];
  const userIncomeCats = context?.categories?.filter((c) => c.type === 'income').map((c) => c.name) || [];
  const userAccNames = context?.accounts?.map((a) => a.name) || [];
  const userLedgerDesc = context?.ledgers?.map((l) => `• ${l.name} (${l.isShared ? `共管帳本，成員：${l.memberNames?.join('、') || '多人'}` : '個人帳本'})`).join('\n') || '';
  const userFriendNames = context?.friends?.map((f) => f.name) || [];

  let lastErrorReason: string | undefined = undefined;

  try {
    const candidateKeys = await getCandidateGeminiApiKeys(effectiveApiKey);
    if (candidateKeys.length > 0) {
      const prompt = `
你是一位精通台灣日常口語與財務會計的 AI 記帳大腦。
請嚴格解析以下使用者輸入之記帳文字，提取財務要素並回填固定表格 (JSON 格式)。
當前今日基準日期: ${todayStr}

使用者記帳文字: "${cleanText}"

【該使用者當前真實環境配置】：
1. 記帳分類項目：
   - 支出分類：[${userExpenseCats.length ? userExpenseCats.join(', ') : '餐飲美食, 交通運輸, 汽機車輛, 居家生活, 水電瓦斯, 購物服飾, 休閒娛樂, 運動健身, 醫療健康, 學習進修, 數位訂閱, 社交禮金, 旅遊渡假, 毛孩寵物, 保險稅務, 其他雜支'}]
   - 收入分類：[${userIncomeCats.length ? userIncomeCats.join(', ') : '正職薪資, 獎金津貼, 兼職副業, 投資理財, 股息利息, 租金收入, 發票中獎, 親友餽贈, 拍賣出清, 退稅回饋, 其他收入'}]
2. 可用扣款錢包/帳戶：[${userAccNames.length ? userAccNames.join(', ') : '現金皮夾, 信用卡, 玉山銀行, 電子錢包'}]
3. 可用帳本：
${userLedgerDesc || '• 個人日常帳本 (個人帳本)\n• 家庭公積金 (共管帳本)'}
4. 已知好友成員名單：[${userFriendNames.length ? userFriendNames.join(', ') : '媽媽, 小美, 阿倫'}]

【固定回填欄位規範】：
1. amount: 必須將口語單位轉為純數字 (例如 "5萬"->50000, "1千5"->1500, "1.5萬"->15000, "8百5"->850, "3k"->3000, "5w"->50000)。
2. currency: 幣別代碼 (例如 "TWD", "JPY", "USD", "EUR")，預設 "TWD"。
3. type: 'expense' (支出) 或 'income' (收入)。
4. title: 交易項目簡稱 (例如 "買冰箱", "吃和牛", "7-11 咖啡", "加油")。
5. category: 必須優先從上述「記帳分類項目」選取最符合之標準名稱。
6. suggestedAccount: 必須優先從上述「可用扣款錢包/帳戶」選取 (付現選現金、刷卡選信用卡、電支選電子錢包)。
7. suggestedLedger: 必須優先從上述「可用帳本」選取。若涉及特定好友分帳或特定共管成員，必須符合該共管帳本樣態！
8. isSplit: 若包含「分帳」、「跟誰分」、「平分」、「各半」等字眼，設為 true，否則 false。
9. splitNames: 欲分帳的成員名稱陣列 (優先比對已知好友名單)，若無則為 []。
10. date: YYYY-MM-DD 格式。若提及「昨天」、「前天」、「明天」、「4/15」請推算為具體西元日期；若無提及任何日期，則默認為記帳當天 ${todayStr}。
11. note: 備註說明。

請嚴格僅輸出 JSON 物件，例如：
{
  "amount": 50000,
  "currency": "TWD",
  "type": "expense",
  "title": "買冰箱",
  "category": "居家生活",
  "suggestedAccount": "信用卡",
  "suggestedLedger": "個人日常帳本",
  "isSplit": false,
  "splitNames": [],
  "date": "${todayStr}",
  "note": ""
}
`;

      const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      const textHasJanFirst = /(?:^|[^\d])(?:0?1[/月.-]0?1[日號]?|01-01|01\/01)/.test(text);

      keyLoop: for (const rawKey of candidateKeys) {
        const apiKey = rawKey.replace(/^['"]|['"]$/g, '').trim();
        if (!apiKey) continue;

        const ai = new GoogleGenAI({ apiKey });
        for (const model of candidateModels) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
              },
            });

            const rawJson = response.text?.trim() || '{}';
            const parsed = JSON.parse(rawJson);

            if (parsed && typeof parsed.amount !== 'undefined') {
              let parsedAmount = Number(parsed.amount);
              if (isNaN(parsedAmount) || parsedAmount <= 0) {
                parsedAmount = localParsed.amount;
              }

              let resolvedDate = (parsed.date || localParsed.date || todayStr).trim();
              if (resolvedDate && resolvedDate.endsWith('-01-01') && !textHasJanFirst) {
                resolvedDate = localParsed.date || todayStr;
              }

              return {
                amount: parsedAmount,
                currency: parsed.currency || localParsed.currency,
                type: parsed.type === 'income' ? 'income' : localParsed.type,
                title: parsed.title || localParsed.title,
                category: parsed.category || localParsed.category,
                isSplit: Boolean(parsed.isSplit || localParsed.isSplit),
                splitNames:
                  Array.isArray(parsed.splitNames) && parsed.splitNames.length > 0
                    ? parsed.splitNames
                    : localParsed.splitNames,
                date: resolvedDate,
                suggestedAccountName: parsed.suggestedAccount || localParsed.suggestedAccountName,
                suggestedLedgerName: parsed.suggestedLedger,
                note: parsed.note || '',
              };
            }
          } catch (e: any) {
            lastErrorReason = e?.message || '模型響應失敗';
            console.warn(`[Gemini Model ${model} Attempt Failed with key prefix ${apiKey.slice(0, 6)}]:`, e?.message);
          }
        }
      }
    }
  } catch (err: any) {
    lastErrorReason = err?.message || 'AI 服務器連線異常';
    console.warn('[Gemini Parse Fallback to Local Engine]:', err?.message);
  }

  return {
    ...localParsed,
    reasonIfFallback: lastErrorReason || '服務器過載或網路連線波動，已自動啟用本地高速解析引擎',
  };
}
