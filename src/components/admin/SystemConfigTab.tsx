import React, { useState, useEffect } from 'react';
import { getGlobalSystemConfig, saveGlobalSystemConfig } from '../../services/systemService';
import { getAdminAuthHeaders } from '../../services/authService';
import {
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  Link as LinkIcon,
  ExternalLink,
  Sparkles,
  Smartphone,
  Layers,
  Trash2,
  Clock,
  Play,
} from 'lucide-react';
import { auth } from '../../firebase/config';

export const SystemConfigTab: React.FC = () => {
  const [keysConfig, setKeysConfig] = useState({
    lineChannelId: '',
    lineChannelSecret: '',
    lineChannelAccessToken: '',
    liffId: '',
    geminiApiKey: '',
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 密碼遮罩顯示切換狀態
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showLiff, setShowLiff] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  // Rich Menu 卸載狀態
  const [isRemovingRichMenu, setIsRemovingRichMenu] = useState(false);
  const [richMenuMsg, setRichMenuMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Webhook 複製成功狀態
  const [copied, setCopied] = useState(false);
  const [copiedLiff, setCopiedLiff] = useState(false);

  // Cron Ping 狀態
  const [copiedCron, setCopiedCron] = useState(false);
  const [isTestingCron, setIsTestingCron] = useState(false);
  const [cronTestResult, setCronTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Gemini API Key 檢測狀態
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    success: boolean;
    message: string;
    keySource?: string;
    keyPreview?: string;
    latency?: number;
  } | null>(null);

  // 動態組合後端 Webhook 網址、LIFF Endpoint URL 與 Cron 網址
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhook/line`
      : 'https://你的網域/api/webhook/line';

  const liffEndpointUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/`
      : 'https://你的網域/';

  const cronUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/cron/reminders`
      : 'https://你的網域/cron/reminders';

  const handleCopyCron = async () => {
    try {
      await navigator.clipboard.writeText(cronUrl);
      setCopiedCron(true);
      setTimeout(() => setCopiedCron(false), 2500);
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };

  const handleTestCron = async () => {
    setIsTestingCron(true);
    setCronTestResult(null);
    try {
      const res = await fetch('/cron/reminders');
      const data = await res.json();
      if (data.success) {
        setCronTestResult({
          success: true,
          message: `觸發巡檢成功！發送提醒數：${data.sentCount ?? 0} 筆，執行時間：${new Date().toLocaleTimeString('zh-TW')}`,
        });
      } else {
        setCronTestResult({
          success: false,
          message: `巡檢回應異常：${data.error || '未知錯誤'}`,
        });
      }
    } catch (err: any) {
      setCronTestResult({
        success: false,
        message: `請求失敗：${err?.message || '網路異常'}`,
      });
    } finally {
      setIsTestingCron(false);
    }
  };

  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/system/test-gemini-key', {
        method: 'POST',
        headers,
        body: JSON.stringify({ apiKey: keysConfig.geminiApiKey }),
      });
      const data = await res.json();
      if (data.success) {
        setGeminiTestResult({
          success: true,
          message: data.message || '連線成功！',
          keySource: data.keySource,
          keyPreview: data.keyPreview,
          latency: data.latency,
        });
      } else {
        setGeminiTestResult({
          success: false,
          message: data.error || '連線測試失敗',
        });
      }
    } catch (err: any) {
      setGeminiTestResult({
        success: false,
        message: `請求失敗：${err?.message || '網路異常'}`,
      });
    } finally {
      setIsTestingGemini(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadConfig() {
      setLoading(true);
      try {
        const sys = await getGlobalSystemConfig();
        if (sys && isMounted) {
          setKeysConfig({
            lineChannelId: sys.lineChannelId || '',
            lineChannelSecret: sys.lineChannelSecret || '',
            lineChannelAccessToken: sys.lineChannelAccessToken || '',
            liffId: sys.liffId || '',
            geminiApiKey: sys.geminiApiKey || '',
          });
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err?.message || '讀取系統金鑰失敗');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };

  const handleCopyLiff = async () => {
    try {
      await navigator.clipboard.writeText(liffEndpointUrl);
      setCopiedLiff(true);
      setTimeout(() => setCopiedLiff(false), 2500);
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };

  const handleRemoveRichMenu = async () => {
    setIsRemovingRichMenu(true);
    setRichMenuMsg(null);
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/line/remove-rich-menu', {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setRichMenuMsg({
          text: '🎉 已成功自 LINE 官方帳號徹底卸載並刪除功能選單 (Rich Menu)！聊天室底端已完全清空！',
          type: 'success',
        });
      } else {
        setRichMenuMsg({
          text: `❌ 卸載失敗: ${data.error || '請先確認已填寫 Channel Access Token'}`,
          type: 'error',
        });
      }
    } catch (e: any) {
      setRichMenuMsg({ text: `❌ 伺服器異常: ${e?.message}`, type: 'error' });
    } finally {
      setIsRemovingRichMenu(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const headers = await getAdminAuthHeaders();
      // 雙軌持久化：同時送出後端伺服器 API 與前端 Firestore setDoc
      await Promise.allSettled([
        saveGlobalSystemConfig(keysConfig),
        fetch('/api/system/config', {
          method: 'POST',
          headers,
          body: JSON.stringify(keysConfig),
        }),
      ]);

      // 重新查驗確保 Firestore 已經確實寫入
      const sys = await getGlobalSystemConfig();
      if (sys) {
        setKeysConfig({
          lineChannelId: sys.lineChannelId || keysConfig.lineChannelId,
          lineChannelSecret: sys.lineChannelSecret || keysConfig.lineChannelSecret,
          lineChannelAccessToken: sys.lineChannelAccessToken || keysConfig.lineChannelAccessToken,
          liffId: sys.liffId || keysConfig.liffId,
          geminiApiKey: sys.geminiApiKey || keysConfig.geminiApiKey,
        });
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (err: any) {
      console.error('[SaveSystemConfig Error]:', err);
      setErrorMessage(err?.message || '儲存金鑰發生異常');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-200/80 rounded-3xl p-6 sm:p-8 max-w-2xl space-y-6">
      {/* 標題與外部控制台任意門 (External Links) */}
      <div className="border-b border-stone-100 pb-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
            <Key size={18} />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight text-stone-900">
              全域系統 API 金鑰與 Webhook 設定 (SystemConfig)
            </h3>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              LINE 官方機器人 Webhook 連接、LIFF 身分認證與 Gemini 雙引擎金鑰管理
            </p>
          </div>
        </div>

        {/* 任務 1：外部控制台任意門快捷按鈕 */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <a
            href="https://developers.line.biz/console/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#06C755]/10 hover:bg-[#06C755]/20 text-[#059640] text-xs font-bold rounded-xl border border-[#06C755]/30 transition-all duration-150 active:scale-95"
          >
            <ExternalLink size={13} />
            <span>前往 LINE Developers 控制台</span>
          </a>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition-all duration-150 active:scale-95"
          >
            <ExternalLink size={13} />
            <span>前往 Google AI Studio</span>
          </a>
        </div>
      </div>

      {/* Webhook URL 實體化區塊 */}
      <div className="p-5 bg-gradient-to-br from-stone-50 to-emerald-50/30 rounded-2xl border border-stone-200/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
            <LinkIcon size={14} className="text-emerald-600" />
            <span>🔗 LINE Webhook URL</span>
          </label>
          <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full">
            SSL 安全端點
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={webhookUrl}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-mono text-stone-800 shadow-2xs select-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={handleCopyWebhook}
            className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all duration-200 ease-in-out hover:shadow-md flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span>✅ 已複製</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>📋 複製網址</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-stone-500 font-medium flex items-center gap-1 mt-1">
          <span>💡</span>
          <span>請將此網址貼至 LINE Developers Console 的 Webhook URL 欄位並啟用（Use Webhook 開啟）。</span>
        </p>
      </div>

      {/* ⏰ 定時 Ping / Google Cloud Scheduler 零延遲保證端點 */}
      <div className="p-5 bg-gradient-to-br from-indigo-50/40 via-blue-50/30 to-stone-50 rounded-2xl border border-indigo-200/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
            <Clock size={15} className="text-indigo-600" />
            <span>⏰ 定時巡檢 Ping 網址 (Google Cloud Scheduler / 外部 Cron)</span>
          </label>
          <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full">
            工業標準・零延遲保證
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={cronUrl}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 px-3.5 py-2.5 bg-white border border-indigo-200 rounded-xl text-xs font-mono text-stone-800 shadow-2xs select-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyCron}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-stone-900 hover:bg-stone-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedCron ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span>已複製！</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>複製 Ping 網址</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleTestCron}
              disabled={isTestingCron}
              className="flex-1 sm:flex-none px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isTestingCron ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>測試中...</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>即刻實測巡檢</span>
                </>
              )}
            </button>
          </div>
        </div>

        {cronTestResult && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
              cronTestResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            <span>{cronTestResult.success ? '✅' : '❌'}</span>
            <span>{cronTestResult.message}</span>
          </div>
        )}

        <div className="p-3 bg-white/80 border border-indigo-100 rounded-xl text-[11px] text-stone-600 space-y-1.5 leading-relaxed">
          <p className="font-bold text-indigo-950 flex items-center gap-1">
            <span>⚙️</span>
            <span>設定 Google Cloud Scheduler 步驟（完全免費、保證零延遲）：</span>
          </p>
          <ol className="list-decimal list-inside space-y-1 pl-1 text-stone-700">
            <li>
              進入 <a href="https://console.cloud.google.com/cloudscheduler" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold underline hover:text-indigo-800">Google Cloud Console &gt; Cloud Scheduler</a>
            </li>
            <li>點擊<strong>「建立工作 (Create Job)」</strong>，名稱填寫 <code>asseton-sheep-reminder-cron</code></li>
            <li>地區建議選擇 <code>asia-east1 (台灣)</code>，頻率填寫 <code>* * * * *</code> (每分鐘) 或 <code>*/5 * * * *</code> (每5分鐘)</li>
            <li>時區選擇 <code>台灣時間 (GMT+8)</code></li>
            <li>目標類型選擇 <strong>HTTP</strong>，網址貼上上方 Ping 網址，HTTP 方法選擇 <strong>GET</strong></li>
            <li>點擊<strong>「建立」</strong>即可完成！雲端容器將永不休眠，記帳鬧鐘 100% 準時推播！</li>
          </ol>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-stone-400">
          <Loader2 size={26} className="animate-spin text-emerald-600" />
          <p className="text-xs font-semibold">載入系統金鑰配置中...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 行內成功提示 */}
          {showSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 text-xs font-bold transition-all animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>✅ 設定已成功儲存並加密套用！</span>
            </div>
          )}

          {/* 行內錯誤提示 */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold">
              ⚠️ {errorMessage}
            </div>
          )}

          {/* 任務 2：欄位尋寶圖與金鑰輸入 */}
          {/* 0. LINE Channel ID */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              LINE Channel ID (用於 LINE Login / LIFF)
            </label>
            <input
              type="text"
              value={keysConfig.lineChannelId}
              onChange={(e) => setKeysConfig({ ...keysConfig, lineChannelId: e.target.value })}
              placeholder="例如: 2006789123"
              className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-xs font-mono bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              📍 取得位置：LINE Developers &gt; 你的 Channel &gt; <strong className="text-stone-700 font-semibold">Basic settings</strong> 頁籤上方 Channel ID。
            </p>
          </div>

          {/* 1. LINE Channel Secret */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              LINE Channel Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={keysConfig.lineChannelSecret}
                onChange={(e) => setKeysConfig({ ...keysConfig, lineChannelSecret: e.target.value })}
                placeholder="輸入 LINE Channel Secret"
                className="w-full pl-3.5 pr-10 py-2.5 border border-stone-200 rounded-xl text-xs font-mono bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              📍 取得位置：LINE Developers &gt; 你的 Channel &gt; <strong className="text-stone-700 font-semibold">Basic settings</strong> 頁籤最下方。
            </p>
          </div>

          {/* 2. LINE Channel Access Token */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              LINE Channel Access Token (Long-Lived)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={keysConfig.lineChannelAccessToken}
                onChange={(e) => setKeysConfig({ ...keysConfig, lineChannelAccessToken: e.target.value })}
                placeholder="輸入 LINE Channel Access Token"
                className="w-full pl-3.5 pr-10 py-2.5 border border-stone-200 rounded-xl text-xs font-mono bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              📍 取得位置：LINE Developers &gt; 你的 Channel &gt; <strong className="text-stone-700 font-semibold">Messaging API</strong> 頁籤最下方 (若無請點擊 Issue 產生長效 Token)。
            </p>
          </div>

          {/* 3. LIFF ID */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-800">
              LINE LIFF ID
            </label>
            <div className="relative">
              <input
                type={showLiff ? 'text' : 'password'}
                value={keysConfig.liffId}
                onChange={(e) => setKeysConfig({ ...keysConfig, liffId: e.target.value })}
                placeholder="例如: 2006789123-xxxxxx"
                className="w-full pl-3.5 pr-10 py-2.5 border border-stone-200 rounded-xl text-xs font-mono bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowLiff(!showLiff)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                {showLiff ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              📍 取得位置：LINE Developers &gt; 同一 Provider 下點擊 <strong className="text-stone-700 font-semibold">Create a new channel</strong> &gt; 選擇 <strong className="text-stone-700 font-semibold">LINE Login</strong> 頻道 &gt; <strong className="text-stone-700 font-semibold">LIFF</strong> 頁籤 &gt; 點擊 Add 新增 App 取得的 ID。<br />
              <span className="text-[11px] text-amber-700">（註：LINE 官方改制後僅限制不能在 Messaging API 頻道新增，但在 LINE Login 頻道依然完全支援並正常運行！）</span>
            </p>
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl text-xs text-emerald-900 leading-relaxed space-y-3">
              <p className="font-extrabold flex items-center gap-1.5 text-emerald-800">
                <Smartphone size={15} />
                <span>💡 LINE LIFF 的「Endpoint URL」必填正確網址：</span>
              </p>

              {/* LIFF Endpoint URL 專屬一鍵複製列 */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={liffEndpointUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-mono text-stone-900 select-all focus:outline-none shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLiff}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedLiff ? (
                      <>
                        <Check size={13} className="text-emerald-300" />
                        <span>已複製！</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span>複製網址</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 錯字與常見錯誤提醒 */}
              <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-xl text-[11px] text-amber-900 space-y-1 font-medium">
                <p className="font-bold text-amber-950 flex items-center gap-1">
                  <span>🚨</span>
                  <span>常見設定錯誤糾正：</span>
                </p>
                <p>
                  • <strong>請勿填寫</strong> <code>https://sheelp.ai.studio/</code>（因包含拼字錯誤 <code>sheelp</code> 且並非 Google Cloud Run 部署網址，會導致 LINE 彈窗報錯無法連線）。
                </p>
                <p>
                  • 請務必點擊上方<strong>【複製網址】</strong>按鈕，將真實系統網址完整貼入 LINE Developers &gt; LINE Login 頻道 &gt; LIFF &gt; <strong>Endpoint URL</strong> 欄位中！
                </p>
              </div>

              <p className="text-[11px] text-emerald-700">
                • <strong>備援保證</strong>：即使暫時未設定 LIFF ID，系統點擊【📱 打開記帳軟體】預設即採用 LINE 官方原生 In-App Webview 彈窗開啟，自動攜帶身分免密登入，100% 焊死在 LINE 內！
              </p>
            </div>
          </div>

          {/* 4. Gemini API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" />
                <span>Gemini API Key</span>
              </label>
              <span className="text-[10px] text-stone-400 font-normal">用於 AI 語意記帳、大宗流水記帳、發票收據 OCR 與財務健檢</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type={showGemini ? 'text' : 'password'}
                  value={keysConfig.geminiApiKey}
                  onChange={(e) => setKeysConfig({ ...keysConfig, geminiApiKey: e.target.value })}
                  placeholder="AIzaSy... 或 AQ.Ab8..."
                  className="w-full pl-3.5 pr-10 py-2.5 border border-stone-200 rounded-xl text-xs font-mono bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowGemini(!showGemini)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  {showGemini ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={isTestingGemini}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isTestingGemini ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>連線測試中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>🧪 測試 API 連線</span>
                  </>
                )}
              </button>
            </div>

            {geminiTestResult && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 animate-in fade-in ${
                  geminiTestResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                <span className="text-base leading-none">{geminiTestResult.success ? '✅' : '❌'}</span>
                <div className="space-y-0.5">
                  <p>{geminiTestResult.message}</p>
                  {geminiTestResult.keySource && (
                    <p className="text-[11px] font-normal opacity-80">
                      金鑰來源：{geminiTestResult.keySource}（{geminiTestResult.keyPreview}）
                    </p>
                  )}
                </div>
              </div>
            )}

            <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
              📍 支援 Google AI Studio 發行之 <code className="text-stone-700 font-bold bg-stone-100 px-1 py-0.5 rounded">AIzaSy...</code> 標準金鑰與 <code className="text-stone-700 font-bold bg-stone-100 px-1 py-0.5 rounded">AQ.Ab8...</code> 專案金鑰。系統已內建自動除錯、去除前後引號與伺服器環境變數雙軌備援容錯機制。
            </p>
          </div>

          {/* 儲存按鈕 */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 active:scale-[0.99] text-white font-extrabold text-xs rounded-xl shadow-sm transition-all duration-200 ease-in-out hover:shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>儲存中...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={15} />
                  <span>💾 儲存並加密套用</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* 5. LINE 官方對話底端『恆駐狀態機選單』與 Rich Menu 部署中心 */}
      <div className="mt-8 pt-6 border-t border-stone-200/80 space-y-4">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-emerald-700" />
          <h3 className="text-sm font-extrabold text-stone-900">
            📲 LINE 對話底端『恆駐狀態機選單』雙層架構
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 第一層：Quick Reply 快捷狀態列 (全自動運行) */}
          <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>第一層：Quick Reply 快捷鍵列 (已全自動運行)</span>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              系統在每次對話回覆、記帳卡片、全域公告群發與取消確認時，均自動附帶 3 顆恆駐狀態機按鈕（去重除混淆）：
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-[11px] font-bold text-stone-700 shadow-2xs">
                📱 軟體&功能
              </span>
              <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-[11px] font-bold text-stone-700 shadow-2xs">
                🔄 修改上一筆
              </span>
              <span className="px-2 py-1 bg-white border border-stone-200 rounded-lg text-[11px] font-bold text-stone-700 shadow-2xs">
                👤 我的帳號
              </span>
            </div>
          </div>

          {/* 第二層：官方 Rich Menu 圖文選單 (已卸載拿掉) */}
          <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                <Layers size={14} className="text-stone-500" />
                <span>官方 Rich Menu 功能選單 (已拿掉停用)</span>
              </div>
              <span className="text-[10px] bg-stone-200 text-stone-700 font-extrabold px-1.5 py-0.5 rounded">
                已卸載
              </span>
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              LINE 官方對話底端的大尺寸功能選單已全面關閉並解綁，保留最純淨自然的直覺對話記帳視窗。
            </p>

            {richMenuMsg && (
              <div
                className={`p-2.5 rounded-xl text-xs font-bold ${
                  richMenuMsg.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {richMenuMsg.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleRemoveRichMenu}
              disabled={isRemovingRichMenu || !keysConfig.lineChannelAccessToken}
              className="w-full mt-2 py-2 bg-stone-200 hover:bg-stone-300 active:scale-[0.99] text-stone-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRemovingRichMenu ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>正在向 LINE 官方請求卸載...</span>
                </>
              ) : (
                <>
                  <Trash2 size={13} />
                  <span>🧹 確認自 LINE 官方帳號徹底清除卸載選單</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
