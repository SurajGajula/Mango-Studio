import { S3Client } from '@aws-sdk/client-s3'

export function getR2Client() {
  const endpoint = process.env.R2_URL
  const accessKeyId = process.env.R2_ACCESS_KEY
  const secretAccessKey = process.env.R2_SECRET_KEY
  const bucketName = process.env.R2_BUCKET_NAME

  if (!endpoint) {
    throw new Error('Missing R2_URL environment variable')
  }
  if (!accessKeyId) {
    throw new Error('Missing R2_ACCESS_KEY environment variable')
  }
  if (!secretAccessKey) {
    throw new Error('Missing R2_SECRET_KEY environment variable')
  }
  if (!bucketName) {
    throw new Error('Missing R2_BUCKET_NAME environment variable')
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return { client, bucketName }
}
