const { Worker } = require('bullmq');
const { getConnection } = require('../lib/queue');
const { generateEmbedding } = require('../lib/embeddings');
const { pool } = require('../db');

const worker = new Worker('embeddings', async (job) => {
  const { taskId, text } = job.data;
  console.log(`Processing embedding for task: ${taskId}`);

  const embedding = await generateEmbedding(text);
  if (!embedding) throw new Error('Failed to generate embedding');

  const client = await pool.connect();
  try {
    const vectorStr = `[${embedding.join(',')}]`;
    await client.query('UPDATE tasks SET embedding = $1::vector WHERE id = $2', [vectorStr, taskId]);
    console.log(`Embedding updated for task: ${taskId}`);
  } finally {
    client.release();
  }
}, { connection: getConnection() });

worker.on('failed', (job, err) => {
  console.error(`Embedding job ${job?.id} failed:`, err.message);
});

module.exports = worker;
