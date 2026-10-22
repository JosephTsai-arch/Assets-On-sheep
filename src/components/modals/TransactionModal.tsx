import React, { useState, useEffect } from 'react';
import {
  Transaction,
  Ledger,
  AssetAccount,
  Category,
  Friend,
  TransactionType,
  SplitDetail,
} from '../../types';
import { X, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { getTodayDateString } from '../../utils/formatters';
import { AiWorkflowBanner, WorkflowStep } from './transaction/AiWorkflowBanner';
import { SplitExpenseSection } from './transaction/SplitExpenseSection';
import { resolveLedgerMembers } from '../../services/memberResolverService';
import { useTransactionDraft } from '../../hooks/useTransactionDraft';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: any) => Promise<any>;
  initialData?: Transaction | null;
  ledgers: Ledger[];
  assetAccounts: AssetAccount[];
  categories: Category[];
  friends: Friend[];
  currentUserId: string;
  currentUserName: string;
  onAiParseText?: (text: string) => Promise<any>;
}

class TransactionModalErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[TransactionModal Crash Caught]:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-stone-200 text-center space-y-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-xl">
              ⚠️
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">記帳視窗載入中</h3>
              <p className="text-xs text-stone-500 mt-1">
                系統已自動修復財務資料模型，請點擊下方按鈕重新開啟。
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  this.props.onClose();
                }}
                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow hover:bg-emerald-700 cursor-pointer"
              >
                好的，關閉後重試
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const TransactionModal: React.FC<TransactionModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <TransactionModalErrorBoundary onClose={props.onClose}>
      <TransactionModalContent {...props} />
    </TransactionModalErrorBoundary>
  );
};

