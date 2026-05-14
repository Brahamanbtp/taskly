const { Worker } = require('bullmq');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getConnection } = require('../lib/queue');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minio',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minio123',
  },
  endpoint: process.env.AWS_ENDPOINT || undefined,
  forcePathStyle: !!process.env.AWS_ENDPOINT,
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'taskly-attachments';

const worker = new Worker('storage', async (job) => {
  const { fileKey } = job.data;
  console.log(`Deleting file from S3: ${fileKey}`);

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileKey,
  });

  await s3Client.send(command);
  console.log(`File deleted successfully: ${fileKey}`);
}, { connection: getConnection() });

worker.on('failed', (job, err) => {
  console.error(`Storage job ${job?.id} failed:`, err.message);
});

module.exports = worker;
