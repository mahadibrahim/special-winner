import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  UploadPartCommand,
  GetObjectCommand,
  PutObjectCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  // Allow module import in environments without R2 configured (build, unit tests).
  // Runtime calls will throw the descriptive error below.
}

const endpoint = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : undefined;

let _client: S3Client | null = null;
function client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error(
      "R2 not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET"
    );
  }
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

export function bucket(): string {
  if (!R2_BUCKET) throw new Error("R2_BUCKET not set");
  return R2_BUCKET;
}

export async function createMultipartUpload(
  key: string,
  contentType: string
): Promise<{ uploadId: string; key: string }> {
  const out = await client().send(
    new CreateMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
    })
  );
  if (!out.UploadId) throw new Error("R2 did not return UploadId");
  return { uploadId: out.UploadId, key };
}

export async function getSignedPartUrls(
  key: string,
  uploadId: string,
  partCount: number,
  expiresInSeconds = 3600
): Promise<string[]> {
  const c = client();
  const urls: string[] = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const cmd = new UploadPartCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    urls.push(await getSignedUrl(c, cmd, { expiresIn: expiresInSeconds }));
  }
  return urls;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
): Promise<void> {
  await client().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    })
  );
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  await client().send(
    new AbortMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
    })
  );
}

export async function getSignedGetUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
