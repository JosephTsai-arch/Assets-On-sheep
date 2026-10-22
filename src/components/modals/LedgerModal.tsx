import React, { useState, useEffect } from 'react';
import { Ledger, LedgerCurrency, Friend } from '../../types';
import { X, BookOpen, Users, Lock, Check, Trash2 } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';
import { resolveLedgerMembers } from '../../services/memberResolverService';

interface LedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (ledgerData: any) => Promise<void>;
  onDelete?: (ledgerId: string) => Promise<void>;
  initialData?: Ledger | null;
  friends: Friend[];
  currentUserId: string;
}

export const LedgerModal: React.FC<LedgerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  friends,
  currentUserId,
}) => {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<LedgerCurrency>('TWD');
  const [isShared, setIsShared] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([currentUserId]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setCurrency(initialData.currency);
      setIsShared(initialData.isShared);
      setSelectedMemberIds(initialData.memberIds || [currentUserId]);
    } else {
      setName('');
      setCurrency('TWD');
      setIsShared(false);
      setSelectedMemberIds([currentUserId]);
    }
  }, [initialData, isOpen, currentUserId]);

  if (!isOpen) return null;

  const extraExistingMembers = initialData?.isShared
    ? resolveLedgerMembers(initialData.memberIds, friends, currentUserId).filter(
        (m) =>
          !m.isMe &&
          !friends.some(
            (f) =>
              f.id === m.id ||
              f.friendUserId === m.id ||
              m.rawIds?.includes(f.friendUserId || '') ||
              m.rawIds?.includes(f.id)
          )
      )
    : [];

  const handleToggleMember = (f: Friend) => {
    const targetId = f.friendUserId || f.id;
    const isCurrentlyChecked = selectedMemberIds.some(
      (id) =>
        id === f.id ||
        (f.friendUserId && (id === f.friendUserId || id === `line_${f.friendUserId}` || id.replace(/^line_/, '') === f.friendUserId))
    );

    if (isCurrentlyChecked) {
      setSelectedMemberIds(
        selectedMemberIds.filter(
          (id) =>
            id !== f.id &&
            id !== f.friendUserId &&
            (f.friendUserId ? id !== `line_${f.friendUserId}` && id.replace(/^line_/, '') !== f.friendUserId : true)
        )
      );
    } else {
      setSelectedMemberIds([...selectedMemberIds, targetId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const finalMemberIds = new Set<string>([currentUserId]);
      if (isShared) {
        selectedMemberIds.forEach((mId) => {
          const found = friends.find((f) => f.id === mId || f.friendUserId === mId);
          const foundExtra = extraExistingMembers.find((m) => m.id === mId || m.rawIds?.includes(mId));
          const canonicalId = found?.friendUserId || found?.id || foundExtra?.id || mId;
          if (canonicalId) {
            finalMemberIds.add(canonicalId);
          }
        });
      }

      await onSave({
        name: name.trim(),
        currency,
        isShared,
        memberIds: isShared ? Array.from(finalMemberIds) : [currentUserId],
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-600" />
            <span>{initialData ? '✏️ 編輯帳本' : '✨ 新增帳本'}</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">帳本名稱 *</label>
            <input
              type="text"
              required
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 2026 歐洲自助行"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm font-medium text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* 計價幣別選擇下拉選單 */}
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">計價幣別 (多幣別設定) *</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="TWD">🇹🇼 新台幣 (TWD - NT$)</option>
              <option value="JPY">🇯🇵 日圓 (JPY - ¥)</option>
              <option value="USD">🇺🇸 美元 (USD - $)</option>
              <option value="EUR">🇪🇺 歐元 (EUR - €)</option>
              <option value="CNY">🇨🇳 人民幣 (CNY - ¥)</option>
              <option value="KRW">🇰🇷 韓元 (KRW - ₩)</option>
              <option value="GBP">🇬🇧 英鎊 (GBP - £)</option>
            </select>
          </div>

          {/* 私人 / 共管類型 */}
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">帳本性質 *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsShared(false)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  !isShared
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                    : 'bg-stone-50 border-stone-200 text-stone-600'
                }`}
              >
                <Lock size={14} />
                <span>🔒 私人私帳</span>
              </button>
              <button
                type="button"
                onClick={() => setIsShared(true)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  isShared
                    ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                    : 'bg-stone-50 border-stone-200 text-stone-600'
                }`}
              >
                <Users size={14} />
                <span>🤝 好友共管</span>
              </button>
            </div>
          </div>

          {/* 共管成員下拉/勾選清單 (從好友名單選取) */}
          {isShared && (
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
              <label className="block text-xs font-bold text-amber-900 mb-1.5">
                從好友名單加入共管成員：
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                <div className="flex items-center justify-between p-2 bg-white rounded-xl text-xs font-bold text-stone-800 border border-amber-200/60">
                  <span>🙋‍♂️ 本人 (創建者)</span>
                  <span className="text-[10px] text-emerald-600">已固定</span>
                </div>
                {friends.map((f) => {
                  const isChecked = selectedMemberIds.some(
                    (id) => id === f.id || (f.friendUserId && id === f.friendUserId)
                  );
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleToggleMember(f)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium border transition-all cursor-pointer gap-2 ${
                        isChecked
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-stone-700 border-amber-200/60 hover:bg-amber-100/40'
                      }`}
                    >
                      <span className="truncate min-w-0 flex-1 text-left" title={f.name}>
                        {f.name} {f.isDummy ? '(虛擬專屬)' : ''}
                      </span>
                      {isChecked && <Check size={14} strokeWidth={3} className="shrink-0" />}
                    </button>
                  );
                })}

                {/* 現有帳本中尚未列名於好友清單的協作成員 */}
                {extraExistingMembers.map((m) => {
                  const isChecked = selectedMemberIds.some(
                    (id) => id === m.id || m.rawIds?.includes(id)
                  );
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (isChecked) {
                          setSelectedMemberIds(
                            selectedMemberIds.filter((id) => id !== m.id && !m.rawIds?.includes(id))
                          );
                        } else {
                          setSelectedMemberIds([...selectedMemberIds, m.id]);
                        }
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium border transition-all cursor-pointer gap-2 ${
                        isChecked
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-stone-700 border-amber-200/60 hover:bg-amber-100/40'
                      }`}
                    >
                      <span className="truncate min-w-0 flex-1 text-left" title={m.name}>
                        👤 {m.name} (協作成員)
                      </span>
                      {isChecked && <Check size={14} strokeWidth={3} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 bg-white pt-3 border-t border-stone-100 flex items-center gap-2">
            {initialData && onDelete && (
              <InlineConfirm
                onConfirm={async () => {
                  await onDelete(initialData.id);
                  onClose();
                }}
                title={`確定刪除帳本「${initialData.name}」？此操作將進行軟刪除。`}
                confirmText="確定刪除帳本"
                triggerButton={
                  <button
                    type="button"
                    title="軟刪除此帳本"
                    className="p-2.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer border border-stone-200 shrink-0 flex items-center justify-center"
                  >
                    <Trash2 size={15} />
                  </button>
                }
              />
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? '儲存中...' : '確認儲存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
