import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { AssetSheepMascot } from '../../utils/mascotSvgs';
import {
  X,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Smartphone,
  Send,
  Pin,
  CreditCard,
  DollarSign,
  Check,
  RotateCcw,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { saveUserTourTopicCompleted } from '../../services/tourService';

interface LineRealTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onTourCompleted?: () => void;
}

export const LineRealTourModal: React.FC<LineRealTourModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onTourCompleted,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [copiedBotId, setCopiedBotId] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  const botBasicId = '@381dzsqt';
  const effectiveLineUserId =
    currentUser.lineUserId ||
    (currentUser.id.startsWith('line_') ? currentUser.id.replace('line_', '') : '');

  const lineChatDeepLink = `https://line.me/R/oaMessage/${botBasicId}/?${encodeURIComponent('吃到飽499')}`;
  const addBotUrl = `https://line.me/R/ti/p/${botBasicId}`;

  // 監聽此用戶的新手導覽進度與交易
  useEffect(() => {
    if (!isOpen || !currentUser.id) return;

    // 檢查現有進度
    const checkProgress = async () => {
      try {
        const snap = await getDoc(doc(db, 'user_tour_progress', currentUser.id));
        if (snap.exists()) {
          const data = snap.data();
          if (data.completedTopics?.includes('line_bot')) {
            setIsCompleted(true);
          }
        }
      } catch (err) {
        console.warn('Error reading tour progress:', err);
      }
    };
    checkProgress();

    // 即時監聽 Firestore
    const unsub = onSnapshot(doc(db, 'user_tour_progress', currentUser.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.completedTopics?.includes('line_bot')) {
          setIsCompleted(true);
        }
      }
    });

    return () => unsub();
  }, [isOpen, currentUser.id]);

  if (!isOpen) return null;

  // 觸發後端發送真實 LINE Push 訊息並啟動狀態機
  const handleStartRealLineTour = async () => {
    setIsStarting(true);
    setPushStatus(null);
    try {
      const res = await fetch('/api/tour/start-line-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          lineUserId: effectiveLineUserId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setPushStatus('✅ 導覽推播已送達您的 LINE 官方對話室！請打開 LINE 查看。');
        setActiveStep(2);
        // 提供直接跳轉至 LINE 聊天室
        window.open(lineChatDeepLink, '_blank');
      } else if (data.notLinked) {
        setPushStatus(`⚠️ 尚未連動 LINE 帳號，請先點擊下方按鈕加入官方機器人好友或輸入「我的帳號」。`);
      } else {
        setPushStatus(`⚠️ 發送失敗：${data.error || '請確認金鑰設定'}`);
      }
    } catch (err: any) {
      setPushStatus(`⚠️ 連線錯誤：${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  // 標記完成導覽
  const handleManualComplete = async () => {
    if (currentUser.id) {
      await saveUserTourTopicCompleted(currentUser.id, 'line_bot');
    }
    setIsCompleted(true);
    if (onTourCompleted) {
      onTourCompleted();
    }
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // 測試環境：真實調用 Webhook 執行全套記帳狀態機 (吃到飽499 -> 改信用卡 -> 改599 -> 確認入帳)
  const handleSimulateWebhook = async () => {
    setIsSimulating(true);
    setSimulationLog('📡 正在調用後端 Webhook 狀態機模擬實戰流程...');
    try {
      const res = await fetch('/api/tour/simulate-webhook-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
          lineUserId: effectiveLineUserId || `tour_${currentUser.id}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSimulationLog(`🎉 Webhook 狀態機已成功執行！\n• 接收「吃到飽499」\n• 狀態機切換扣款至「信用卡」\n• 狀態機修改金額至「599」\n• 正式入帳並更新進度！`);
        setIsCompleted(true);
        if (onTourCompleted) onTourCompleted();
      } else {
        setSimulationLog(`⚠️ 執行結果: ${data.error || '模擬失敗'}`);
      }
    } catch (err: any) {
      setSimulationLog(`⚠️ 執行錯誤: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const copyBotId = () => {
    navigator.clipboard.writeText(botBasicId);
    setCopiedBotId(true);
    setTimeout(() => setCopiedBotId(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#FAF7F2] rounded-3xl shadow-2xl border border-stone-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header 橫幅 */}
        <div className="p-5 sm:p-6 bg-white border-b border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#06c755]/10 border border-[#06c755]/30 flex items-center justify-center text-[#06c755] shadow-xs">
              <MessageSquare size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-stone-900 tracking-tight">
                  LINE 機器人真實對話記帳導覽
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-[#06c755]/15 text-[#05963f] border border-[#06c755]/30">
                  官方實戰連動
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                透過 Webhook 與官方小幫手傳訊息，在真實 LINE 聊天室完成新手任務！
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* 內容本體 (可滾動) */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* LINE 連動狀態卡片 */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <Smartphone size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-stone-800">
                    LINE 官方帳號：{botBasicId}
                  </span>
                  <button
                    onClick={copyBotId}
                    className="text-[10px] text-stone-500 hover:text-stone-800 flex items-center gap-0.5 bg-stone-100 hover:bg-stone-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    <Copy size={10} />
                    <span>{copiedBotId ? '已複製' : '複製ID'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  {effectiveLineUserId ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      已連動身分：{effectiveLineUserId.substring(0, 8)}...
                    </span>
                  ) : (
                    <span className="text-amber-600 font-bold flex items-center gap-1">
                      <AlertCircle size={12} />
                      尚未綁定 LINE ID，建議先加官方好友
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <a
                href={addBotUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all"
              >
                <span>加入好友</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* 實戰行動區塊 */}
          <div className="bg-gradient-to-br from-[#06c755]/10 via-emerald-50/50 to-white rounded-2xl p-4 sm:p-5 border border-[#06c755]/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-[#05963f]" />
                  <span>進入真實 LINE 機器人實戰新手導覽</span>
                </h3>
                <p className="text-xs text-stone-600 font-medium leading-relaxed max-w-md">
                  點擊下方按鈕，系統將透過 Webhook 與 Push Message 向您的 LINE 聊天室發送任務起點，引導您操作真實狀態機。
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <button
                  onClick={handleStartRealLineTour}
                  disabled={isStarting}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#06c755] hover:bg-[#05a346] active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <Send size={14} />
                  <span>{isStarting ? '正在發送推播...' : '🚀 啟動導覽並前往 LINE'}</span>
                </button>
                <a
                  href={lineChatDeepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all shadow-xs"
                >
                  <span>開啟對話</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>

            {pushStatus && (
              <div className="mt-3 p-2.5 rounded-xl bg-white/90 border border-emerald-200 text-xs font-bold text-stone-700 animate-in fade-in">
                {pushStatus}
              </div>
            )}
          </div>

          {/* 4 大步驟實戰指引清單 */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-500 px-1">
              實戰操作 4 步驟指引
            </h4>

            {/* 步驟 1 */}
            <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                1
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-xs font-black text-stone-900">
                  傳送訊息：「吃到飽499」
                </p>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  在 LINE 對話框輸入「吃到飽499」並送出，後端將調用 NLP 解析金額 499、餐飲分類，並回傳 Golden Layout 確認卡片。
                </p>
              </div>
            </div>

            {/* 步驟 2 */}
            <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center shrink-0">
                2
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-xs font-black text-stone-900 flex items-center gap-1">
                  <CreditCard size={13} className="text-amber-700" />
                  <span>點擊卡片【💳 改付款方式】，改用「信用卡」</span>
                </p>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  點擊按鈕後，機器人會引導選擇帳戶，直接點選或輸入「信用卡」，狀態機即刻更新扣款來源。
                </p>
              </div>
            </div>

            {/* 步驟 3 */}
            <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center shrink-0">
                3
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-xs font-black text-stone-900 flex items-center gap-1">
                  <DollarSign size={13} className="text-blue-700" />
                  <span>點擊卡片【💰 修改金額】，改為「599」</span>
                </p>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  輸入「599」，後端狀態機即時更新卡片金額為 TWD 599 元。
                </p>
              </div>
            </div>

            {/* 步驟 4 */}
            <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center shrink-0">
                4
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-xs font-black text-stone-900 flex items-center gap-1">
                  <Pin size={13} className="text-purple-700" />
                  <span>點擊【✅ 確認記帳】，並將官方小幫手設為「釘選」</span>
                </p>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  完成入帳！出門在外只要在 LINE 說一句話就能秒記帳，強烈建議長按聊天室設為「釘選 (Pin to Top)」。
                </p>
              </div>
            </div>
          </div>

          {/* 狀態監聽與恭喜完成提示 */}
          {isCompleted && (
            <div className="p-4 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center justify-between gap-3 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Check size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-black">🎉 恭喜完成真實 LINE 新手導覽！</h4>
                  <p className="text-xs opacity-90">
                    系統已偵測到完成記帳，已解鎖「LINE 對話記帳」專屬徽章！
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-800 font-black text-xs hover:bg-emerald-50 transition-all cursor-pointer shadow-xs shrink-0"
              >
                完成並關閉
              </button>
            </div>
          )}

          {/* 測試環境/開發模式：一鍵 Webhook 狀態機模擬驗證 */}
          <div className="p-3 bg-stone-100/70 rounded-2xl border border-stone-200/80 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-500">
                🛠️ 無手機或測試環境驗證
              </span>
              <button
                onClick={handleSimulateWebhook}
                disabled={isSimulating}
                className="text-[11px] font-black text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-300 cursor-pointer transition-all disabled:opacity-50"
              >
                {isSimulating ? '執行中...' : '🧪 執行後端 Webhook 狀態機實測'}
              </button>
            </div>
            {simulationLog && (
              <pre className="text-[10px] text-stone-600 bg-white p-2 rounded-lg border border-stone-200 font-mono whitespace-pre-wrap leading-tight">
                {simulationLog}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-stone-200 flex items-center justify-between shrink-0">
          <button
            onClick={handleManualComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer"
          >
            <CheckCircle2 size={14} />
            <span>我已在 LINE 完成，手動標記完成</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
          >
            暫停離開
          </button>
        </div>
      </div>
    </div>
  );
};
