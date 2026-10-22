import React, { useState } from 'react';
import { Category, Transaction } from '../../types';
import { X, Tag, Plus, Edit3, Check } from 'lucide-react';
import { InlineConfirm } from '../common/InlineConfirm';
import { AICleaningEngine } from './AICleaningEngine';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  transactions?: Transaction[];
  onAddCategory: (params: { name: string; icon: string; type: 'expense' | 'income'; color?: string }) => Promise<any>;
  onUpdateCategory?: (id: string, updates: Partial<Category>) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onAiCleanDuplicates?: () => Promise<{ cleanedCount: number; mergedDetails: string[] }>;
  onTransactionsUpdated?: () => void;
}

// 內建 20 個記帳常用點選式 Emoji (嚴禁手動文字輸入)
export const PRESET_BOOKKEEPING_EMOJIS = [
  '🍜', '🍱', '☕', '🛒', '🚗', '🚇', '🏠', '💡',
  '🎮', '🎬', '💊', '✈️', '📱', '👕', '📚', '💰',
  '💼', '📈', '🎁', '🐾',
];

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  transactions = [],
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onTransactionsUpdated,
}) => {
  const [tab, setTab] = useState<'expense' | 'income'>('expense');
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🍜');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('🍜');

  if (!isOpen) return null;

  const currentList = categories.filter((c) => c.type === tab);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onAddCategory({
      name: newName.trim(),
      icon: newIcon,
      type: tab,
    });
    setNewName('');
    setNewIcon('🍜');
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon || '🍜');
  };

  const handleSaveEdit = async (catId: string) => {
    if (!editName.trim() || !onUpdateCategory) return;
    await onUpdateCategory(catId, {
      name: editName.trim(),
      icon: editIcon || '🍜',
    });
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[88vh]">
        {/* 標頭 */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <Tag size={18} className="text-emerald-600" />
            <span>🏷️ 收/支記帳分類管理</span>
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-stone-400 hover:text-stone-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* AI 智慧分類清洗引擎 (審查清單與 writeBatch 原子寫入) */}
          <AICleaningEngine
            categories={categories}
            transactions={transactions}
            onCleanApplied={onTransactionsUpdated}
          />

          {/* 收/支切換籤頁 */}
          <div className="flex bg-stone-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('expense')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'expense' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
              }`}
            >
              支出類別
            </button>
            <button
              type="button"
              onClick={() => setTab('income')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'income' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
              }`}
            >
              收入類別
            </button>
          </div>

          {/* 點選式 Emoji 網格選擇區 (嚴禁文字輸入防呆) */}
          <div className="space-y-1.5 p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between text-xs font-bold text-stone-700">
              <span>點選專屬圖標 (防呆限制)：</span>
              <span className="text-[11px] text-emerald-700 font-extrabold">已選：{newIcon}</span>
            </div>
            <div className="grid grid-cols-10 gap-1.5 pt-1">
              {PRESET_BOOKKEEPING_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewIcon(emoji)}
                  className={`h-8 rounded-xl flex items-center justify-center text-sm transition-all cursor-pointer ${
                    newIcon === emoji
                      ? 'bg-emerald-600 text-white shadow-xs scale-110 ring-2 ring-emerald-400'
                      : 'bg-white hover:bg-stone-200 border border-stone-200/60'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 新增分類表單 */}
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <div className="w-10 h-9 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-center text-lg shrink-0">
              {newIcon}
            </div>
            <input
              type="text"
              required
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新分類名稱 (例如: 貓咪用品、日料便當)"
              className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Plus size={14} />
              <span>新增</span>
            </button>
          </form>

          {/* 分類列表與編輯/刪除 */}
          <div className="space-y-2 max-h-56 overflow-y-auto pt-1">
            {currentList.map((c) => {
              const isEditing = editingId === c.id;

              if (isEditing) {
                return (
                  <div
                    key={c.id}
                    className="p-2.5 bg-emerald-50/70 border border-emerald-300 rounded-2xl space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 border border-emerald-200">
                        {editIcon}
                      </span>
                      <input
                        type="text"
                        required
                        lang="zh-TW"
                        inputMode="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        onClick={() => handleSaveEdit(c.id)}
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                        title="儲存變更"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 bg-stone-200 hover:bg-stone-300 text-stone-600 rounded-lg cursor-pointer"
                        title="取消"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* 編輯狀態下的點選式圖標選取器 (防止手動打字破版) */}
                    <div className="flex flex-wrap gap-1 pt-1.5 border-t border-emerald-200/60">
                      {PRESET_BOOKKEEPING_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setEditIcon(emoji)}
                          className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center cursor-pointer transition-all ${
                            editIcon === emoji
                              ? 'bg-emerald-600 text-white scale-110 font-bold'
                              : 'bg-white hover:bg-emerald-100 border border-stone-200/50'
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2.5 bg-stone-50 border border-stone-200/60 rounded-xl hover:border-stone-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{c.icon}</span>
                    <span className="text-xs font-bold text-stone-800">{c.name}</span>
                    {c.isDefault && (
                      <span className="text-[10px] text-stone-400 font-medium px-1.5 py-0.5 bg-stone-200 rounded-md">
                        預設
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleStartEdit(c)}
                      className="p-1 text-stone-400 hover:text-emerald-700 rounded-md transition-colors cursor-pointer"
                      title="編輯分類"
                    >
                      <Edit3 size={15} />
                    </button>

                    {!c.isDefault && (
                      <InlineConfirm
                        onConfirm={() => onDeleteCategory(c.id)}
                        title={`確定刪除分類「${c.name}」？`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
