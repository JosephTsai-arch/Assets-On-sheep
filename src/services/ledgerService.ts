import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase/config';
import { Ledger, LedgerCurrency } from '../types';
import { ensureUserDummyFriends } from './friendService';
import { getUserCandidateIds, expandAllMemberAliases } from './identityService';

export async function getUserLedgers(userId: string, lineUserId?: string): Promise<Ledger[]> {
  try {
    const candidateIds = await getUserCandidateIds(userId, lineUserId);

    const ledgersMap = new Map<string, Ledger>();

    // 0. 讀取使用者名下已主動退出的帳本清單 (leftLedgerIds) 平行快速載入
    const leftLedgerIdsSet = new Set<string>();
    await Promise.all(
      Array.from(candidateIds).map(async (id) => {
        try {
          const uSnap = await getDoc(doc(db, 'users', id));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            if (Array.isArray(uData.leftLedgerIds)) {
              uData.leftLedgerIds.forEach((lid: string) => lid && leftLedgerIdsSet.add(lid));
            }
          }
        } catch {}
      })
    );

    // 1. 合併檢索本人為所有者 (userId)、創建者 (creatorId) 或成員 (memberIds) 的帳本 (以 'in' 批次查詢大幅節省讀取額度)
    const candidateList = Array.from(candidateIds).filter(Boolean);
    const queries: Promise<any>[] = [];

    if (candidateList.length > 0) {
      queries.push(getDocs(query(collection(db, 'ledgers'), where('userId', 'in', candidateList.slice(0, 10)))));
      queries.push(getDocs(query(collection(db, 'ledgers'), where('creatorId', 'in', candidateList.slice(0, 10)))));
    }

    const primaryId = candidateList[0];
    const secondaryId = candidateList.find((id) => id !== primaryId && (id.startsWith('U') || id.startsWith('line_')));
    if (primaryId) {
      queries.push(getDocs(query(collection(db, 'ledgers'), where('memberIds', 'array-contains', primaryId))));
    }
    if (secondaryId) {
      queries.push(getDocs(query(collection(db, 'ledgers'), where('memberIds', 'array-contains', secondaryId))));
    }

    const snaps = await Promise.allSettled(queries);
    for (const res of snaps) {
      if (res.status !== 'fulfilled') continue;
      const snap = res.value;
      snap.docs.forEach((d: any) => {
        const l = d.data() as Ledger;
        if (!l.deletedAt && !leftLedgerIdsSet.has(l.id) && !leftLedgerIdsSet.has(d.id)) {
          const isCreator = candidateIds.has(l.creatorId) || candidateIds.has(l.userId);
          const isMember = (l.memberIds || []).some((m) => candidateIds.has(m));

          // 嚴格隱私隔離規範：
          // 1. 若為私人私帳 (!l.isShared)，嚴格只有創建者本人能存取！
          if (!l.isShared && !isCreator) {
            return;
          }
          // 2. 若為共管帳本 (l.isShared)，必須被明確列於成員名單 (memberIds) 之中！
          // 若本人已退出或不在成員名單中 (isMember 為 false)，絕對不應再顯示此共管帳本卡片！
          if (l.isShared && !isMember) {
            return;
          }

          ledgersMap.set(d.id, l);
        }
      });
    }

    const allLedgers = Array.from(ledgersMap.values());

    // 嚴格依帳本唯一 id 保留所有合法擁有的帳本
    const dedupedMap = new Map<string, Ledger>();
    for (const l of allLedgers) {
      dedupedMap.set(l.id, l);
    }

    // 🛡️ 智慧收斂：防禦多身分合併後重複產生的「日常私帳 (個人)」
    // 若同一使用者名下有多個私帳，保留最早創立且通常承載明細的主私帳，避免介面分裂
    const nonSharedDaily = Array.from(dedupedMap.values()).filter(
      (l) => !l.isShared && (l.name.includes('日常') || l.name.includes('個人'))
    );
    if (nonSharedDaily.length > 1) {
      // 依建立時間排序，第一筆作為存續主私帳
      nonSharedDaily.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const keeper = nonSharedDaily[0];
      for (let i = 1; i < nonSharedDaily.length; i++) {
        const redundant = nonSharedDaily[i];
        dedupedMap.delete(redundant.id);
        // 背景異步壓上 deletedAt，徹底清理歷史遺留空帳本
        try {
          setDoc(
            doc(db, 'ledgers', redundant.id),
            { deletedAt: new Date().toISOString() },
            { merge: true }
          ).catch(() => {});
        } catch {}
      }
    }

    // 排序規範：個人日常私帳 (!isShared) 優先排在上方選項，共管帳本排在下方
    const sorted = Array.from(dedupedMap.values()).sort((a, b) => {
      if (!a.isShared && b.isShared) return -1;
      if (a.isShared && !b.isShared) return 1;

      if (!a.isShared && !b.isShared) {
        const aIsDaily = a.name.includes('日常') || a.name.includes('個人');
        const bIsDaily = b.name.includes('日常') || b.name.includes('個人');
        if (aIsDaily && !bIsDaily) return -1;
        if (!aIsDaily && bIsDaily) return 1;
      }

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return sorted;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'ledgers');
  }
}

