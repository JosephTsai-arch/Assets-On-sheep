import { getUserCategories } from './categoryService';
import { getUserAssetAccounts } from './walletService';
import { getUserFriends } from './friendService';
import { getUserExistingLedgers } from './lineStateManager';
import { UserAppContext } from './lineNlpParser';

/**
 * 快速撈取用戶真實財務配置 (包含自訂分類、錢包帳戶、現有帳本與好友清單)，提供給大模型進行高精準度回填
 */
export async function buildUserAppContext(userId: string): Promise<UserAppContext> {
  const [categories, accounts, ledgers, friends] = await Promise.all([
    getUserCategories(userId).catch(() => []),
    getUserAssetAccounts(userId).catch(() => []),
    getUserExistingLedgers(userId).catch(() => []),
    getUserFriends(userId).catch(() => []),
  ]);

  return {
    categories: categories.map((c) => ({ name: c.name, type: c.type })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    ledgers: ledgers.map((l) => ({
      id: l.id,
      name: l.name,
      isShared: l.isShared,
      memberNames: l.memberIds,
    })),
    friends: (friends || []).map((f) => ({ id: f.id, name: f.name })),
    todayStr: new Date().toISOString().split('T')[0],
  };
}
