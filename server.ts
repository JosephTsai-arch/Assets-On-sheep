import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRoutes from './src/routes/apiRoutes';

dotenv.config();

// 雲端配額耗盡安全容錯：靜默攔截 Firestore 額度超限與 gRPC 閒置串流正常回收，防範進程異常報警
process.on('unhandledRejection', (reason: any) => {
  const msg = typeof reason === 'string' ? reason : reason?.message || '';
  if (
    msg.includes('Quota limit exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('Disconnecting idle stream') ||
    msg.includes('Timed out waiting for new targets')
  ) {
    return;
  }
  console.warn('[Server UnhandledRejection Notice]:', msg);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = 3000;

// Security Hardening: Disable Express fingerprinting
app.disable('x-powered-by');

// Security Hardening: Standard HTTP Defense Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Body Parsers with Raw Body preservation for Webhook HMAC validation
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf-8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security Hardening: Prototype Pollution Guard (Safe hasOwnProperty check)
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    const hasOwn = Object.prototype.hasOwnProperty;
    if (
      hasOwn.call(req.body, '__proto__') ||
      hasOwn.call(req.body, 'constructor') ||
      hasOwn.call(req.body, 'prototype')
    ) {
      res.status(400).json({ success: false, error: '安全警示：檢測到異常參數注入' });
      return;
    }
  }
  next();
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'AssetOnSheep',
    timestamp: new Date().toISOString(),
  });
});

// Mount Centralized REST API Routes
app.use('/api', apiRoutes);

// Support direct webhook paths at root
app.post(['/line/webhook', '/webhook/line', '/webhook', '/callback'], (req, res, next) => {
  req.url = '/line/webhook';
  apiRoutes(req, res, next);
});

// Support direct cron scheduler paths at root
app.all(['/cron/reminders', '/reminders/cron', '/cron'], (req, res, next) => {
  req.url = '/reminders/cron';
  apiRoutes(req, res, next);
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // In development, mount Vite middleware for unified full-stack server
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AssetOnSheep] Full-stack Server listening on port ${PORT}`);
    // 啟動每日記帳鬧鐘排程檢查
    startReminderScheduler();
  });
}

function startReminderScheduler() {
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;

  const runCheck = async () => {
    try {
      const { checkAndDispatchReminders } = await import('./src/services/reminderService');
      const { sentCount } = await checkAndDispatchReminders();
      if (sentCount > 0) {
        console.log(`[ReminderScheduler] 已成功發送 ${sentCount} 則 LINE 記帳提醒推播`);
      }
    } catch (e: any) {
      console.warn('[ReminderScheduler Warn]:', e?.message);
    }
  };

  // 伺服器啟動或喚醒時，於 3 秒後立即進行初次鬧鐘補發巡檢 (防止容器重啟漏發)
  setTimeout(runCheck, 3000);

  // 隨後每 60 秒常態巡檢一次
  setInterval(runCheck, CHECK_INTERVAL_MS);
}

startServer().catch((err) => {
  console.error('[AssetOnSheep] Failed to start server:', err);
});