/**
 * 冪等性生成新使用者預設個人帳本 (嚴格防禦：若使用者已存在任何帳本、明細、資產或非即時新註冊，絕對不覆寫或增生帳本)
 */
export async function initializeUserDefaultLedgers(userId: string, lineUserId?: string): Promise<Ledger[]> {
  try {
    const candidateIdsSet = await getUserCandidateIds(userId, lineUserId);
    const candidateIds = Array.from(candidateIdsSet);

    // 1. 若使用者名下任何身分已存在有效帳本，直接回傳
    const existing = await getUserLedgers(userId, lineUserId);
    if (existing && existing.length > 0) {
      return existing;
    }

    // 2. 嚴防覆寫：檢查名下是否已有任何歷史明細或資產帳戶存在 (防止查詢延遲導致誤判為新帳號)
    const [txSnaps, assetSnaps] = await Promise.all([
      Promise.all(candidateIds.map((id) => getDocs(query(collection(db, 'transactions'), where('userId', '==', id))))),
      Promise.all(candidateIds.map((id) => getDocs(query(collection(db, 'assetAccounts'), where('userId', '==', id))))),
    ]);
    const hasAnyTxs = txSnaps.some((s) => !s.empty);
    const hasAnyAssets = assetSnaps.some((s) => !s.empty);
    if (hasAnyTxs || hasAnyAssets) {
      return existing || [];
    }

    // 3. 檢查 User Document 建立時間：若不是 90 秒內剛註冊的真正全新用戶，絕不擅自建立帳本
    try {
      const uDoc = await getDoc(doc(db, 'users', userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (uData.createdAt) {
          const ageMs = Date.now() - new Date(uData.createdAt).getTime();
          if (ageMs > 90000) {
            // 已存在超過 90 秒的老用戶，純粹可能為查詢無資料，嚴格禁止初始化
            return existing || [];
          }
        }
      }
    } catch {}

    // 4. 真正全新註冊使用者：僅開立專屬「日常私帳 (個人)」，嚴格禁止擅自強加共管帳本！
    const now = new Date().toISOString();
    const defaultPersonalLedger: Ledger = {
      id: `ledger_${userId}_daily`,
      userId,
      name: '日常私帳 (個人)',
      currency: 'TWD',
      isShared: false,
      creatorId: userId,
      memberIds: [userId],
      createdAt: now,
      deletedAt: null,
    };

    await setDoc(doc(db, 'ledgers', defaultPersonalLedger.id), cleanForFirestore(defaultPersonalLedger));
    return [defaultPersonalLedger];
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'ledgers/initialize');
  }
}

export async function createLedger(
  userId: string,
  params: {
    name: string;
    currency: LedgerCurrency;
    isShared: boolean;
    memberIds?: string[];
  }
): Promise<Ledger> {
  try {
    const id = `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const rawMembers = Array.from(new Set([userId, ...(params.memberIds || [])]));
    const expandedMembers = await expandAllMemberAliases(rawMembers);

    const ledger: Ledger = {
      id,
      userId,
      name: params.name.trim(),
      currency: params.currency || 'TWD',
      isShared: params.isShared,
      creatorId: userId,
      memberIds: expandedMembers,
      createdAt: now,
      deletedAt: null,
    };

    await setDoc(doc(db, 'ledgers', id), cleanForFirestore(ledger));
    return ledger;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'ledgers');
  }
}

export async function updateLedger(
  ledgerId: string,
  updates: Partial<Pick<Ledger, 'name' | 'currency' | 'isShared' | 'memberIds'>>
): Promise<void> {
  try {
    const ref = doc(db, 'ledgers', ledgerId);
    let finalUpdates = { ...updates };

    if (updates.memberIds && Array.isArray(updates.memberIds)) {
      finalUpdates.memberIds = await expandAllMemberAliases(updates.memberIds);
    }

    await updateDoc(
      ref,
      cleanForFirestore({
        ...finalUpdates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ledgers/${ledgerId}`);
  }
}

