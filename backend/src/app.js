require('express-async-errors'); // Must be first to catch async errors automatically
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const workspaceRoutes = require('./routes/workspace.routes');
const searchRoutes = require('./routes/search.routes');
const webhookRoutes = require('./routes/webhook.routes');
const attachmentRoutes = require('./routes/attachment.routes');
const notificationRoutes = require('./routes/notification.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const billingRoutes = require('./routes/billing.routes');
const passport = require('./lib/passport');
const { errorMiddleware } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } })); 
app.use(cors());

app.use(express.json());
app.use(passport.initialize());

// Logging middleware
app.use(morgan('dev'));

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs for auth routes
  message: { error: 'Too many login attempts, please try again after 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs for general API
});

const { pool } = require('./db');
const { isRedisAvailable } = require('./lib/queue');

// Routes
app.get('/healthz', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'UNKNOWN',
      redis: 'UNKNOWN'
    }
  };

  try {
    await pool.query('SELECT 1');
    health.services.database = 'CONNECTED';
  } catch (err) {
    health.services.database = 'FAILED';
    health.status = 'ERROR';
  }

  try {
    if (isRedisAvailable()) {
      health.services.redis = 'CONNECTED';
    } else {
      health.services.redis = 'UNAVAILABLE';
      if (process.env.REDIS_URL) health.status = 'DEGRADED';
    }
  } catch (err) {
    health.services.redis = 'FAILED';
    health.status = 'ERROR';
  }

  const code = health.status === 'ERROR' ? 503 : 200;
  res.status(code).json(health);
});
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tasks', apiLimiter, taskRoutes);
app.use('/api/workspaces', apiLimiter, workspaceRoutes);
app.use('/api/search', apiLimiter, searchRoutes);
app.use('/api/webhooks', apiLimiter, webhookRoutes);
app.use('/api/attachments', apiLimiter, attachmentRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/billing', billingRoutes);

// Global Error Handler
app.use(errorMiddleware);

module.exports = app;
