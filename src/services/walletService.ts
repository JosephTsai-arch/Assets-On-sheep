import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase/config';
import { AssetAccount, AssetType, SubAccount, Transaction } from '../types';
import { getUserCandidateIds } from './identityService';

export async function getUserAssetAccounts(userId: string, lineUserId?: string): Promise<AssetAccount[]> {
  try {
    const candidateIdsSet = await getUserCandidateIds(userId, lineUserId);
    const candidateIds = Array.from(candidateIdsSet).filter(Boolean);

    const snaps = candidateIds.length > 0
      ? await Promise.allSettled([
          getDocs(query(collection(db, 'assetAccounts'), where('userId', 'in', candidateIds.slice(0, 10)))),
        ])
      : [];

    const assetMap = new Map<string, AssetAccount>();
    for (const res of snaps) {
      if (res.status !== 'fulfilled') continue;
      const snap = res.value;
      snap.docs.forEach((d) => {
        const a = d.data() as AssetAccount;
        if (!a.deletedAt) {
          assetMap.set(a.id, a);
        }
      });
    }

    let list = Array.from(assetMap.values());

    // 核心純讀取原則：若使用者目前尚無資產，單純回傳空陣列，絕不於讀取時擅自向 Firestore 寫入預設帳戶！
    if (list.length === 0) {
      return [];
    }

    // 自動確保銀行帳戶最少有一個【母帳號】，有子帳戶的資產主帳戶金額與子帳戶精確加總；允許餘額為 0
    const processed = list.map((a) => {
      let subs = Array.isArray(a.subAccounts) ? [...a.subAccounts] : [];
      if (a.type === 'bank' && subs.length === 0) {
        subs = [
          {
            id: `sub_${a.id}_main`,
            name: '母帳戶 (活期主帳戶)',
            balance: a.balance != null && !isNaN(Number(a.balance)) ? Number(a.balance) : 0,
          },
        ];
      }
      if (subs.length > 0) {
        const total = subs.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
        return { ...a, balance: total, subAccounts: subs };
      }
      return {
        ...a,
        balance: a.balance != null && !isNaN(Number(a.balance)) ? Number(a.balance) : 0,
        subAccounts: subs,
      };
    });

    // 嚴格依據使用者的自訂排序 (order) 呈現；未設定 order 時，默認「現金皮夾」置頂第一位
    return processed.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : a.type === 'cash' ? 0 : 999;
      const orderB = b.order !== undefined ? b.order : b.type === 'cash' ? 0 : 999;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  } catch (error: any) {
    console.warn('[getUserAssetAccounts Notice]: 雲端讀取降級，啟用預設資產結構');
    return [
      {
        id: `asset_${userId}_cash`,
        userId,
        name: '現金皮夾',
        type: 'cash',
        balance: 0,
        currency: 'TWD',
        order: 0,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
    ];
  }
}

/**
 * 拖拉排序持久化更新：為使用者的各個資產帳戶寫入順序 index
 */
export async function updateAssetAccountsOrder(
  userId: string,
  orderedAccountIds: string[]
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    orderedAccountIds.forEach((id, index) => {
      batch.update(doc(db, 'assetAccounts', id), {
        order: index,
        updatedAt: now,
      });
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'assetAccounts/reorder');
  }
}

export async function initializeDefaultAssets(userId: string, lineUserId?: string): Promise<AssetAccount[]> {
  try {
    const candidateIdsSet = await getUserCandidateIds(userId, lineUserId);
    const candidateIds = Array.from(candidateIdsSet);

    // 1. 嚴防覆寫：若此使用者名下任何候選身分已存在資產帳戶，絕不重複寫入預設資產！
    const existingSnaps = await Promise.all(
      candidateIds.map((id) =>
        getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', id)))
      )
    );
    for (const snap of existingSnaps) {
      const active = snap.docs.map((d) => d.data() as AssetAccount).filter((a) => !a.deletedAt);
      if (active.length > 0) {
        return active;
      }
    }

    // 2. 嚴防覆寫：檢查名下是否已有任何明細或帳本 (防止資產讀取暫態為空時覆寫)
    const [txSnaps, ledgerSnaps] = await Promise.all([
      Promise.all(candidateIds.map((id) => getDocs(query(collection(db, 'transactions'), where('userId', '==', id))))),
      Promise.all(candidateIds.map((id) => getDocs(query(collection(db, 'ledgers'), where('userId', '==', id))))),
    ]);
    const hasAnyTxs = txSnaps.some((s) => !s.empty);
    const hasAnyLedgers = ledgerSnaps.some((s) => !s.empty);
    if (hasAnyTxs || hasAnyLedgers) {
      return [];
    }

    // 3. 檢查 User Document 建立時間：若非 90 秒內新註冊用戶，絕不建立預設資產
    try {
      const uDoc = await getDoc(doc(db, 'users', userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (uData.createdAt) {
          const ageMs = Date.now() - new Date(uData.createdAt).getTime();
          if (ageMs > 90000) {
            return [];
          }
        }
      }
    } catch {}

    const now = new Date().toISOString();
    const subAccounts: SubAccount[] = [
      { id: `sub_${userId}_main`, name: '母帳戶 (活期主帳戶)', balance: 0 },
      { id: `sub_${userId}_travel`, name: '🇯🇵 日本旅遊基金', balance: 15000 },
      { id: `sub_${userId}_emergency`, name: '🛡️ 緊急備用金', balance: 30000 },
    ];
    const bankTotalBalance = subAccounts.reduce((sum, s) => sum + (s.balance || 0), 0);

    const defaults: AssetAccount[] = [
      {
        id: `asset_${userId}_cash`,
        userId,
        name: '現金皮夾',
        type: 'cash',
        balance: 3000,
        currency: 'TWD',
        order: 0,
        createdAt: now,
        deletedAt: null,
      },
      {
        id: `asset_${userId}_bank`,
        userId,
        name: '玉山銀行主帳戶',
        type: 'bank',
        balance: bankTotalBalance,
        currency: 'TWD',
        subAccounts,
        order: 1,
        createdAt: now,
        deletedAt: null,
      },
      {
        id: `asset_${userId}_ewallet`,
        userId,
        name: '電子錢包',
        type: 'e_wallet',
        balance: 1200,
        currency: 'TWD',
        order: 2,
        createdAt: now,
        deletedAt: null,
      },
    ];

    for (const asset of defaults) {
      await setDoc(doc(db, 'assetAccounts', asset.id), cleanForFirestore(asset));
    }
    return defaults;
  } catch (err) {
    console.warn('[initializeDefaultAssets notice]:', err);
    return [];
  }
}

export async function createAssetAccount(
  userId: string,
  params: {
    name: string;
    type: AssetType;
    balance: number;
    currency?: string;
    subAccounts?: SubAccount[];
  }
): Promise<AssetAccount> {
  try {
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let subAccs = params.subAccounts ? [...params.subAccounts] : [];

    // 銀行帳號最少需有一個母帳戶 (主帳戶)
    if (params.type === 'bank' && subAccs.length === 0) {
      subAccs = [
        {
          id: `sub_${id}_main`,
          name: '母帳戶 (活期主帳戶)',
          balance: !isNaN(Number(params.balance)) ? Number(params.balance) : 0,
        },
      ];
    }

    const effectiveBalance =
      subAccs.length > 0
        ? subAccs.reduce((sum, s) => sum + (Number(s.balance) || 0), 0)
        : (!isNaN(Number(params.balance)) ? Number(params.balance) : 0);

    const asset: AssetAccount = {
      id,
      userId,
      name: params.name.trim(),
      type: params.type,
      balance: effectiveBalance,
      currency: (params.currency as any) || 'TWD',
      subAccounts: subAccs,
      order: Date.now(),
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    await setDoc(doc(db, 'assetAccounts', id), cleanForFirestore(asset));
    return asset;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'assetAccounts');
  }
}

export async function updateAssetAccount(
  accountId: string,
  updates: Partial<AssetAccount>
): Promise<void> {
  try {
    const ref = doc(db, 'assetAccounts', accountId);
    let finalUpdates: any = { ...updates };

    // 若更新包含子帳戶陣列
    if (Array.isArray(updates.subAccounts)) {
      let subs = [...updates.subAccounts];
      if (updates.type === 'bank' && subs.length === 0) {
        subs = [
          {
            id: `sub_${accountId}_main`,
            name: '母帳戶 (活期主帳戶)',
            balance: updates.balance !== undefined && !isNaN(Number(updates.balance)) ? Number(updates.balance) : 0,
          },
        ];
      }
      finalUpdates.subAccounts = subs;
      if (subs.length > 0) {
        finalUpdates.balance = subs.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
      } else {
        finalUpdates.balance = updates.balance !== undefined && !isNaN(Number(updates.balance)) ? Number(updates.balance) : 0;
      }
    } else if (updates.balance !== undefined) {
      finalUpdates.balance = !isNaN(Number(updates.balance)) ? Number(updates.balance) : 0;
    }

    await updateDoc(
      ref,
      cleanForFirestore({
        ...finalUpdates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `assetAccounts/${accountId}`);
  }
}

export async function softDeleteAssetAccount(accountId: string): Promise<void> {
  try {
    const ref = doc(db, 'assetAccounts', accountId);
    await updateDoc(ref, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `assetAccounts/${accountId}`);
  }
}

/**
 * 雙向轉帳：產生一扣一入的對應流水帳紀錄，並更新兩端資產餘額
 */
export async function executeTwoWayTransfer(
  userId: string,
  ledgerId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  title: string = '資產互轉',
  fromSubAccountId?: string,
  toSubAccountId?: string
): Promise<{ transferPairId: string }> {
  const cleanUserId = (userId || '').trim();
  const cleanFromId = (fromAccountId || '').trim();
  const cleanToId = (toAccountId || '').trim();

  if (!cleanUserId) {
    throw new Error('未授權使用者，無法執行轉帳');
  }
  if (!cleanFromId || !cleanToId) {
    throw new Error('轉帳必須同時指定轉出帳戶與轉入帳戶');
  }
  if (isNaN(amount) || amount <= 0) {
    throw new Error('轉帳金額必須大於 0');
  }

  try {
    const batch = writeBatch(db);
    const transferPairId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const effectiveLedgerId = ledgerId || 'ledger_default_main';

    // 情境 A：同帳戶內之子帳戶互轉 (cleanFromId === cleanToId)
    if (cleanFromId === cleanToId) {
      if (!fromSubAccountId || !toSubAccountId || fromSubAccountId === toSubAccountId) {
        throw new Error('同帳戶內互轉必須指定不同的轉出與轉入子帳戶');
      }

      const accRef = doc(db, 'assetAccounts', cleanFromId);
      const accSnap = await getDoc(accRef);
      if (!accSnap.exists()) {
        throw new Error('轉帳資產帳戶不存在');
      }

      const acc = accSnap.data() as AssetAccount;
      let subAccs = acc.subAccounts || [];
      const fromSub = subAccs.find((s) => s.id === fromSubAccountId);
      const toSub = subAccs.find((s) => s.id === toSubAccountId);

      if (!fromSub || !toSub) {
        throw new Error('指定的子帳戶不存在');
      }

      subAccs = subAccs.map((sub) => {
        if (sub.id === fromSubAccountId) {
          return { ...sub, balance: sub.balance - amount };
        }
        if (sub.id === toSubAccountId) {
          return { ...sub, balance: sub.balance + amount };
        }
        return sub;
      });

      const newBal = subAccs.reduce((sum, s) => sum + (s.balance || 0), 0);
      batch.update(accRef, cleanForFirestore({ balance: newBal, subAccounts: subAccs, updatedAt: now }));

      // 產生扣款與入帳交易紀錄
      const outTxId = `tx_out_${transferPairId}`;
      const outTx: Transaction = {
        id: outTxId,
        userId: cleanUserId,
        ledgerId: effectiveLedgerId,
        type: 'transfer',
        amount: -amount,
        currency: acc.currency,
        categoryId: 'cat_transfer',
        categoryName: '轉帳(轉出)',
        accountId: cleanFromId,
        targetAccountId: cleanToId,
        subAccountId: fromSubAccountId,
        date: today,
        title: `${title} (${fromSub.name} ➔ ${toSub.name})`,
        payerId: cleanUserId,
        payerName: '本人',
        transferPairId,
        createdAt: now,
        deletedAt: null,
      };
      batch.set(doc(db, 'transactions', outTxId), cleanForFirestore(outTx));

      const inTxId = `tx_in_${transferPairId}`;
      const inTx: Transaction = {
        id: inTxId,
        userId: cleanUserId,
        ledgerId: effectiveLedgerId,
        type: 'transfer',
        amount: amount,
        currency: acc.currency,
        categoryId: 'cat_transfer',
        categoryName: '轉帳(轉入)',
        accountId: cleanToId,
        targetAccountId: cleanFromId,
        subAccountId: toSubAccountId,
        date: today,
        title: `${title} (${fromSub.name} ➔ ${toSub.name})`,
        payerId: cleanUserId,
        payerName: '本人',
        transferPairId,
        createdAt: now,
        deletedAt: null,
      };
      batch.set(doc(db, 'transactions', inTxId), cleanForFirestore(inTx));

      await batch.commit();
      return { transferPairId };
    }

    // 情境 B：不同帳戶互轉 (cleanFromId !== cleanToId)
    const fromRef = doc(db, 'assetAccounts', cleanFromId);
    const toRef = doc(db, 'assetAccounts', cleanToId);
    const [fromSnap, toSnap] = await Promise.all([getDoc(fromRef), getDoc(toRef)]);

    if (!fromSnap.exists() || !toSnap.exists()) {
      throw new Error('轉帳資產帳戶不存在');
    }

    const fromAcc = fromSnap.data() as AssetAccount;
    const toAcc = toSnap.data() as AssetAccount;

    // 更新 from 餘額 (扣款)
    let fromSubAccs = fromAcc.subAccounts;
    if (fromSubAccountId && fromSubAccs) {
      fromSubAccs = fromSubAccs.map((sub) =>
        sub.id === fromSubAccountId ? { ...sub, balance: sub.balance - amount } : sub
      );
    }
    const newFromBal =
      fromSubAccs && fromSubAccs.length > 0
        ? fromSubAccs.reduce((sum, s) => sum + (s.balance || 0), 0)
        : fromAcc.balance - amount;
    batch.update(fromRef, cleanForFirestore({ balance: newFromBal, subAccounts: fromSubAccs, updatedAt: now }));

    // 更新 to 餘額 (入帳)
    let toSubAccs = toAcc.subAccounts;
    if (toSubAccountId && toSubAccs) {
      toSubAccs = toSubAccs.map((sub) =>
        sub.id === toSubAccountId ? { ...sub, balance: sub.balance + amount } : sub
      );
    }
    const newToBal =
      toSubAccs && toSubAccs.length > 0
        ? toSubAccs.reduce((sum, s) => sum + (s.balance || 0), 0)
        : toAcc.balance + amount;
    batch.update(toRef, cleanForFirestore({ balance: newToBal, subAccounts: toSubAccs, updatedAt: now }));

    // 產生「扣款 (轉出)」交易
    const outTxId = `tx_out_${transferPairId}`;
    const outTx: Transaction = {
      id: outTxId,
      userId: cleanUserId,
      ledgerId: effectiveLedgerId,
      type: 'transfer',
      amount: -amount,
      currency: fromAcc.currency,
      categoryId: 'cat_transfer',
      categoryName: '轉帳(轉出)',
      accountId: cleanFromId,
      targetAccountId: cleanToId,
      subAccountId: fromSubAccountId,
      date: today,
      title: `${title} (轉出至 ${toAcc.name})`,
      payerId: cleanUserId,
      payerName: '本人',
      transferPairId,
      createdAt: now,
      deletedAt: null,
    };
    batch.set(doc(db, 'transactions', outTxId), cleanForFirestore(outTx));

    // 產生「入帳 (轉入)」交易
    const inTxId = `tx_in_${transferPairId}`;
    const inTx: Transaction = {
      id: inTxId,
      userId: cleanUserId,
      ledgerId: effectiveLedgerId,
      type: 'transfer',
      amount: amount,
      currency: toAcc.currency,
      categoryId: 'cat_transfer',
      categoryName: '轉帳(轉入)',
      accountId: cleanToId,
      targetAccountId: cleanFromId,
      subAccountId: toSubAccountId,
      date: today,
      title: `${title} (來自 ${fromAcc.name})`,
      payerId: cleanUserId,
      payerName: '本人',
      transferPairId,
      createdAt: now,
      deletedAt: null,
    };
    batch.set(doc(db, 'transactions', inTxId), cleanForFirestore(inTx));

    await batch.commit();
    return { transferPairId };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'transfers');
    throw error;
  }
}
