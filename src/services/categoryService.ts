import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  cleanForFirestore,
  handleFirestoreError,
  OperationType,
  SUPER_ADMIN_LINE_USER_ID,
  SUPER_ADMIN_LINE_UID,
} from '../firebase/config';
import { Category, Transaction } from '../types';

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: '餐飲美食', icon: '🍽️', color: '#F97316' },
  { name: '交通運輸', icon: '🚇', color: '#3B82F6' },
  { name: '汽機車輛', icon: '🛵', color: '#0284C7' },
  { name: '居家生活', icon: '🏠', color: '#10B981' },
  { name: '水電瓦斯', icon: '💡', color: '#EAB308' },
  { name: '購物服飾', icon: '🛍️', color: '#EC4899' },
  { name: '休閒娛樂', icon: '🎮', color: '#8B5CF6' },
  { name: '運動健身', icon: '🏃', color: '#14B8A6' },
  { name: '醫療健康', icon: '💊', color: '#EF4444' },
  { name: '學習進修', icon: '📚', color: '#6366F1' },
  { name: '數位訂閱', icon: '📱', color: '#06B6D4' },
  { name: '社交禮金', icon: '🤝', color: '#F43F5E' },
  { name: '旅遊渡假', icon: '✈️', color: '#F59E0B' },
  { name: '毛孩寵物', icon: '🐾', color: '#D97706' },
  { name: '保險稅務', icon: '📑', color: '#64748B' },
  { name: '其他雜支', icon: '✨', color: '#94A3B8' },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: '正職薪資', icon: '💰', color: '#10B981' },
  { name: '獎金津貼', icon: '🎁', color: '#F59E0B' },
  { name: '兼職副業', icon: '💼', color: '#3B82F6' },
  { name: '投資理財', icon: '📈', color: '#6366F1' },
  { name: '股息利息', icon: '🪙', color: '#8B5CF6' },
  { name: '租金收入', icon: '🏢', color: '#0D9488' },
  { name: '發票中獎', icon: '🎟️', color: '#EC4899' },
  { name: '親友餽贈', icon: '🧧', color: '#EF4444' },
  { name: '拍賣出清', icon: '📦', color: '#0284C7' },
  { name: '退稅回饋', icon: '💳', color: '#14B8A6' },
  { name: '其他收入', icon: '✨', color: '#64748B' },
];

function normalizeUserId(userId: string): string {
  if (
    userId === SUPER_ADMIN_LINE_UID ||
    userId === `line_${SUPER_ADMIN_LINE_USER_ID}` ||
    userId === SUPER_ADMIN_LINE_USER_ID
  ) {
    return SUPER_ADMIN_LINE_UID;
  }
  return userId;
}

const reconciledUsersInSession = new Set<string>();

export function getDefaultCategoriesList(userId: string): Category[] {
  const targetId = normalizeUserId(userId);
  const now = new Date().toISOString();
  const expense = DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
    id: `cat_exp_${targetId}_${i}`,
    userId: targetId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: 'expense' as const,
    isDefault: true,
    createdAt: now,
    deletedAt: null,
  }));
  const income = DEFAULT_INCOME_CATEGORIES.map((c, i) => ({
    id: `cat_inc_${targetId}_${i}`,
    userId: targetId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    type: 'income' as const,
    isDefault: true,
    createdAt: now,
    deletedAt: null,
  }));
  return [...expense, ...income];
}

