import React, { useState, useEffect } from 'react';
import { User, AccountingReminder, ReminderFrequency } from '../../types';
import { isSuperAdminUser, SUPER_ADMIN_LINE_USER_ID } from '../../firebase/config';
import {
  getUserReminder,
  saveUserReminder,
  formatFrequencyText,
  DEFAULT_REMINDER_MESSAGE,
} from '../../services/reminderService';
import {
  X,
  Bell,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Send,
  Sparkles,
  Smartphone,
} from 'lucide-react';

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

const PRESET_TIMES = [
  { label: '🌅 09:00', value: '09:00', desc: '早餐晨間' },
  { label: '🍱 13:00', value: '13:00', desc: '午餐休息' },
  { label: '🍜 19:30', value: '19:30', desc: '晚餐放鬆' },
  { label: '🌙 21:30', value: '21:30', desc: '睡前盤點' },
  { label: '🦉 23:00', value: '23:00', desc: '深夜回顧' },
];

const PRESET_MESSAGES = [
  '今天記帳了嗎？🐑 睡前順手記一下今天花了多少錢吧！',
  '檢視今日小荷包！🐑 隨手一句話記錄今天的所有花費～',
  '小羊溫馨提醒：今天有新的發票或收據嗎？拍照直接上傳秒記帳！',
  '今天的每一分努力都有意義！🐑 記一筆帳，向理想資產前進！',
];