export async function kickMemberFromLedger(
  ledgerId: string,
  memberIdToKick: string,
  requestingUserId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const ref = doc(db, 'ledgers', ledgerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { success: false, message: '帳本不存在' };
    }
    const ledger = snap.data() as Ledger;

    const candidateIds = await getUserCandidateIds(requestingUserId);
    const isCreator = candidateIds.has(ledger.creatorId) || candidateIds.has(ledger.userId);
    const isSelfLeaving = candidateIds.has(memberIdToKick) || memberIdToKick === requestingUserId;

    // 只有創建者有權剔除其他管理者；成員本人有權主動退出
    if (!isCreator && !isSelfLeaving) {
      return { success: false, message: '無權限剔除此成員' };
    }

    // 支援移除同名或別名成員 ID (包含 line_ 前綴或純 ID)
    let targetsToRemove = new Set<string>([memberIdToKick]);
    if (isSelfLeaving) {
      // 本人主動退出：徹底移除本人的所有候選與別名 ID！
      candidateIds.forEach((id) => targetsToRemove.add(id));
    } else {
      // 踢除其他成員：嘗試取得目標成員的候選 ID
      try {
        const targetCandidates = await getUserCandidateIds(memberIdToKick);
        targetCandidates.forEach((id) => targetsToRemove.add(id));
      } catch {}
      if (memberIdToKick.startsWith('line_')) {
        targetsToRemove.add(memberIdToKick.replace(/^line_/, ''));
      } else {
        targetsToRemove.add(`line_${memberIdToKick}`);
      }
    }

    const updatedMembers = (ledger.memberIds || []).filter((id) => !targetsToRemove.has(id));
    const now = new Date().toISOString();
    const updates: any = {
      memberIds: updatedMembers,
      updatedAt: now,
    };

    // 檢查是否還有任何真實成員存在 (過濾掉以 dummy_ 開頭的虛擬成員)
    const remainingRealMembers = updatedMembers.filter((m) => !m.startsWith('dummy_'));

    // 若成員全部離開或無任何真實成員留存，則軟刪除此帳本
    if (updatedMembers.length === 0 || remainingRealMembers.length === 0) {
      updates.deletedAt = now;
    } else if (isCreator && isSelfLeaving) {
      // 創建者主動退出，將所有者與創建者權限平滑轉交給第一位留下之真實成員
      updates.creatorId = remainingRealMembers[0];
      updates.userId = remainingRealMembers[0];
    }

    await updateDoc(ref, updates);

    // 若本人主動退出，將此帳本 ID 記錄至使用者檔案的 leftLedgerIds，雙重確保永久不再出現
    if (isSelfLeaving) {
      try {
        for (const uid of Array.from(candidateIds)) {
          const uRef = doc(db, 'users', uid);
          const uSnap = await getDoc(uRef);
          if (uSnap.exists()) {
            const existingLeft = uSnap.data().leftLedgerIds || [];
            if (!existingLeft.includes(ledgerId)) {
              await updateDoc(uRef, {
                leftLedgerIds: [...existingLeft, ledgerId],
                updatedAt: now,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[leftLedgerIds update notice]:', err);
      }
    }

    return { success: true, message: isSelfLeaving ? '成功退出帳本' : '成功剔除成員' };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ledgers/${ledgerId}/kick`);
  }
}

/**
 * 邀請好友或成員快速加入指定共管帳本
 */
export async function addMemberToLedger(
  ledgerId: string,
  memberIdToAdd: string
): Promise<void> {
  try {
    const ref = doc(db, 'ledgers', ledgerId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error('帳本不存在');
    }
    const ledger = snap.data() as Ledger;
    const currentMembers = ledger.memberIds || [];
    const expandedNew = await expandAllMemberAliases([memberIdToAdd]);
    const merged = Array.from(new Set([...currentMembers, ...expandedNew]));
    await updateDoc(ref, {
      memberIds: merged,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ledgers/${ledgerId}/addMember`);
  }
}

export async function softDeleteLedger(ledgerId: string): Promise<void> {
  try {
    const ref = doc(db, 'ledgers', ledgerId);
    await updateDoc(ref, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ledgers/${ledgerId}`);
  }
}
