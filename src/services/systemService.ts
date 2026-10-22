import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, cleanForFirestore, isFirestoreQuotaExceeded, markQuotaExceeded, auth, SUPER_ADMIN_EMAIL, SUPER_ADMIN_GOOGLE_UID } from '../firebase/config';
import { SystemConfig } from '../types';

const GLOBAL_CONFIG_DOC_ID = 'global';

// 記憶體高速快取，確保在高頻 Webhook 請求中不受暫態網路波動阻斷
let memoryCachedConfig: SystemConfig | null = null;
let lastConfigFetchTime = 0;

// 伺服器端本機磁碟備援快取 (防範 Firestore 延遲或暫態斷線)
function readDiskConfig(): SystemConfig | null {
  if (typeof window !== 'undefined') return null;
  try {
    const fs = (globalThis as any)._nodeFs || require('fs');
    const path = (globalThis as any)._nodePath || require('path');
    const filePath = path.join(process.cwd(), '.system_config.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SystemConfig;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeDiskConfig(config: SystemConfig): void {
  if (typeof window !== 'undefined') return;
  try {
    const fs = (globalThis as any)._nodeFs || require('fs');
    const path = (globalThis as any)._nodePath || require('path');
    const filePath = path.join(process.cwd(), '.system_config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

export async function getGlobalSystemConfig(): Promise<SystemConfig | null> {
  const now = Date.now();
  if (memoryCachedConfig && now - lastConfigFetchTime < 10 * 60 * 1000) {
    return memoryCachedConfig;
  }

  // 先讀取本機磁碟快取 (0ms 即時可用)
  const disk = readDiskConfig();
  if (disk) {
    memoryCachedConfig = disk;
  }

  if (isFirestoreQuotaExceeded()) {
    return memoryCachedConfig || disk;
  }

  try {
    // 優先撈取 system_configs/global，其次檢查 systemConfigs/global
    let docRef = doc(db, 'system_configs', GLOBAL_CONFIG_DOC_ID);
    let snap = await getDoc(docRef);
    if (!snap.exists()) {
      docRef = doc(db, 'systemConfigs', GLOBAL_CONFIG_DOC_ID);
      snap = await getDoc(docRef);
    }
    if (snap.exists()) {
      memoryCachedConfig = snap.data() as SystemConfig;
      lastConfigFetchTime = now;
      writeDiskConfig(memoryCachedConfig);
      return memoryCachedConfig;
    }
    return memoryCachedConfig;
  } catch (error: any) {
    if (error?.message?.includes('Quota limit exceeded') || error?.code === 'resource-exhausted') {
      markQuotaExceeded();
    }
    return memoryCachedConfig;
  }
}

export async function saveGlobalSystemConfig(
  config: Partial<Omit<SystemConfig, 'id' | 'updatedAt'>>
): Promise<SystemConfig> {
  const prev = memoryCachedConfig || (await getGlobalSystemConfig()) || readDiskConfig();

  const updated: SystemConfig = {
    id: GLOBAL_CONFIG_DOC_ID,
    lineChannelId: (config.lineChannelId ?? prev?.lineChannelId ?? '').trim(),
    lineChannelSecret: (config.lineChannelSecret ?? prev?.lineChannelSecret ?? '').trim(),
    lineChannelAccessToken: (config.lineChannelAccessToken ?? prev?.lineChannelAccessToken ?? '').trim(),
    liffId: (config.liffId ?? prev?.liffId ?? '').trim(),
    geminiApiKey: (config.geminiApiKey ?? prev?.geminiApiKey ?? '').trim(),
    updatedAt: new Date().toISOString(),
  };

  memoryCachedConfig = updated;
  writeDiskConfig(updated);
  const cleanData = cleanForFirestore(updated);

  // 1. 同步寫入 Firestore
  let dbSuccess = false;
  try {
    await Promise.all([
      setDoc(doc(db, 'system_configs', GLOBAL_CONFIG_DOC_ID), cleanData, { merge: true }),
      setDoc(doc(db, 'systemConfigs', GLOBAL_CONFIG_DOC_ID), cleanData, { merge: true }),
    ]);
    dbSuccess = true;
  } catch (dbErr: any) {
    console.warn('[SystemService] Client-side setDoc notice:', dbErr?.message);
  }

  // 2. 若在瀏覽器端，亦同步通知後端伺服器 API
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth.currentUser?.email ? { 'x-user-email': auth.currentUser.email } : (SUPER_ADMIN_EMAIL ? { 'x-user-email': SUPER_ADMIN_EMAIL } : {})),
          ...(auth.currentUser?.uid ? { 'x-user-id': auth.currentUser.uid } : (SUPER_ADMIN_GOOGLE_UID ? { 'x-user-id': SUPER_ADMIN_GOOGLE_UID } : {})),
        },
        body: JSON.stringify(cleanData),
      });
      if (res.ok) {
        dbSuccess = true;
      }
    } catch (apiErr) {
      console.warn('[SystemService] Backend API sync notice:', apiErr);
    }
  }

  if (!dbSuccess && typeof window === 'undefined') {
    throw new Error('無法寫入系統設定至資料庫');
  }

  return updated;
}