export async function getUserCategories(userId: string): Promise<Category[]> {
  const targetId = normalizeUserId(userId);
  try {
    const isSuper = targetId === SUPER_ADMIN_LINE_UID;

    const q = query(collection(db, 'categories'), where('userId', '==', targetId));
    const snap = await getDocs(q);
    let list = snap.docs
      .map((d) => d.data() as Category)
      .filter((c) => !c.deletedAt);

    // 若為總管存續主帳號，主動檢查並單向融合舊版臨時帳號的所有分類與客製化項目
    if (isSuper) {
      const shadowSnap = await getDocs(
        query(collection(db, 'categories'), where('userId', '==', `line_${SUPER_ADMIN_LINE_USER_ID}`))
      );
      const shadowList = shadowSnap.docs
        .map((d) => d.data() as Category)
        .filter((c) => !c.deletedAt);

      if (shadowList.length > 0) {
        const batch = writeBatch(db);
        const now = new Date().toISOString();
        const mainCatNames = new Map(list.map((c) => [c.name.trim(), c]));

        for (const shadowCat of shadowList) {
          const trimmedName = shadowCat.name.trim();
          if (mainCatNames.has(trimmedName)) {
            const existingMainCat = mainCatNames.get(trimmedName)!;
            if (shadowCat.updatedAt && (!existingMainCat.updatedAt || shadowCat.updatedAt > existingMainCat.updatedAt)) {
              batch.update(doc(db, 'categories', existingMainCat.id), {
                icon: shadowCat.icon,
                color: shadowCat.color,
                updatedAt: now,
              });
              existingMainCat.icon = shadowCat.icon;
              existingMainCat.color = shadowCat.color;
            }
            batch.update(doc(db, 'categories', shadowCat.id), { deletedAt: now });
          } else {
            const newId = `cat_${targetId}_${shadowCat.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const migrated: Category = {
              ...shadowCat,
              id: newId,
              userId: targetId,
              updatedAt: now,
            };
            batch.set(doc(db, 'categories', newId), cleanForFirestore(migrated));
            batch.update(doc(db, 'categories', shadowCat.id), { deletedAt: now });
            list.push(migrated);
            mainCatNames.set(trimmedName, migrated);
          }
        }
        await batch.commit();
      }
    }

    if (list.length === 0) {
      return await initializeDefaultCategories(targetId);
    }

    // 若分類缺少「餐飲美食」或少於官方標準 (例如舊版只存了少數幾個原型分類)，自動補齊與升級
    const hasDining = list.some((c) => c.name === '餐飲美食');
    if (!hasDining || list.length < 25) {
      list = await syncAndSupplementCategories(targetId, list);
    }

    // 自動校正名下所有歷史明細與排程基金的分類 (防範 cat_default 或舊版簡稱)
    if (!reconciledUsersInSession.has(targetId)) {
      reconciledUsersInSession.add(targetId);
      reconcileUserTransactionCategories(targetId, list).catch((rErr) => {
        console.warn('[Background category reconciliation notice]:', rErr);
      });
    }

    return list;
  } catch (error: any) {
    console.warn('[getUserCategories Fallback Notice]: 雲端讀取降級，啟用預設分類結構');
    return getDefaultCategoriesList(targetId);
  }
}

/**
 * 智慧校正並對齊使用者名下所有歷史明細之分類 (修復舊版預設/未分類/簡稱之錯誤)
 */
export async function reconcileUserTransactionCategories(
  userId: string,
  categories: Category[]
): Promise<number> {
  try {
    const targetId = normalizeUserId(userId);
    const activeCats = categories.filter((c) => !c.deletedAt);
    if (activeCats.length === 0) return 0;

    const candidateUserIds = [targetId];
    if (targetId === SUPER_ADMIN_LINE_UID) {
      candidateUserIds.push(`line_${SUPER_ADMIN_LINE_USER_ID}`, SUPER_ADMIN_LINE_USER_ID);
    }

    const txSnaps = await Promise.all(
      candidateUserIds.map((uid) =>
        getDocs(query(collection(db, 'transactions'), where('userId', '==', uid)))
      )
    );

    const txDocs = txSnaps.flatMap((s) => s.docs);
    let updatedCount = 0;
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    for (const d of txDocs) {
      const tx = d.data() as Transaction;
      if (tx.deletedAt) continue;

      let targetCatName = '';
      const rawTitle = (tx.title || '').trim();
      const rawCatName = (tx.categoryName || '').trim();

      // 1. 若標題明確，依據品名規則優先判定
      if (/牛排|牛肉麵|伙食|餐費|便當|午餐|晚餐|早餐|美食|吃|喝|餐廳|咖啡|火鍋/i.test(rawTitle)) {
        targetCatName = '餐飲美食';
      } else if (/高鐵|捷運|車票|公車|客運|計程車|uber|交通/i.test(rawTitle)) {
        targetCatName = '交通運輸';
      } else if (/加油|機車|汽車|停車|驗車|車險/i.test(rawTitle)) {
        targetCatName = '汽機車輛';
      } else if (/冰箱|冷氣|洗衣機|電視|家電|家具|管理費|火險|修繕|日常用品/i.test(rawTitle)) {
        targetCatName = '居家生活';
      } else if (/水費|電費|瓦斯|天然氣|網路費/i.test(rawTitle)) {
        targetCatName = '水電瓦斯';
      } else if (/超商|衣服|鞋|包|購物|特價/i.test(rawTitle)) {
        targetCatName = '購物服飾';
      } else if (/電影|遊戲|展覽|唱歌|ktv|娛樂/i.test(rawTitle)) {
        targetCatName = '休閒娛樂';
      } else if (/健身|運動|瑜珈|羽球/i.test(rawTitle)) {
        targetCatName = '運動健身';
      } else if (/營養|維他命|藥|醫療|看診|牙醫|失能險/i.test(rawTitle)) {
        targetCatName = '醫療健康';
      } else if (/學費|書|買書|課程|進修/i.test(rawTitle)) {
        targetCatName = '學習進修';
      } else if (/youtube|icloud|netflix|spotify|訂閱/i.test(rawTitle)) {
        targetCatName = '數位訂閱';
      } else if (/禮金|紅包|送禮|伴手禮/i.test(rawTitle)) {
        targetCatName = '社交禮金';
      } else if (/民宿|飯店|旅遊|渡假|出國/i.test(rawTitle)) {
        targetCatName = '旅遊渡假';
      } else if (/貓|狗|寵物|毛孩|飼料/i.test(rawTitle)) {
        targetCatName = '毛孩寵物';
      } else if (/保險|地價稅|房屋稅|稅|勞保|健保|福委金/i.test(rawTitle)) {
        targetCatName = '保險稅務';
      } else if (/薪水|薪資|底薪/i.test(rawTitle)) {
        targetCatName = '正職薪資';
      } else if (/獎金|年終|津貼|分紅/i.test(rawTitle)) {
        targetCatName = '獎金津貼';
      } else if (/租金|客房|房租/i.test(rawTitle)) {
        targetCatName = '租金收入';
      } else if (/測試費用|雜支|其他/i.test(rawTitle)) {
        targetCatName = '其他雜支';
      }

      // 2. 若品名未命中，依據舊版分類簡稱對齊標準名稱
      if (!targetCatName) {
        const canonicalMap: Record<string, string> = {
          餐飲: '餐飲美食',
          交通: '交通運輸',
          居家家電: '居家生活',
          日常生活: '居家生活',
          居家水電: '水電瓦斯',
          水電: '水電瓦斯',
          購物: '購物服飾',
          娛樂: '休閒娛樂',
          醫療保健: '醫療健康',
          教育學習: '學習進修',
          人際送禮: '社交禮金',
          寵物毛孩: '毛孩寵物',
          薪資: '正職薪資',
          薪資收入: '正職薪資',
          其他: '其他雜支',
          '固定收支(定期收入)': tx.type === 'income' ? '正職薪資' : '其他雜支',
          '固定收支(沉澱基金)': '居家生活',
          一般: tx.type === 'income' ? '正職薪資' : '其他雜支',
        };
        targetCatName = canonicalMap[rawCatName] || rawCatName;
      }

      // 3. 在 activeCats 中尋找目標分類
      const matchedCat = activeCats.find(
        (c) =>
          c.name === targetCatName ||
          c.name.includes(targetCatName) ||
          targetCatName.includes(c.name)
      );

      const finalCatId = matchedCat?.id || tx.categoryId;
      const finalCatName = matchedCat?.name || targetCatName || rawCatName;

      const needUpdate =
        tx.categoryId !== finalCatId ||
        tx.categoryName !== finalCatName ||
        (d.data().userId !== targetId && targetId === SUPER_ADMIN_LINE_UID);

      if (needUpdate) {
        batch.update(d.ref, {
          userId: targetId,
          categoryId: finalCatId,
          categoryName: finalCatName,
          categoryIcon: matchedCat?.icon || tx.categoryIcon || '🏷️',
          updatedAt: now,
        });
        updatedCount++;
      }
    }

    // 4. 校正沉澱基金 Sinking Funds 之分類
    try {
      const fundSnaps = await Promise.all(
        candidateUserIds.map((uid) =>
          getDocs(query(collection(db, 'sinkingFunds'), where('userId', '==', uid)))
        )
      );
      for (const fDoc of fundSnaps.flatMap((s) => s.docs)) {
        const fData = fDoc.data();
        if (fData.deletedAt) continue;

        let fundCatName = '';
        const fTitle = (fData.title || '').trim();
        if (/薪水|薪資/i.test(fTitle)) fundCatName = '正職薪資';
        else if (/租金|客房/i.test(fTitle)) fundCatName = '租金收入';
        else if (/youtube|icloud|netflix|spotify/i.test(fTitle)) fundCatName = '數位訂閱';
        else if (/地價稅|房屋稅|稅|保險|勞保|健保|福委金/i.test(fTitle)) fundCatName = '保險稅務';
        else if (/管理費|火險/i.test(fTitle)) fundCatName = '居家生活';
        else if (/車險/i.test(fTitle)) fundCatName = '汽機車輛';
        else if (/失能險|營養|醫療/i.test(fTitle)) fundCatName = '醫療健康';

        if (fundCatName) {
          const matched = activeCats.find((c) => c.name === fundCatName);
          if (matched && (fData.categoryId !== matched.id || fData.userId !== targetId)) {
            batch.update(fDoc.ref, {
              userId: targetId,
              categoryId: matched.id,
              updatedAt: now,
            });
            updatedCount++;
          }
        }
      }
    } catch (fErr) {
      console.warn('[reconcile Sinking Funds notice]:', fErr);
    }

    if (updatedCount > 0) {
      await batch.commit();
      console.log(`[reconcileUserTransactionCategories] 成功校正 ${updatedCount} 筆交易與基金分類！`);
    }

    return updatedCount;
  } catch (err) {
    console.warn('[reconcileUserTransactionCategories notice]:', err);
    return 0;
  }
}

/**
 * 補齊並同步官方最新標準分類 (27 個官方標準分類，不影響用戶自訂分類)
 */
export async function syncAndSupplementCategories(
  userId: string,
  existingList?: Category[]
): Promise<Category[]> {
  try {
    const targetId = normalizeUserId(userId);
    const now = new Date().toISOString();
    const q = query(collection(db, 'categories'), where('userId', '==', targetId));
    const snap = await getDocs(q);
    const allDocs = snap.docs.map((d) => d.data() as Category);
    let activeList = existingList || allDocs.filter((c) => !c.deletedAt);

    const batch = writeBatch(db);
    let mutated = false;

    // 1. 若「餐飲美食」被意外標記 deletedAt，強制復活恢復
    const deletedDining = allDocs.find((c) => c.name === '餐飲美食' && c.deletedAt);
    if (deletedDining) {
      batch.update(doc(db, 'categories', deletedDining.id), {
        deletedAt: null,
        updatedAt: now,
        icon: '🍽️',
        color: '#F97316',
      });
      deletedDining.deletedAt = null;
      if (!activeList.some((c) => c.id === deletedDining.id)) {
        activeList.push(deletedDining);
      }
      mutated = true;
    }

    // 2. 舊版原型名稱平滑更名對齊
    const renameMap: Record<string, string> = {
      '薪資收入': '正職薪資',
      '獎金補貼': '獎金津貼',
      '投資回報': '投資理財',
    };

    for (const [oldName, newName] of Object.entries(renameMap)) {
      const oldCat = activeList.find((c) => c.name === oldName);
      const hasNew = activeList.some((c) => c.name === newName);
      if (oldCat && !hasNew) {
        batch.update(doc(db, 'categories', oldCat.id), {
          name: newName,
          updatedAt: now,
        });
        oldCat.name = newName;
        mutated = true;
      }
    }

    // 3. 檢查補齊官方支出缺項
    const activeNames = new Set(activeList.map((c) => c.name.trim()));
    for (const exp of DEFAULT_EXPENSE_CATEGORIES) {
      if (!activeNames.has(exp.name.trim())) {
        const id = `cat_exp_${targetId}_${exp.name}`;
        const newCat: Category = {
          id,
          userId: targetId,
          name: exp.name,
          icon: exp.icon,
          type: 'expense',
          color: exp.color,
          isDefault: true,
          createdAt: now,
          deletedAt: null,
        };
        batch.set(doc(db, 'categories', id), cleanForFirestore(newCat));
        activeList.push(newCat);
        activeNames.add(exp.name.trim());
        mutated = true;
      }
    }

    // 4. 檢查補齊官方收入缺項
    for (const inc of DEFAULT_INCOME_CATEGORIES) {
      if (!activeNames.has(inc.name.trim())) {
        const id = `cat_inc_${targetId}_${inc.name}`;
        const newCat: Category = {
          id,
          userId: targetId,
          name: inc.name,
          icon: inc.icon,
          type: 'income',
          color: inc.color,
          isDefault: true,
          createdAt: now,
          deletedAt: null,
        };
        batch.set(doc(db, 'categories', id), cleanForFirestore(newCat));
        activeList.push(newCat);
        activeNames.add(inc.name.trim());
        mutated = true;
      }
    }

    if (mutated) {
      await batch.commit();
    }

    return activeList;
  } catch (err) {
    console.warn('[syncAndSupplementCategories notice]:', err);
    return existingList || [];
  }
}

export async function initializeDefaultCategories(userId: string): Promise<Category[]> {
  const now = new Date().toISOString();
  const created: Category[] = [];

  for (const exp of DEFAULT_EXPENSE_CATEGORIES) {
    const id = `cat_exp_${userId}_${exp.name}`;
    const cat: Category = {
      id,
      userId,
      name: exp.name,
      icon: exp.icon,
      type: 'expense',
      color: exp.color,
      isDefault: true,
      createdAt: now,
      deletedAt: null,
    };
    await setDoc(doc(db, 'categories', id), cleanForFirestore(cat));
    created.push(cat);
  }

  for (const inc of DEFAULT_INCOME_CATEGORIES) {
    const id = `cat_inc_${userId}_${inc.name}`;
    const cat: Category = {
      id,
      userId,
      name: inc.name,
      icon: inc.icon,
      type: 'income',
      color: inc.color,
      isDefault: true,
      createdAt: now,
      deletedAt: null,
    };
    await setDoc(doc(db, 'categories', id), cleanForFirestore(cat));
    created.push(cat);
  }

  return created;
}

/**
 * 補齊缺失之預設分類（避免覆蓋用戶自訂名稱）
 */
export async function supplementMissingDefaultCategories(
  userId: string,
  existingCategories?: Category[]
): Promise<Category[]> {
  try {
    const currentList =
      existingCategories ||
      (
        await getDocs(query(collection(db, 'categories'), where('userId', '==', userId)))
      ).docs
        .map((d) => d.data() as Category)
        .filter((c) => !c.deletedAt);

    const existingNames = new Set(currentList.map((c) => c.name.trim()));
    const now = new Date().toISOString();
    const batch = writeBatch(db);
    const added: Category[] = [];

    // 檢查支出缺項
    for (const exp of DEFAULT_EXPENSE_CATEGORIES) {
      if (!existingNames.has(exp.name.trim())) {
        const id = `cat_exp_${userId}_${exp.name}`;
        const cat: Category = {
          id,
          userId,
          name: exp.name,
          icon: exp.icon,
          type: 'expense',
          color: exp.color,
          isDefault: true,
          createdAt: now,
          deletedAt: null,
        };
        batch.set(doc(db, 'categories', id), cleanForFirestore(cat));
        added.push(cat);
      }
    }

    // 檢查收入缺項
    for (const inc of DEFAULT_INCOME_CATEGORIES) {
      if (!existingNames.has(inc.name.trim())) {
        const id = `cat_inc_${userId}_${inc.name}`;
        const cat: Category = {
          id,
          userId,
          name: inc.name,
          icon: inc.icon,
          type: 'income',
          color: inc.color,
          isDefault: true,
          createdAt: now,
          deletedAt: null,
        };
        batch.set(doc(db, 'categories', id), cleanForFirestore(cat));
        added.push(cat);
      }
    }

    if (added.length > 0) {
      await batch.commit();
    }

    return [...currentList, ...added];
  } catch (error) {
    console.warn('[supplementMissingDefaultCategories warning]:', error);
    return existingCategories || [];
  }
}

export async function createCategory(
  userId: string,
  params: { name: string; icon: string; type: 'expense' | 'income'; color?: string }
): Promise<Category> {
  try {
    const targetId = normalizeUserId(userId);
    const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const cat: Category = {
      id,
      userId: targetId,
      name: params.name.trim(),
      icon: params.icon || '🏷️',
      type: params.type,
      color: params.color || '#64748B',
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    await setDoc(doc(db, 'categories', id), cleanForFirestore(cat));
    return cat;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'categories');
  }
}

export async function updateCategory(
  categoryId: string,
  updates: Partial<Pick<Category, 'name' | 'icon' | 'color'>>
): Promise<void> {
  try {
    const ref = doc(db, 'categories', categoryId);
    await updateDoc(
      ref,
      cleanForFirestore({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `categories/${categoryId}`);
  }
}

export async function softDeleteCategory(categoryId: string): Promise<void> {
  try {
    const ref = doc(db, 'categories', categoryId);
    await updateDoc(ref, {
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `categories/${categoryId}`);
  }
}

/**
 * AI 重複分類清洗與遷移
 * 找出相似同義名稱 (如 "吃飯" & "餐飲美食", "飲料" & "下午茶")，保留主分類，自動將明細遷移並刪除重複項
 */
export async function aiDeduplicateCategories(
  userId: string
): Promise<{ cleanedCount: number; mergedDetails: string[] }> {
  try {
    const categories = await getUserCategories(userId);
    const txSnap = await getDocs(
      query(collection(db, 'transactions'), where('userId', '==', userId))
    );
    const transactions = txSnap.docs.map((d) => d.data() as Transaction);

    const batch = writeBatch(db);
    let cleanedCount = 0;
    const mergedDetails: string[] = [];

    // 群組同義字判定
    const map = new Map<string, Category[]>();
    for (const cat of categories) {
      let key = cat.name.trim().toLowerCase();
      if (key.includes('餐') || key.includes('食') || key.includes('飯') || key.includes('吃')) key = '餐飲美食';
      if (key.includes('車') || key.includes('捷運') || key.includes('公車') || key.includes('油')) key = '交通運輸';
      if (key.includes('薪') || key.includes('工資')) key = '薪資收入';

      const existingGroup = map.get(key) || [];
      existingGroup.push(cat);
      map.set(key, existingGroup);
    }

    const now = new Date().toISOString();

    for (const [canonicalName, group] of map.entries()) {
      if (group.length > 1) {
        const primary = group[0];
        const duplicates = group.slice(1);

        for (const dup of duplicates) {
          cleanedCount++;
          mergedDetails.push(`將「${dup.name}」合併至「${primary.name}」`);
          // 軟刪除重複分類
          batch.update(doc(db, 'categories', dup.id), {
            deletedAt: now,
            updatedAt: now,
          });

          // 遷移明細
          transactions
            .filter((t) => t.categoryId === dup.id && !t.deletedAt)
            .forEach((t) => {
              batch.update(doc(db, 'transactions', t.id), {
                categoryId: primary.id,
                categoryName: primary.name,
                updatedAt: now,
              });
            });
        }
      }
    }

    if (cleanedCount > 0) {
      await batch.commit();
    }

    return { cleanedCount, mergedDetails };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'categories/deduplicate');
  }
}

export interface CategoryCleaningSuggestion {
  transactionId: string;
  transactionTitle: string;
  transactionAmount: number;
  currency: string;
  originalCategoryId: string;
  originalCategoryName: string;
  originalCategoryIcon: string;
  suggestedCategoryId: string;
  suggestedCategoryName: string;
  suggestedCategoryIcon: string;
  reason: string;
}

/**
 * 智慧比對歷史明細品名與分類，產出分類清洗遷移建議列表
 */
export function generateCategoryCleaningSuggestions(
  categories: Category[],
  transactions: Transaction[]
): CategoryCleaningSuggestion[] {
  const suggestions: CategoryCleaningSuggestion[] = [];
  const activeTxs = transactions.filter((t) => !t.deletedAt);
  const activeCategories = categories.filter((c) => !c.deletedAt);

  const KEYWORD_RULES: { keywords: string[]; targetName: string }[] = [
    { keywords: ['餐', '飯', '吃', '火鍋', '便當', '麵', '肉', '飲料', '咖啡', '星巴克', '早餐', '午餐', '晚餐', '消夜', '麥當勞', '壽司', '甜點', '炸雞', '茶', '牛排'], targetName: '餐飲美食' },
    { keywords: ['車', '捷運', '高鐵', '公車', 'uber', '計程車', '悠遊卡', '機票', '通行費', '客運', '火車'], targetName: '交通運輸' },
    { keywords: ['油', '加油', '機車', '機油', '汽車', '汽油', '停車', '停車費', '驗車', '車險'], targetName: '汽機車輛' },
    { keywords: ['水費', '電費', '瓦斯', '天然氣', '第四台', '網路費', '寬頻'], targetName: '水電瓦斯' },
    { keywords: ['房租', '管理費', '家具', '家電', '沙發', '修繕', '裝潢', '生活', '日用品', '家飾'], targetName: '居家生活' },
    { keywords: ['買', '購', '超商', '全家', '7-11', '全聯', '家樂福', '蝦皮', '好市多', '衣服', '鞋', '包', '服飾'], targetName: '購物服飾' },
    { keywords: ['薪', '工資', '薪水', '底薪'], targetName: '正職薪資' },
    { keywords: ['獎金', '分紅', '年終', '津貼'], targetName: '獎金津貼' },
    { keywords: ['投資', '股息', '利息', '股票', '基金'], targetName: '投資理財' },
    { keywords: ['電影', '遊戲', '展覽', '唱歌', 'ktv', '門票', '露營', '旅行', '玩', '娛樂'], targetName: '休閒娛樂' },
    { keywords: ['藥', '診所', '醫院', '看病', '保健', '口罩', '牙醫', '維他命', '醫療', '健保', '營養食品'], targetName: '醫療健康' },
    { keywords: ['保險', '地價稅', '房屋稅', '所得稅', '稅', '勞保', '福委金'], targetName: '保險稅務' },
    { keywords: ['netflix', 'spotify', 'disney', 'youtube', 'icloud', '訂閱'], targetName: '數位訂閱' },
    { keywords: ['貓', '狗', '飼料', '罐頭', '獸醫', '寵物', '毛孩'], targetName: '毛孩寵物' },
    { keywords: ['健身', '運動', '瑜珈', '跑步', '羽球'], targetName: '運動健身' },
    { keywords: ['書', '學費', '補習', '課程', '考試', '進修'], targetName: '學習進修' },
    { keywords: ['禮金', '紅包', '送禮', '伴手禮', '喜帖'], targetName: '社交禮金' },
    { keywords: ['飯店', '民宿', '渡假', '旅遊', '出國'], targetName: '旅遊渡假' },
  ];

  for (const tx of activeTxs) {
    const titleLower = (tx.title || '').toLowerCase();
    const currCat = activeCategories.find((c) => c.id === tx.categoryId);
    const currCatName = currCat?.name || tx.categoryName || '未分類';

    for (const rule of KEYWORD_RULES) {
      const isMatch = rule.keywords.some((kw) => titleLower.includes(kw.toLowerCase()));
      if (isMatch) {
        const targetCat = activeCategories.find(
          (c) => c.name.includes(rule.targetName) && c.type === tx.type
        );
        if (targetCat && targetCat.id !== tx.categoryId) {
          suggestions.push({
            transactionId: tx.id,
            transactionTitle: tx.title || '無標題交易',
            transactionAmount: tx.amount,
            currency: tx.currency || 'TWD',
            originalCategoryId: tx.categoryId,
            originalCategoryName: currCatName,
            originalCategoryIcon: currCat?.icon || '🏷️',
            suggestedCategoryId: targetCat.id,
            suggestedCategoryName: targetCat.name,
            suggestedCategoryIcon: targetCat.icon,
            reason: `品名符合「${rule.targetName}」語意`,
          });
          break;
        }
      }
    }
  }

  return suggestions.slice(0, 30);
}

