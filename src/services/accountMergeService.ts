import { writeBatch, collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase/config';
import { Transaction, AssetAccount, Ledger } from '../types';

export interface AccountMergeSummary {
  googleUserId: string;
  lineUserId: string;
  googleStats: {
    transactionCount: number;
    totalAssets: number;
    avatarUrl: string;
    displayName: string;
    email?: string;
  };
  lineStats: {
    transactionCount: number;
    totalAssets: number;
    avatarUrl: string;
    displayName: string;
    lineUserId: string;
  };
}

export type MergeChoice = 'keep_google' | 'keep_line' | 'smart_merge';

/**
 * 統計兩端帳號資料 (支援 Google UID 與 LINE User ID 雙向檢索)
 */
export async function getAccountsMergeSummary(
  googleUserId: string,
  lineUserId: string
): Promise<AccountMergeSummary> {
  const lineDocId = lineUserId.startsWith('line_') ? lineUserId : `line_${lineUserId}`;
  const rawLineUserId = lineUserId.replace(/^line_/, '').trim();

  // 1. Google 帳號相關資料
  const [googleTxSnap, googleAssetsSnap, googleUserSnap] = await Promise.all([
    getDocs(query(collection(db, 'transactions'), where('userId', '==', googleUserId))),
    getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', googleUserId))),
    getDocs(query(collection(db, 'users'), where('id', '==', googleUserId))),
  ]);

  // 2. LINE 帳號相關資料 (同時涵蓋帶有 line_ 前綴與純字串)
  const [lineTxSnap1, lineTxSnap2, lineAssetsSnap1, lineAssetsSnap2, lineUserSnap1, lineUserSnap2] =
    await Promise.all([
      getDocs(query(collection(db, 'transactions'), where('userId', '==', lineDocId))),
      getDocs(query(collection(db, 'transactions'), where('userId', '==', rawLineUserId))),
      getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', lineDocId))),
      getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', rawLineUserId))),
      getDocs(query(collection(db, 'users'), where('id', 'in', [lineDocId, rawLineUserId]))),
      getDocs(query(collection(db, 'users'), where('lineUserId', '==', rawLineUserId))),
    ]);

  const uniqueTxMap = new Map<string, any>();
  [...lineTxSnap1.docs, ...lineTxSnap2.docs].forEach((d) => uniqueTxMap.set(d.id, d.data()));
  const activeLineTxs = Array.from(uniqueTxMap.values()).filter((t) => !t.deletedAt);

  const uniqueAssetMap = new Map<string, AssetAccount>();
  [...lineAssetsSnap1.docs, ...lineAssetsSnap2.docs].forEach((d) =>
    uniqueAssetMap.set(d.id, d.data() as AssetAccount)
  );
  const activeLineAssets = Array.from(uniqueAssetMap.values()).filter((a) => !a.deletedAt);

  const calcTotal = (assets: AssetAccount[]) =>
    assets.reduce((acc, curr) => acc + (curr.balance || 0), 0);

  const calcGoogleAssets = (snap: any) =>
    snap.docs
      .map((d: any) => d.data() as AssetAccount)
      .filter((a: any) => !a.deletedAt)
      .reduce((acc: number, curr: any) => acc + (curr.balance || 0), 0);

  const googleUserData = googleUserSnap.docs[0]?.data();
  const lineUserData = lineUserSnap1.docs[0]?.data() || lineUserSnap2.docs[0]?.data();

  return {
    googleUserId,
    lineUserId: lineDocId,
    googleStats: {
      transactionCount: googleTxSnap.docs.filter((d) => !d.data().deletedAt).length,
      totalAssets: calcGoogleAssets(googleAssetsSnap),
      avatarUrl: googleUserData?.avatarUrl || '',
      displayName: googleUserData?.name || 'Google 使用者',
      email: googleUserData?.email || '',
    },
    lineStats: {
      transactionCount: activeLineTxs.length,
      totalAssets: calcTotal(activeLineAssets),
      avatarUrl: lineUserData?.avatarUrl || '',
      displayName: lineUserData?.name || 'LINE 使用者',
      lineUserId: rawLineUserId,
    },
  };
}

/**
 * 執行三選一原子融合
 * 選項 1 (keep_google): 保留 Google 帳號，捨棄 LINE 歷史資料
 * 選項 2 (keep_line): 保留 LINE 帳號，捨棄 Google 歷史資料
 * 選項 3 (smart_merge): 智慧雙向去重原子融合 (自動比對同日同額同項目去重)
 */
export async function executeAtomicAccountMerge(
  googleUserId: string,
  lineUserId: string,
  choice: MergeChoice
): Promise<{ survivingUserId: string }> {
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const lineDocId = lineUserId.startsWith('line_') ? lineUserId : `line_${lineUserId}`;
    const rawLineUserId = lineUserId.replace(/^line_/, '').trim();

    // 撈出 LINE 端所有交易、資產與帳本
    const [lineTxSnap1, lineTxSnap2, lineAssetsSnap1, lineAssetsSnap2, lineLedgerSnap1, lineLedgerSnap2] =
      await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('userId', '==', lineDocId))),
        getDocs(query(collection(db, 'transactions'), where('userId', '==', rawLineUserId))),
        getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', lineDocId))),
        getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', rawLineUserId))),
        getDocs(query(collection(db, 'ledgers'), where('userId', '==', lineDocId))),
        getDocs(query(collection(db, 'ledgers'), where('userId', '==', rawLineUserId))),
      ]);

    const lineTxDocs = Array.from(
      new Map([...lineTxSnap1.docs, ...lineTxSnap2.docs].map((d) => [d.id, d])).values()
    );
    const lineAssetDocs = Array.from(
      new Map([...lineAssetsSnap1.docs, ...lineAssetsSnap2.docs].map((d) => [d.id, d])).values()
    );
    const lineLedgerDocs = Array.from(
      new Map([...lineLedgerSnap1.docs, ...lineLedgerSnap2.docs].map((d) => [d.id, d])).values()
    );

    // ==========================================
    // 選項 1: keep_google (保留 Google，捨棄 LINE)
    // ==========================================
    if (choice === 'keep_google') {
      // 捨棄 LINE 端舊交易
      lineTxDocs.forEach((d) => {
        batch.set(
          doc(db, 'transactions', d.id),
          { deletedAt: now, note: '[已依使用者選擇保留Google資料而捨棄]' },
          { merge: true }
        );
      });

      // 標記 LINE 用戶為已合併並封存
      batch.set(
        doc(db, 'users', lineDocId),
        {
          deletedAt: now,
          mergedIntoUserId: googleUserId,
          updatedAt: now,
        },
        { merge: true }
      );

      // Google 帳號正式綁定此 LINE User ID (未來對話直接寫入此帳號)
      batch.set(
        doc(db, 'users', googleUserId),
        {
          lineUserId: rawLineUserId,
          updatedAt: now,
        },
        { merge: true }
      );

      await batch.commit();
      return { survivingUserId: googleUserId };
    }

    // ==========================================
    // 選項 2: keep_line (保留 LINE，捨棄 Google)
    // ==========================================
    if (choice === 'keep_line') {
      // 撈取 Google 交易並標記捨棄
      const googleTxSnap = await getDocs(
        query(collection(db, 'transactions'), where('userId', '==', googleUserId))
      );
      googleTxSnap.docs.forEach((d) => {
        batch.set(
          doc(db, 'transactions', d.id),
          { deletedAt: now, note: '[已依使用者選擇保留LINE資料而捨棄]' },
          { merge: true }
        );
      });

      // 封存 Google 帳號文件
      batch.set(
        doc(db, 'users', googleUserId),
        {
          deletedAt: now,
          mergedIntoUserId: lineDocId,
          updatedAt: now,
        },
        { merge: true }
      );

      // 恢復/確認 LINE 帳號為唯一存續帳號
      batch.set(
        doc(db, 'users', lineDocId),
        {
          googleUid: googleUserId,
          deletedAt: null,
          updatedAt: now,
        },
        { merge: true }
      );

      await batch.commit();
      return { survivingUserId: lineDocId };
    }

    // ==========================================
    // 選項 3: smart_merge (智慧雙向去重原子融合)
    // ==========================================
    // 撈出 Google 端既有交易進行智慧防重比對
    const googleTxSnap = await getDocs(
      query(collection(db, 'transactions'), where('userId', '==', googleUserId))
    );
    const googleTxs = googleTxSnap.docs
      .map((d) => d.data() as Transaction)
      .filter((t) => !t.deletedAt);

    // 遷移交易：同一天、同金額、同項目標題視為重複，壓上 deletedAt；其餘無縫遷移至 Google 帳號
    lineTxDocs.forEach((d) => {
      const tx = d.data() as Transaction;
      if (tx.deletedAt) return;

      const isDuplicate = googleTxs.some(
        (gtx) =>
          gtx.date === tx.date &&
          Math.abs(gtx.amount - tx.amount) < 0.01 &&
          gtx.title?.trim() === tx.title?.trim()
      );

      const ref = doc(db, 'transactions', d.id);
      if (isDuplicate) {
        batch.set(ref, { deletedAt: now, note: '[智慧雙向融合：已自動去重]' }, { merge: true });
      } else {
        batch.set(ref, { userId: googleUserId, updatedAt: now }, { merge: true });
      }
    });

    // 遷移資產帳戶至 Google 帳號 (重命名標註來源)
    lineAssetDocs.forEach((d) => {
      batch.set(
        doc(db, 'assetAccounts', d.id),
        {
          userId: googleUserId,
          name: d.data().name?.startsWith('[LINE]') ? d.data().name : `[LINE] ${d.data().name}`,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    // 遷移帳本至 Google 帳號
    lineLedgerDocs.forEach((d) => {
      batch.set(
        doc(db, 'ledgers', d.id),
        {
          userId: googleUserId,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    // 封存 LINE 帳號並指向 Google 主帳號
    batch.set(
      doc(db, 'users', lineDocId),
      {
        deletedAt: now,
        mergedIntoUserId: googleUserId,
        updatedAt: now,
      },
      { merge: true }
    );

    // Google 帳號更新關聯錨點
    batch.set(
      doc(db, 'users', googleUserId),
      {
        lineUserId: rawLineUserId,
        updatedAt: now,
      },
      { merge: true }
    );

    await batch.commit();
    return { survivingUserId: googleUserId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'account_merge');
    throw error;
  }
}
