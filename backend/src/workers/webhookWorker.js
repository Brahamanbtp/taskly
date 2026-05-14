const { Worker } = require('bullmq');
const axios = require('axios');
const { getConnection } = require('../lib/queue');

const worker = new Worker('webhooks', async (job) => {
  const { url, payload, secret, eventType } = job.data;
  console.log(`Delivering webhook to: ${url} for event: ${eventType}`);

  await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Taskly-Event': eventType,
      ...(secret && { 'X-Taskly-Secret': secret })
    },
    timeout: 10000
  });

  console.log(`Webhook delivered successfully to: ${url}`);
}, {
  connection: getConnection(),
  settings: {
    backoff: {
      type: 'exponential',
      delay: 5000,
    }
  }
});

worker.on('failed', (job, err) => {
  console.error(`Webhook job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

module.exports = worker;
