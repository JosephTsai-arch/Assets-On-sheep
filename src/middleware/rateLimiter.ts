import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipFailedRequests?: boolean;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, ClientRecord>();

// 每 2 分鐘自動清理記憶體中過期客戶端記數，防止記憶體膨脹
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 120 * 1000);

/**
 * 輕量級高效能滑動視窗防護閥 (Rate Limiter Middleware)
 * 專門防護暴力破解、爬蟲掃描與 AI 呼叫額度被耗盡
 */
export function createRateLimiter(options: RateLimitConfig) {
  const { windowMs, max, message = '請求過於頻繁，請稍候再試。' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // 獲取客戶端真實 IP (相容 Proxy / Cloud Run)
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.socket.remoteAddress) || '127.0.0.1';
    const key = `${req.baseUrl || req.path}:${ip.trim()}`;

    const now = Date.now();
    let record = memoryStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      memoryStore.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: resetSeconds,
      });
      return;
    }

    next();
  };
}

// 預設常見情境限流器實例
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 分鐘
  max: 30, // 30 次
  message: '登入認證請求過於頻繁，請於 1 分鐘後重試。',
});

export const rescueRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 15, // 15 次
  message: '救援碼驗證嘗試已達上限，為保護帳號安全，請於 15 分鐘後再試。',
});

export const geminiAiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 分鐘
  max: 40, // 40 次 (充裕但能徹底阻斷惡意迴圈)
  message: 'AI 語意解析使用過於密集，請稍候幾秒再試。',
});

export const broadcastRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 分鐘
  max: 10, // 10 次
  message: '官方廣播公告操作過於頻繁，請稍候再試。',
});
