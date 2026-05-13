require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const { initRedis, isRedisAvailable } = require('./lib/queue');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  // 1. Probe Redis first — sets internal flag used by workers and queues
  await initRedis();

  // 2. Only spin up BullMQ workers if Redis is actually reachable
  if (isRedisAvailable()) {
    require('./workers/embeddingWorker');
    require('./workers/webhookWorker');
    require('./workers/storageWorker');
    console.log('✅ Background workers started.');
  } else {
    console.warn('⚠️  Background workers skipped (Redis unavailable). AI embeddings, webhooks, and file-cleanup queues are disabled until Redis is started.');
  }

  // 3. Create HTTP server + Socket.io
  const server = http.createServer(app);
  const io = await initSocket(server);
  app.set('io', io);

  server.listen(PORT, HOST, () => {
    console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
