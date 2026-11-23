// ============================================================
// Shared, system-wide object storage (S3) client.
//
// One bucket serves every document the product persists — payslips,
// PHED promotion letters, and (in future) offer letters, CVs, evidence,
// and upload records. Reads are always proxied through the backend so
// users are never redirected to an external URL.
//
// Env (canonical, system-wide):
//   S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET
//   S3_ENDPOINT (optional — only for non-AWS S3-compatible providers
//                such as R2, Backblaze, MinIO)
//
// Backward compatibility: the legacy PAYSLIP_S3_* names are honoured as a
// fallback so deployments configured before the system-wide rollout keep
// working unchanged.
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { log, serializeError } from '@/app/lib/observability/logger'

// REL-003: a stalled storage call gives up instead of holding a request open.
const S3_CONNECT_TIMEOUT_MS = 5_000
const S3_REQUEST_TIMEOUT_MS = 60_000

function env(name: string): string | undefined {
  return process.env[name] || undefined
}

export interface S3Config {
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
}

export function s3Config(): S3Config {
  return {
    bucket: env('S3_BUCKET') || env('PAYSLIP_S3_BUCKET') || '',
    region: env('S3_REGION') || env('PAYSLIP_S3_REGION') || '',
    accessKeyId: env('S3_ACCESS_KEY') || env('PAYSLIP_S3_ACCESS_KEY') || '',
    secretAccessKey: env('S3_SECRET') || env('PAYSLIP_S3_SECRET') || '',
    endpoint: env('S3_ENDPOINT') || env('PAYSLIP_S3_ENDPOINT'),
  }
}

export function isS3Configured(): boolean {
  const c = s3Config()
  return !!(c.bucket && c.region && c.accessKeyId && c.secretAccessKey)
}

let _s3: S3Client | null = null
export function s3Client(): S3Client {
  if (!_s3) {
    const c = s3Config()
    _s3 = new S3Client({
      region: c.region,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey,
      },
      requestHandler: { connectionTimeout: S3_CONNECT_TIMEOUT_MS, requestTimeout: S3_REQUEST_TIMEOUT_MS },
      ...(c.endpoint ? { endpoint: c.endpoint, forcePathStyle: true } : {}),
    })
  }
  return _s3
}

export async function putS3Object(
  key: string,
  bytes: Uint8Array,
  contentType?: string,
): Promise<void> {
  const c = s3Config()
  await s3Client().send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: key,
      Body: bytes,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
  )
}

/** True when S3 answered that the object does not exist (as opposed to a failed call). */
export function isS3NotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}

/**
 * Returns the object bytes, or null when missing or erroring (callers fall back to the database or disk copy).
 * A missing object is normal before the migration; any other failure is logged.
 */
export async function getS3Object(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!key) return null
  // Set S3_DEBUG=1 to watch the backend log every read: "[s3] HIT <key>" means
  // the file was served from object storage; "[s3] MISS <key>" means it fell
  // back to the DB blob / local disk. Leave unset in normal operation.
  const debug = process.env.S3_DEBUG === '1'
  try {
    const c = s3Config()
    const res = await s3Client().send(new GetObjectCommand({ Bucket: c.bucket, Key: key }))
    const bytes = await res.Body?.transformToByteArray()
    if (!bytes) {
      if (debug) log.info('[s3] MISS (empty)', { key })
      return null
    }
    if (debug) log.info('[s3] HIT', { key })
    return new Uint8Array(bytes)
  } catch (err) {
    if (isS3NotFound(err)) {
      if (debug) log.info('[s3] MISS (not found)', { key })
    } else {
      log.warn('[s3] read failed; falling back', { key, error: serializeError(err) })
    }
    return null
  }
}

export async function deleteS3Object(key: string): Promise<void> {
  if (!key) return
  try {
    const c = s3Config()
    await s3Client().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }))
  } catch (err) {
    // Best-effort: a leftover object costs storage only, so the caller carries on.
    log.warn('[s3] delete failed', { key, error: serializeError(err) })
  }
}

/** Object metadata only (no body) — for Content-Length/Content-Type. */
export async function headS3Object(key: string): Promise<{ contentLength: number; contentType?: string } | null> {
  if (!key) return null
  try {
    const c = s3Config()
    const res = await s3Client().send(new HeadObjectCommand({ Bucket: c.bucket, Key: key }))
    return {
      contentLength: res.ContentLength ?? 0,
      contentType: res.ContentType,
    }
  } catch {
    return null
  }
}

/**
 * Opens an object for streaming (returns a web ReadableStream, no full-buffer
 * load). `range` is an optional byte range (inclusive) for MP4/video seeking.
 * Returns null when the object is missing (caller falls back / 404s).
 */
export async function openS3Object(
  key: string,
  range?: { start: number; end: number },
): Promise<{ body: ReadableStream<Uint8Array>; contentLength: number; contentType?: string; contentRange?: string } | null> {
  if (!key) return null
  try {
    const c = s3Config()
    const res = await s3Client().send(
      new GetObjectCommand({
        Bucket: c.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    )
    const body = res.Body?.transformToWebStream()
    if (!body) return null
    return {
      body,
      contentLength: res.ContentLength ?? 0,
      contentType: res.ContentType,
      contentRange: res.ContentRange,
    }
  } catch {
    return null
  }
}

/** Delete every object under a key prefix (paginated, best-effort). */
export async function deleteS3ObjectsByPrefix(prefix: string): Promise<void> {
  if (!prefix) return
  try {
    const c = s3Config()
    let token: string | undefined
    do {
      const list = await s3Client().send(
        new ListObjectsV2Command({
          Bucket: c.bucket,
          Prefix: prefix,
          ...(token ? { ContinuationToken: token } : {}),
        }),
      )
      const objects = (list.Contents ?? [])
        .filter((o): o is { Key: string } => Boolean(o.Key))
        .map((o) => ({ Key: o.Key! }))
      if (objects.length) {
        await s3Client().send(
          new DeleteObjectsCommand({ Bucket: c.bucket, Delete: { Objects: objects } }),
        )
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined
    } while (token)
  } catch (err) {
    // Best-effort: a leftover object costs storage only, so the caller carries on.
    log.warn('[s3] prefix delete failed', { prefix, error: serializeError(err) })
  }
}

/** Short-lived signed GET URL (server-side use only — never sent to the browser). */
export async function presignS3Get(key: string, ttlSeconds = 300): Promise<string | null> {
  if (!isS3Configured() || !key) return null
  const c = s3Config()
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({ Bucket: c.bucket, Key: key }),
    { expiresIn: ttlSeconds },
  )
}