export const ReminderModal: React.FC<ReminderModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [enabled, setEnabled] = useState(true);
  const [time, setTime] = useState('21:00');
  const [frequency, setFrequency] = useState<ReminderFrequency>('daily');
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [message, setMessage] = useState(DEFAULT_REMINDER_MESSAGE);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadReminder();
    }
  }, [isOpen, currentUser]);

  const loadReminder = async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await getUserReminder(currentUser.id);
      setEnabled(data.enabled);
      setTime(data.time || '21:00');
      setFrequency(data.frequency || 'daily');
      setCustomDays(data.customDays && data.customDays.length > 0 ? data.customDays : [1, 2, 3, 4, 5]);
      setMessage(data.message || DEFAULT_REMINDER_MESSAGE);
    } catch (e: any) {
      console.warn('載入鬧鐘失敗:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const lineId = targetLineId || currentUser.lineUserId;
      await saveUserReminder(currentUser.id, {
        enabled,
        time,
        frequency,
        customDays,
        message: message.trim() || DEFAULT_REMINDER_MESSAGE,
        lineUserId: lineId || undefined,
        userEmail: currentUser.email || undefined,
        userName: currentUser.name || undefined,
      });
      setSuccessMsg('✅ 記帳提醒鬧鐘設定已成功儲存！');
      setTimeout(() => {
        setSuccessMsg('');
      }, 3500);
    } catch (e: any) {
      setErrorMsg(e?.message || '儲存設定失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = isSuperAdminUser(currentUser);
  const targetLineId = currentUser?.lineUserId || (isSuperAdmin ? SUPER_ADMIN_LINE_USER_ID : '');
  const hasLineBinding = Boolean(targetLineId);

  const handleTestPush = async () => {
    if (!currentUser) return;
    setTesting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/reminders/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userEmail: currentUser.email,
          lineUserId: targetLineId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('🎉 測試推播已發送！請查看您的 LINE 官方帳號聊天室。');
      } else {
        setErrorMsg(data.error || '發送測試推播失敗');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || '呼叫推播服務異常');
    } finally {
      setTesting(false);
    }
  };

  const toggleDay = (dayIndex: number) => {
    if (customDays.includes(dayIndex)) {
      if (customDays.length === 1) return; // 至少保留一天
      setCustomDays(customDays.filter((d) => d !== dayIndex));
    } else {
      setCustomDays([...customDays, dayIndex].sort());
    }
  };

  if (!isOpen) return null;

  const dayLabels = [
    { label: '日', val: 0 },
    { label: '一', val: 1 },
    { label: '二', val: 2 },
    { label: '三', val: 3 },
    { label: '四', val: 4 },
    { label: '五', val: 5 },
    { label: '六', val: 6 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-2xl backdrop-blur-xs">
              <Clock size={22} className="text-amber-100" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight">每日記帳提醒鬧鐘</h3>
              <p className="text-xs text-amber-100/90 font-medium">各帳號獨立設定，準時提醒記錄收支</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="關閉"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-stone-800">
          {/* Status Message */}
          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold animate-in fade-in">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Toggle Switch Card */}
          <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-stone-900">鬧鐘提醒狀態</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    enabled
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {enabled ? '🟢 提醒運作中' : '🔴 已暫停提醒'}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                {enabled ? '系統將於所選時間發送推播通知' : '已關閉每日定時提醒推播'}
              </p>
            </div>

            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                enabled ? 'bg-emerald-600' : 'bg-stone-300'
              }`}
              role="switch"
              aria-checked={enabled}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Time Configuration Section */}
          <div className="space-y-2.5">
            <label className="block text-xs font-black text-stone-700 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-amber-600" />
                提醒時間點 (24小時制)
              </span>
              <span className="text-stone-400 font-normal">台灣/台北時區 (GMT+8)</span>
            </label>

            <div className="flex items-center gap-3">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-11 px-4 bg-stone-50 border border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 rounded-2xl text-lg font-black text-stone-900 transition-all"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {PRESET_TIMES.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTime(preset.value)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    time === preset.value
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-[10px] opacity-80 block">{preset.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Frequency Section */}
          <div className="space-y-2.5">
            <label className="block text-xs font-black text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-amber-600" />
              重複頻率設定
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setFrequency('daily')}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  frequency === 'daily'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-400/20 shadow-xs'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>📅 每天</span>
                <span className="text-[10px] text-stone-400 font-normal">週一至週日</span>
              </button>

              <button
                type="button"
                onClick={() => setFrequency('weekdays')}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  frequency === 'weekdays'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-400/20 shadow-xs'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>💼 工作日</span>
                <span className="text-[10px] text-stone-400 font-normal">週一至週五</span>
              </button>

              <button
                type="button"
                onClick={() => setFrequency('weekends')}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  frequency === 'weekends'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-400/20 shadow-xs'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>🏖️ 週末假期</span>
                <span className="text-[10px] text-stone-400 font-normal">週六至週日</span>
              </button>

              <button
                type="button"
                onClick={() => setFrequency('custom')}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  frequency === 'custom'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-400/20 shadow-xs'
                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>⚙️ 自訂星期</span>
                <span className="text-[10px] text-stone-400 font-normal">自由選定</span>
              </button>
            </div>

            {/* Custom Day Checkboxes (when frequency is custom) */}
            {frequency === 'custom' && (
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/80 animate-in fade-in">
                <span className="text-xs font-bold text-amber-900 block mb-2">請點選要提醒的星期：</span>
                <div className="flex items-center justify-between gap-1">
                  {dayLabels.map((d) => {
                    const isSelected = customDays.includes(d.val);
                    return (
                      <button
                        key={d.val}
                        type="button"
                        onClick={() => toggleDay(d.val)}
                        className={`w-9 h-9 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center ${
                          isSelected
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        週{d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Custom Reminder Message */}
          <div className="space-y-2">
            <label className="block text-xs font-black text-stone-700 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-600" />
                提醒推播小語 (可自訂)
              </span>
              <span className="text-stone-400 font-normal">{message.length}/100</span>
            </label>

            <input
              type="text"
              maxLength={100}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={DEFAULT_REMINDER_MESSAGE}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 rounded-2xl text-xs text-stone-800 transition-all font-medium"
            />

            {/* Suggested Messages */}
            <div className="space-y-1 pt-1">
              <span className="text-[11px] font-bold text-stone-400 block">💡 快速套用建議小語：</span>
              <div className="flex flex-col gap-1">
                {PRESET_MESSAGES.map((msg, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMessage(msg)}
                    className="text-left text-[11px] text-stone-600 hover:text-amber-800 hover:bg-amber-50/60 p-1.5 rounded-lg transition-colors cursor-pointer truncate"
                  >
                    • {msg}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* LINE Connection Status & Test Button */}
          <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone size={16} className="text-emerald-600" />
                <span className="text-xs font-bold text-stone-800">LINE 官方帳號連動</span>
              </div>
              {currentUser?.lineUserId ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                  ✅ 已綁定推播
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                  ⚠️ 尚未綁定 LINE
                </span>
              )}
            </div>

            <p className="text-[11px] text-stone-500 leading-relaxed">
              {hasLineBinding
                ? `鬧鐘時間一到，小羊助理會直接在 LINE 發送專屬對話推播，出門在外直接回覆一句話即可秒記帳！`
                : `建議您將帳號綁定至 LINE 官方機器人，即可享受時間一到自動發送 LINE 提醒推播的極致便利。`}
            </p>

            {hasLineBinding && (
              <button
                type="button"
                onClick={handleTestPush}
                disabled={testing}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send size={13} className={testing ? 'animate-spin' : ''} />
                <span>{testing ? '正在發送測試推播...' : '🔔 立即發送測試推播至 LINE'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            取消
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 size={16} />
            <span>{saving ? '正在儲存...' : '儲存鬧鐘設定'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
