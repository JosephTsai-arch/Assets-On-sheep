import zlib from 'zlib';
import { getLiffId, getLiffUrl } from '../utils/urlUtils';

/**
 * 產生 PNG CRC32 表
 */
function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCrcTable();
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  const checkBuf = Buffer.concat([Buffer.from(type), data]);
  const c = crc32(checkBuf);
  buf.writeUInt32BE(c, 8 + len);
  return buf;
}

/**
 * 產生 LINE 官方規範之 2500x843 高解析度 Rich Menu 圖檔 (PNG)
 * 3 等分視覺區塊：
 * 1. [左區塊 / 綠色翡翠] 打開記帳軟體
 * 2. [中區塊 / 科技湖藍] 記帳
 * 3. [右區塊 / 溫暖金琥珀] 修改上一筆
 */
export function generateRichMenuPng(): Buffer {
  const width = 2500;
  const height = 843;
  const rawScanlines = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;

      if (x < 833) {
        // 翡翠綠 (打開記帳軟體) - #059669
        r = 5;
        g = 150;
        b = 105;
      } else if (x < 1666) {
        // 科技深藍 (記帳) - #2563EB
        r = 37;
        g = 99;
        b = 235;
      } else {
        // 暖琥珀金 (修改上一筆) - #D97706
        r = 217;
        g = 119;
        b = 6;
      }

      // 上邊框與縱向白色分隔線 (視覺質感線條)
      if (y < 6 || x === 832 || x === 833 || x === 1665 || x === 1666) {
        r = 255;
        g = 255;
        b = 255;
      }

      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
    }
  }

  const compressed = zlib.deflateSync(rawScanlines);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 2; // Color type: RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = makePngChunk('IHDR', ihdrData);
  const idatChunk = makePngChunk('IDAT', compressed);
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * 建立恆駐在對話框最下方的 Quick Reply (狀態機快捷列)
 * 覆蓋：📱 軟體&功能、🔄 修改上一筆、👤 我的帳號
 * (移除與上方 Flex 卡片重複之「記帳」與「記帳鬧鐘」按鈕，避免用戶介面認知混淆)
 */
export function buildPinnedQuickReply(options: {
  appUrl: string;
  lineUserId?: string;
  liffId?: string;
  openAppLabel?: string;
}) {
  const liffId = getLiffId(options.liffId);
  const directInAppUrl = getLiffUrl(liffId, options.appUrl);

  return {
    items: [
      {
        type: 'action',
        action: {
          type: 'message',
          label: options.openAppLabel || '📱 軟體&功能',
          text: '軟體&功能',
        },
      },
      {
        type: 'action',
        action: {
          type: 'postback',
          label: '🔄 修改上一筆',
          data: 'action=edit_last',
          displayText: '修改上一筆',
        },
      },
      {
        type: 'action',
        action: {
          type: 'message',
          label: '👤 我的帳號',
          text: '我的帳號',
        },
      },
    ],
  };
}

/**
 * 自動為 LINE 官方帳號建立並部署底端恆駐 Rich Menu (圖文選單)
 */
export async function setupDefaultRichMenu(params: {
  accessToken: string;
  appUrl: string;
  liffId?: string;
}): Promise<{ success: boolean; richMenuId?: string; error?: string }> {
  const token = params.accessToken.trim();
  if (!token) {
    return { success: false, error: '缺少 LINE Channel Access Token' };
  }

  const resolvedLiffId = getLiffId(params.liffId);
  const openUrl = getLiffUrl(resolvedLiffId, params.appUrl);

  try {
    // 1. 定義 2500x843 3 等分圖文選單結構
    const richMenuPayload = {
      size: {
        width: 2500,
        height: 843,
      },
      selected: true,
      name: 'AssetOnSheep_Persistent_Menu',
      chatBarText: '🐑 資產上羊 功能選單',
      areas: [
        {
          bounds: { x: 0, y: 0, width: 833, height: 843 },
          action: {
            type: 'uri',
            label: '打開記帳軟體',
            uri: openUrl,
          },
        },
        {
          bounds: { x: 833, y: 0, width: 833, height: 843 },
          action: {
            type: 'message',
            label: '記帳',
            text: '記帳',
          },
        },
        {
          bounds: { x: 1666, y: 0, width: 834, height: 843 },
          action: {
            type: 'postback',
            label: '修改上一筆',
            data: 'action=edit_last',
            displayText: '修改上一筆',
          },
        },
      ],
    };

    // 2. 建立 Rich Menu 定義
    const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(richMenuPayload),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return { success: false, error: `建立 Rich Menu 失敗: ${err}` };
    }

    const { richMenuId } = (await createRes.json()) as { richMenuId: string };

    // 3. 上傳 2500x843 PNG 圖檔
    const pngBuffer = generateRichMenuPng();
    const uploadRes = await fetch(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          Authorization: `Bearer ${token}`,
        },
        body: new Uint8Array(pngBuffer) as any,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return { success: false, error: `上傳 Rich Menu 圖檔失敗: ${err}` };
    }

    // 4. 設定為全域所有使用者預設選單
    const setDefaultRes = await fetch(
      `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!setDefaultRes.ok) {
      const err = await setDefaultRes.text();
      return { success: false, error: `設定預設 Rich Menu 失敗: ${err}` };
    }

    return { success: true, richMenuId };
  } catch (e: any) {
    return { success: false, error: e?.message || '設定 Rich Menu 發生異常' };
  }
}

/**
 * 徹底解除並刪除 LINE 官方圖文選單 (Rich Menu / 功能選單)
 */
export async function removeLineRichMenu(
  accessToken: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const token = accessToken.trim();
  if (!token) {
    return { success: false, message: '缺少 LINE Access Token', error: '缺少 LINE Access Token' };
  }

  try {
    // 1. 解除所有用戶預設 Rich Menu
    await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    // 2. 查詢並刪除所有既有 Rich Menu
    const listRes = await fetch('https://api.line.me/v2/bot/richmenu/list', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = (await listRes.json()) as { richmenus?: Array<{ richMenuId: string }> };
      if (listData.richmenus && Array.isArray(listData.richmenus)) {
        for (const rm of listData.richmenus) {
          await fetch(`https://api.line.me/v2/bot/richmenu/${rm.richMenuId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      }
    }

    return { success: true, message: '已徹底移除所有 LINE 功能選單 (Rich Menu)' };
  } catch (err: any) {
    return { success: false, message: '移除 Rich Menu 發生異常', error: err?.message };
  }
}
