require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const { generalLimiter } = require('../middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');

const authRoutes = require('../routes/auth.routes');
const messagesRoutes = require('../routes/messages.routes');
const profileRoutes = require('../routes/profile.routes');
const reportsRoutes = require('../routes/reports.routes');
const settingsRoutes = require('../routes/settings.routes');
const premiumRoutes = require('../routes/premium.routes');
const captchaRoutes = require('../routes/captcha.routes');

const app = express();

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ---- Security & performance middleware ----
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.SUPABASE_URL || ''].filter(Boolean),
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: APP_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(generalLimiter);

// ---- Static files (untuk npm run dev lokal; di Vercel ditangani vercel.json) ----
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/captcha', captchaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Error handling ----
app.use('/api', notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
