const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minio',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minio123',
  },
  endpoint: process.env.AWS_ENDPOINT || undefined, // Useful for MinIO
  forcePathStyle: !!process.env.AWS_ENDPOINT,
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'taskly-attachments';

async function getUploadUrl(key, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function getDownloadUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

module.exports = {
  getUploadUrl,
  getDownloadUrl,
  BUCKET_NAME
};