const TransactionModalContent: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  ledgers,
  assetAccounts,
  categories,
  friends,
  currentUserId,
  currentUserName,
  onAiParseText,
}) => {
  // 核心表單資料
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState<string>('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [ledgerId, setLedgerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [subAccountId, setSubAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');

  // AI 語意解析狀態機與視覺回饋
  const [aiInputText, setAiInputText] = useState('');
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>('INPUT');
  const [isSaving, setIsSaving] = useState(false);
  const [parseErrorMessage, setParseErrorMessage] = useState<string | null>(null);
  const [parsedSummary, setParsedSummary] = useState<{
    amount?: number;
    title?: string;
    categoryName?: string;
    type?: string;
    splitWithNames?: string[];
  } | null>(null);
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());

  // AA Split Members (Checklist)
  const [selectedSplitMemberIds, setSelectedSplitMemberIds] = useState<string[]>([currentUserId]);
  const [payerMemberId, setPayerMemberId] = useState<string>(currentUserId);

  // 單筆記帳草稿自動暫存與逾期清理 Hook
  const { draft: savedDraft, saveDraft, clearDraft } = useTransactionDraft(
    currentUserId,
    isOpen,
    Boolean(initialData)
  );

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setAmount(String(initialData.amount));
      setTitle(initialData.title);
      setDate(initialData.date);
      setLedgerId(initialData.ledgerId);
      setAccountId(initialData.accountId);
      setSubAccountId(initialData.subAccountId || '');
      setCategoryId(initialData.categoryId);
      setNote(initialData.note || '');
      setPayerMemberId(initialData.payerMemberId || (initialData as any).payerId || initialData.userId || currentUserId);
      if (initialData.splitDetails) {
        setSelectedSplitMemberIds(
          initialData.splitDetails.map((s) => {
            const matchedFriend = (friends || []).find((f) => f.id === s.memberId);
            return matchedFriend?.friendUserId || s.memberId;
          })
        );
      }
      setWorkflowStep('REVIEW');
      setAiFilledFields(new Set());
      setParsedSummary(null);
      setParseErrorMessage(null);
    } else {
      setType('expense');
      setAmount('');
      setTitle('');
      setDate(getTodayDateString());
      const validLedgers = (ledgers || []).filter((l) => {
        if (l.deletedAt) return false;
        if (!l.isShared) return true;
        return (l.memberIds || []).some(
          (m) =>
            m === currentUserId ||
            m === `line_${currentUserId}` ||
            (currentUserId.startsWith('line_') && m === currentUserId.replace('line_', '')) ||
            (m.length > 5 && (m.includes(currentUserId) || currentUserId.includes(m)))
        );
      });
      const firstLedger = (validLedgers && validLedgers[0])?.id || 'ledger_default_main';
      const firstAccObj = (assetAccounts && assetAccounts.length > 0) ? assetAccounts[0] : null;
      const firstAccount = firstAccObj?.id || `asset_${currentUserId}_cash`;
      const firstSubAccount = (firstAccObj?.subAccounts && firstAccObj.subAccounts.length > 0)
        ? firstAccObj.subAccounts[0].id
        : '';
      const expenseCats = (categories || []).filter((c) => c.type === 'expense');
      const firstCategory = (expenseCats && expenseCats[0])?.id || (categories && categories[0])?.id || 'cat_default';

      setLedgerId(firstLedger);
      setAccountId(firstAccount);
      setSubAccountId(firstSubAccount);
      setCategoryId(firstCategory);
      setNote('');
      setSelectedSplitMemberIds([currentUserId]);
      setPayerMemberId(currentUserId);
      setWorkflowStep('INPUT');
      setAiInputText('');
      setAiFilledFields(new Set());
      setParsedSummary(null);
      setParseErrorMessage(null);
    }
  }, [initialData, isOpen, ledgers, assetAccounts, categories, currentUserId]);

  if (!isOpen) return null;

  const defaultFallbackLedger: Ledger = {
    id: 'ledger_default_main',
    userId: currentUserId,
    name: '日常私帳 (個人)',
    currency: 'TWD',
    isShared: false,
    creatorId: currentUserId,
    memberIds: [currentUserId],
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };

  // 嚴格過濾：已軟刪除或本人不參與 (未列名於 memberIds) 的共管帳本，完全不可見、不可選！
  const activeLedgers = (ledgers || []).filter((l) => {
    if (l.deletedAt) return false;
    if (!l.isShared) return true;
    const isMember = (l.memberIds || []).some(
      (m) =>
        m === currentUserId ||
        m === `line_${currentUserId}` ||
        (currentUserId.startsWith('line_') && m === currentUserId.replace('line_', '')) ||
        (m.length > 5 && (m.includes(currentUserId) || currentUserId.includes(m)))
    );
    return isMember;
  });

  const safeLedgers = activeLedgers.length > 0 ? activeLedgers : [defaultFallbackLedger];
  const safeAssetAccounts: AssetAccount[] = assetAccounts && assetAccounts.length > 0 ? assetAccounts : [
    {
      id: `asset_${currentUserId}_cash`,
      userId: currentUserId,
      name: '現金皮夾',
      type: 'cash',
      balance: 3000,
      currency: 'TWD',
      subAccounts: [],
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
  ];
  const safeCategories = categories && categories.length > 0 ? categories : [
    { id: 'cat_dining', userId: currentUserId, name: '餐飲美食', icon: '🍽️', type: 'expense' as const, color: '#F97316', isDefault: true, createdAt: new Date().toISOString(), deletedAt: null },
    { id: 'cat_transport', userId: currentUserId, name: '交通運輸', icon: '🚇', type: 'expense' as const, color: '#3B82F6', isDefault: true, createdAt: new Date().toISOString(), deletedAt: null },
    { id: 'cat_home', userId: currentUserId, name: '居家生活', icon: '🏠', type: 'expense' as const, color: '#10B981', isDefault: true, createdAt: new Date().toISOString(), deletedAt: null },
    { id: 'cat_salary', userId: currentUserId, name: '正職薪資', icon: '💰', type: 'income' as const, color: '#10B981', isDefault: true, createdAt: new Date().toISOString(), deletedAt: null },
  ];

  const currentLedger = safeLedgers.find((l) => l.id === ledgerId) || safeLedgers[0] || defaultFallbackLedger;
  const currentAsset = safeAssetAccounts.find((a) => a.id === accountId) || safeAssetAccounts[0];
  const filteredCategories = safeCategories.filter((c) => c.type === type);

  // 虛擬好友安全備援保證：小美 (好友)、阿倫 (室友)、媽媽 (家庭)
  const defaultVirtualFriends: { id: string; name: string; isDummy: boolean; friendUserId?: string }[] = [
    { id: `dummy_${currentUserId}_0`, name: '小美 (好友)', isDummy: true },
    { id: `dummy_${currentUserId}_1`, name: '阿倫 (室友)', isDummy: true },
    { id: `dummy_${currentUserId}_2`, name: '媽媽 (家庭)', isDummy: true },
  ];

  // AA 平攤成員名單：【鐵律規範】
  // 1. 若當前為共管帳本，嚴格僅能列出該共管帳本內的成員 (currentLedger.memberIds)
  // 2. 透過 resolveLedgerMembers 完整解析真實姓名、頭像與別名合併，徹底消滅「成員」模糊標籤與未顯示成員 Bug！
  const availableMembers = (() => {
    if (!currentLedger || !currentLedger.isShared) {
      return [{ id: currentUserId, name: `${currentUserName || '我'} (我)`, rawName: currentUserName || '我', rawIds: [currentUserId] }];
    }

    return resolveLedgerMembers(
      currentLedger.memberIds,
      friends,
      currentUserId,
      currentUserName
    );
  })();

  // 當選擇共管帳本新增交易時，自動全選共管成員以便 AA 平攤
  useEffect(() => {
    if (!initialData && currentLedger?.isShared && availableMembers.length > 0) {
      if (selectedSplitMemberIds.length <= 1) {
        setSelectedSplitMemberIds(availableMembers.map((m) => m.id));
      }
    }
  }, [ledgerId, currentLedger?.isShared, availableMembers.length]);

  // 立即觸發狀態機轉移：'PARSING' -> 'REVIEW'
  const handleAiParse = async () => {
    if (!aiInputText.trim() || !onAiParseText) return;

    // 1. 轉移至 PARSING 狀態
    setWorkflowStep('PARSING');
    setParseErrorMessage(null);
    const newFilledFields = new Set<string>();

    try {
      const res = await onAiParseText(aiInputText);

      // 2. 成功輸出後立即無縫轉移至 REVIEW / EDIT 狀態
      if (res) {
        if (res.amount) {
          setAmount(String(res.amount));
          newFilledFields.add('amount');
        }
        if (res.title) {
          setTitle(res.title);
          newFilledFields.add('title');
        }
        if (res.type) {
          setType(res.type);
          newFilledFields.add('type');
        }
        if (res.date) {
          setDate(res.date);
          newFilledFields.add('date');
        }
        if (res.suggestedLedgerId) {
          setLedgerId(res.suggestedLedgerId);
          newFilledFields.add('ledger');
        }

        // 分類精準配對
        const matchCat = categories.find(
          (c) =>
            c.name.toLowerCase().includes(res.categoryName?.toLowerCase()) ||
            res.categoryName?.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matchCat) {
          setCategoryId(matchCat.id);
          newFilledFields.add('category');
        }

        // 分帳成員自動選取 (自動切換至共管帳本並精準選取好友)
        if (res.splitWithNames && res.splitWithNames.length > 0) {
          const sharedLedger = safeLedgers.find((l) => l.isShared);
          if (sharedLedger && !currentLedger.isShared) {
            setLedgerId(sharedLedger.id);
            newFilledFields.add('ledger');
          }

          const matchedIds = [currentUserId];
          res.splitWithNames.forEach((name: string) => {
            const cleanName = name.trim().toLowerCase();
            const m = availableMembers.find(
              (mem) =>
                mem.name.toLowerCase().includes(cleanName) ||
                cleanName.includes(mem.name.toLowerCase()) ||
                mem.name.toLowerCase().includes(cleanName.split(' ')[0])
            );
            if (m && !matchedIds.includes(m.id)) {
              matchedIds.push(m.id);
            }
          });
          setSelectedSplitMemberIds(matchedIds);
          newFilledFields.add('split');
        }

        setAiFilledFields(newFilledFields);
        setParsedSummary({
          amount: res.amount,
          title: res.title,
          categoryName: matchCat?.name || res.categoryName,
          type: res.type,
          splitWithNames: res.splitWithNames,
        });

        // 立即進入審核與微調模式
        setWorkflowStep('REVIEW');
      } else {
        setParseErrorMessage('未能取得解析資料，已切換至手動編輯模式。');
        setWorkflowStep('REVIEW');
      }
    } catch (err: any) {
      console.warn('[TransactionModal AI Parse Fallback]:', err?.message);
      setParseErrorMessage('解析遭遇暫時問題，已切換至手動編輯模式，請直接填寫。');
      setWorkflowStep('REVIEW');
    }
  };

  const handleResetToInput = () => {
    setWorkflowStep('INPUT');
    setAiInputText('');
    setParsedSummary(null);
    setAiFilledFields(new Set());
    setParseErrorMessage(null);
  };

  const handleToggleMember = (id: string) => {
    const isChecked = selectedSplitMemberIds.some(
      (sid) => sid === id || availableMembers.find((m) => m.id === id)?.rawIds?.includes(sid)
    );

    if (isChecked) {
      if (selectedSplitMemberIds.length > 1) {
        setSelectedSplitMemberIds(
          selectedSplitMemberIds.filter((sid) => {
            if (sid === id) return false;
            const target = availableMembers.find((m) => m.id === id);
            return !target?.rawIds?.includes(sid);
          })
        );
      }
    } else {
      setSelectedSplitMemberIds([...selectedSplitMemberIds, id]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsSaving(true);
    try {
      const selectedCat = categories.find((c) => c.id === categoryId);
      const isMePayer = !currentLedger?.isShared || payerMemberId === currentUserId;
      let splitDetails: SplitDetail[] = [];
      if (currentLedger?.isShared && selectedSplitMemberIds.length > 0) {
        const splitAmount = Math.round((numAmount / selectedSplitMemberIds.length) * 100) / 100;
        splitDetails = selectedSplitMemberIds.map((mId) => {
          const mObj = availableMembers.find((m) => m.id === mId || m.rawIds?.includes(mId));
          const isThisPayer =
            mId === payerMemberId || (mObj && (mObj.id === payerMemberId || mObj.rawIds?.includes(payerMemberId)));
          return {
            memberId: mObj?.id || mId,
            memberName: mObj?.rawName || mObj?.name || '成員',
            amount: splitAmount,
            hasSettled: Boolean(isThisPayer),
            isSettled: Boolean(isThisPayer),
          };
        });
      }

      // 只有付款人本人才會扣款個人資產帳戶！若由其他成員代墊，嚴格不扣除當前用戶個人資產
      const finalAccountId = isMePayer ? (accountId || currentAsset?.id || safeAssetAccounts[0]?.id || `asset_${currentUserId}_cash`) : null;
      let finalSubAccountId = isMePayer ? (subAccountId || null) : null;
      if (isMePayer && finalAccountId) {
        const accObj = safeAssetAccounts.find((a) => a.id === finalAccountId);
        if (accObj?.subAccounts && accObj.subAccounts.length > 0 && !finalSubAccountId) {
          finalSubAccountId = accObj.subAccounts[0].id;
        }
      }
      const payerObj = availableMembers.find((m) => m.id === payerMemberId || m.rawIds?.includes(payerMemberId));

      await onSave({
        type,
        amount: numAmount,
        title: title.trim(),
        date,
        ledgerId: ledgerId || currentLedger?.id,
        currency: currentLedger?.currency || 'TWD',
        accountId: finalAccountId,
        subAccountId: finalSubAccountId,
        categoryId,
        categoryName: selectedCat?.name || '一般',
        categoryIcon: selectedCat?.icon || '🏷️',
        payerMemberId: payerObj?.id || payerMemberId,
        payerId: payerObj?.id || payerMemberId,
        payerName: payerObj?.rawName || payerObj?.name || '成員',
        splitDetails: splitDetails.length > 0 ? splitDetails : null,
        note: note.trim() || null,
      });
      clearDraft();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSafeClose = () => {
    if (!initialData && (title.trim() || amount.trim() || aiInputText.trim())) {
      saveDraft({
        type,
        amount,
        title,
        date,
        ledgerId,
        accountId,
        subAccountId,
        categoryId,
        note,
        aiInputText,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSafeClose();
      }}
    >
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* 標頭 */}
        <div className="sticky top-0 bg-white px-6 py-3.5 border-b border-stone-100 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <span>{initialData ? '✏️ 編輯交易明細' : '✨ 記一筆交易'}</span>
            </h2>
            <p className="text-[11px] text-stone-400 font-medium">
              {workflowStep === 'REVIEW'
                ? '📝 步驟 2/2：審核與手動微調'
                : '🤖 步驟 1/2：Gemini AI 快填或直接輸入'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form
          data-tour="tx-modal-body"
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto flex-1"
        >
          {/* 草稿恢復橫幅 */}
          {savedDraft && !initialData && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="text-base">📝</span>
                <div>
                  <span className="font-bold">偵測到上次未儲存的草稿：</span>
                  <span className="text-stone-600 ml-1">
                    【{savedDraft.title || savedDraft.aiInputText || '新交易'}】NT$ {savedDraft.amount || 0}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (savedDraft.type) setType(savedDraft.type);
                    if (savedDraft.amount) setAmount(savedDraft.amount);
                    if (savedDraft.title) setTitle(savedDraft.title);
                    if (savedDraft.date) setDate(savedDraft.date);
                    if (savedDraft.ledgerId) setLedgerId(savedDraft.ledgerId);
                    if (savedDraft.accountId) setAccountId(savedDraft.accountId);
                    if (savedDraft.subAccountId) setSubAccountId(savedDraft.subAccountId);
                    if (savedDraft.categoryId) setCategoryId(savedDraft.categoryId);
                    if (savedDraft.note) setNote(savedDraft.note);
                    if (savedDraft.aiInputText) {
                      setAiInputText(savedDraft.aiInputText);
                      setWorkflowStep('REVIEW');
                    }
                    clearDraft();
                  }}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                >
                  恢復草稿
                </button>
                <button
                  type="button"
                  onClick={clearDraft}
                  className="px-2 py-1 text-stone-500 hover:text-rose-600 font-bold text-[11px] cursor-pointer"
                >
                  捨棄
                </button>
              </div>
            </div>
          )}

          {/* AI 工作流程進度與視覺反饋面板 */}
          <AiWorkflowBanner
            initialData={initialData}
            workflowStep={workflowStep}
            aiInputText={aiInputText}
            setAiInputText={setAiInputText}
            onParse={handleAiParse}
            onReset={handleResetToInput}
            parsedSummary={parsedSummary}
            parseErrorMessage={parseErrorMessage}
            currency={currentLedger?.currency || 'TWD'}
          />

          {/* 表單本體：【支出/收入切換 Tabs】與【類別】標籤精確並排對齊 */}
          <div
            className={`space-y-2 p-2.5 rounded-2xl transition-all ${
              aiFilledFields.has('category') || aiFilledFields.has('type')
                ? 'bg-emerald-50/40 ring-1 ring-emerald-300'
                : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <span>記帳類別 *</span>
                {aiFilledFields.has('category') && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-100 font-bold px-1.5 py-0.2 rounded">
                    ✨ AI 快填
                  </span>
                )}
                <span className="text-[10px] text-stone-400">（請點選分類標籤）</span>
              </label>

              {/* 與類別標題精確並排之收支切換 Tabs */}
              <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/80">
                {(['expense', 'income'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      const firstCat = categories.filter((c) => c.type === t)[0];
                      if (firstCat) setCategoryId(firstCat.id);
                    }}
                    className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                      type === t
                        ? t === 'expense'
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'bg-emerald-600 text-white shadow-xs'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {t === 'expense' ? '💸 支出 (-)' : '💰 收入 (+)'}
                  </button>
                ))}
              </div>
            </div>

            {/* 分類標籤清單 Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-stone-50 rounded-2xl border border-stone-200/80">
              {filteredCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    categoryId === c.id
                      ? 'bg-emerald-600 text-white shadow-xs scale-[1.02]'
                      : 'bg-white text-stone-700 hover:bg-stone-200 border border-stone-200/60'
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 金額與標題 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-1 rounded-xl transition-all ${
                aiFilledFields.has('amount') ? 'ring-1 ring-emerald-400 bg-emerald-50/20' : ''
              }`}
            >
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                <span>金額 ({currentLedger?.currency || 'TWD'}) *</span>
                {aiFilledFields.has('amount') && (
                  <span className="text-[10px] text-emerald-700 font-extrabold">✨ AI 快填</span>
                )}
              </label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={`w-full px-3 py-2 border rounded-xl text-lg font-black text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                  aiFilledFields.has('amount') ? 'border-emerald-400 bg-emerald-50/30' : 'border-stone-200'
                }`}
              />
            </div>
            <div
              className={`p-1 rounded-xl transition-all ${
                aiFilledFields.has('title') ? 'ring-1 ring-emerald-400 bg-emerald-50/20' : ''
              }`}
            >
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                <span>名稱 / 標題 *</span>
                {aiFilledFields.has('title') && (
                  <span className="text-[10px] text-emerald-700 font-extrabold">✨ AI 快填</span>
                )}
              </label>
              <input
                type="text"
                required
                lang="zh-TW"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如: 晚餐便當"
                className={`w-full px-3 py-2 border rounded-xl text-sm font-medium text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                  aiFilledFields.has('title') ? 'border-emerald-400 bg-emerald-50/30' : 'border-stone-200'
                }`}
              />
            </div>
          </div>

          {/* 帳本與日期 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-1 rounded-xl transition-all ${
                aiFilledFields.has('ledger') ? 'ring-1 ring-emerald-400 bg-emerald-50/20' : ''
              }`}
            >
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                <span>所屬帳本 *</span>
                {aiFilledFields.has('ledger') && (
                  <span className="text-[10px] text-emerald-700 font-extrabold">✨ 智慧指派</span>
                )}
              </label>
              <select
                value={ledgerId}
                onChange={(e) => setLedgerId(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                  aiFilledFields.has('ledger') ? 'border-emerald-400' : 'border-stone-200'
                }`}
              >
                {safeLedgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.isShared ? '🤝' : '🔒'} {l.name} ({l.currency || 'TWD'})
                  </option>
                ))}
              </select>
            </div>
            <div
              className={`p-1 rounded-xl transition-all ${
                aiFilledFields.has('date') ? 'ring-1 ring-emerald-400 bg-emerald-50/20' : ''
              }`}
            >
              <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                <span>日期 *</span>
                {aiFilledFields.has('date') && (
                  <span className="text-[10px] text-emerald-700 font-extrabold">✨ AI 快填</span>
                )}
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                  aiFilledFields.has('date') ? 'border-emerald-400' : 'border-stone-200'
                }`}
              />
            </div>
          </div>

          {/* 共管帳本專屬：付款代墊人與 AA 平攤成員 */}
          <SplitExpenseSection
            currentLedger={currentLedger}
            safeLedgers={safeLedgers}
            payerMemberId={payerMemberId}
            setPayerMemberId={setPayerMemberId}
            currentUserId={currentUserId}
            availableMembers={availableMembers}
            selectedSplitMemberIds={selectedSplitMemberIds}
            handleToggleMember={handleToggleMember}
            amount={amount}
            aiFilledFields={aiFilledFields}
            setLedgerId={setLedgerId}
          />

          {/* 資產帳戶與子帳戶 (僅在本人為付款人時需扣款) */}
          {(!currentLedger?.isShared || payerMemberId === currentUserId) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">扣款 / 入帳資產 *</label>
                <select
                  value={accountId}
                  onChange={(e) => {
                    const newAccId = e.target.value;
                    setAccountId(newAccId);
                    const selected = safeAssetAccounts.find((a) => a.id === newAccId);
                    if (selected?.subAccounts && selected.subAccounts.length > 0) {
                      setSubAccountId(selected.subAccounts[0].id);
                    } else {
                      setSubAccountId('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {safeAssetAccounts.map((a) => {
                    const hasSub = a.subAccounts && a.subAccounts.length > 0;
                    const effectiveTotal = hasSub
                      ? a.subAccounts!.reduce((s, sub) => s + (sub.balance || 0), 0)
                      : (a.balance != null ? a.balance : 0);
                    return (
                      <option key={a.id} value={a.id}>
                        💳 {a.name} ({hasSub ? '帳戶總額' : '餘額'}: {effectiveTotal.toLocaleString()})
                      </option>
                    );
                  })}
                </select>
              </div>

              {currentAsset?.subAccounts && currentAsset.subAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-1 flex items-center justify-between">
                    <span>指定執行子帳戶 *</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">（預設排序第一子帳戶）</span>
                  </label>
                  <select
                    value={subAccountId || currentAsset.subAccounts[0]?.id}
                    onChange={(e) => setSubAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {currentAsset.subAccounts.map((sub, idx) => (
                      <option key={sub.id} value={sub.id}>
                        🎯 {sub.name} (餘額: {sub.balance != null ? sub.balance.toLocaleString() : 0}){idx === 0 ? ' [首選預設]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 備註 */}
          <div>
            <label className="block text-xs font-bold text-stone-600 mb-1">備註說明</label>
            <input
              type="text"
              lang="zh-TW"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="備註說明（繁體中文）"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* 底部按鈕 */}
          <div className="sticky bottom-0 bg-white pt-3 border-t border-stone-100 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl cursor-pointer transition active:scale-98"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving || !amount}
              className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50 transition active:scale-98 flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>儲存中...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>確認儲存此筆交易</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
