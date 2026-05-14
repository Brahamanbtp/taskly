/**
 * Resilient Queue / Redis module.
 *
 * Strategy:
 *  - If REDIS_URL is set, attempt a single probe connection.
 *  - If Redis is reachable → create real BullMQ queues and export a live connection.
 *  - If Redis is NOT reachable (no env var, or ECONNREFUSED) → export no-op stubs so
 *    the rest of the app can import this module without crashing or spamming logs.
 *
 * Workers check `isRedisAvailable()` before registering themselves so BullMQ never
 * tries to open connections when Redis isn't there.
 */

const IORedis = require('ioredis');
const { Queue } = require('bullmq');

// ─── Probe ────────────────────────────────────────────────────────────────────

let _redisAvailable = false;
let _connection = null;

// Minimal stub used when Redis is unavailable
const stubConnection = {
  status: 'unavailable',
  on: () => {},
  quit: () => Promise.resolve(),
};

// No-op queue stub — add() silently discards jobs
function makeStubQueue(name) {
  return {
    name,
    add: async (jobName, data, opts) => {
      // Silently drop — Redis not available
    },
    close: async () => {},
  };
}

/**
 * Call once at startup (from index.js bootstrap) to probe Redis.
 * Returns true if Redis became available.
 */
async function initRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('⚠️  REDIS_URL not set — background queues (embeddings, webhooks, storage) are disabled.');
    return false;
  }

  return new Promise((resolve) => {
    const probe = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,       // don't retry during probe
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    probe.connect().then(() => {
      console.log('✅ Redis connected — background queues are active.');
      _redisAvailable = true;

      // Re-create a proper connection for BullMQ (needs maxRetriesPerRequest: null)
      _connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        // Suppress repeated error logs — we already know status
        reconnectOnError: (err) => {
          // Only log once every 60 s
          if (!_connection._lastLoggedAt || Date.now() - _connection._lastLoggedAt > 60_000) {
            console.error('Redis connection error (will retry):', err.message);
            _connection._lastLoggedAt = Date.now();
          }
          return true; // keep retrying
        },
      });
      _connection.on('error', (err) => {
        if (!_connection._lastLoggedAt || Date.now() - _connection._lastLoggedAt > 60_000) {
          console.error('Redis error:', err.message);
          _connection._lastLoggedAt = Date.now();
        }
      });

      probe.quit().catch(() => {});
      resolve(true);
    }).catch((err) => {
      console.warn(`⚠️  Redis unavailable (${err.message}) — background queues disabled. App continues without them.`);
      probe.disconnect();
      resolve(false);
    });
  });
}

function isRedisAvailable() {
  return _redisAvailable;
}

function getConnection() {
  return _connection || stubConnection;
}

// ─── Lazy Queue Factory ───────────────────────────────────────────────────────
// Queues are created on first .add() call so we never open sockets at import time.

const _queues = {};

function getQueue(name) {
  if (!_redisAvailable) return makeStubQueue(name);
  if (!_queues[name]) {
    _queues[name] = new Queue(name, { connection: _connection });
    _queues[name].on('error', (err) => {
      console.error(`Queue [${name}] error:`, err.message);
    });
  }
  return _queues[name];
}

// ─── Convenience queue accessors (match original API) ─────────────────────────

const embeddingQueue = {
  get name() { return 'embeddings'; },
  add: (jobName, data, opts) => getQueue('embeddings').add(jobName, data, opts),
};

const webhookQueue = {
  get name() { return 'webhooks'; },
  add: (jobName, data, opts) => getQueue('webhooks').add(jobName, data, opts),
};

const storageQueue = {
  get name() { return 'storage'; },
  add: (jobName, data, opts) => getQueue('storage').add(jobName, data, opts),
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initRedis,
  isRedisAvailable,
  getConnection,
  get connection() { return getConnection(); },
  embeddingQueue,
  webhookQueue,
  storageQueue,
};
