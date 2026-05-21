import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { getR2Client } from '@/app/lib/r2Client'
import { createClient } from '@/app/utils/supabase/server'

type RangeParse =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }
  | { kind: 'badRequest' }

function parseBytesRangeHeader(rangeHeader: string | null, total: number): RangeParse {
  if (total <= 0) return { kind: 'unsatisfiable' }
  if (rangeHeader == null || rangeHeader.trim() === '') {
    return { kind: 'full' }
  }
  const trimmed = rangeHeader.trim()
  if (!trimmed.toLowerCase().startsWith('bytes=')) {
    return { kind: 'badRequest' }
  }
  const spec = trimmed.slice(6).trim()
  if (spec.includes(',')) {
    return { kind: 'badRequest' }
  }
  if (spec.startsWith('-')) {
    const len = Number(spec.slice(1))
    if (!Number.isFinite(len) || len <= 0) {
      return { kind: 'badRequest' }
    }
    const start = Math.max(0, total - len)
    return { start, end: total - 1, kind: 'partial' }
  }
  const hyphenIdx = spec.indexOf('-')
  if (hyphenIdx < 0) {
    return { kind: 'badRequest' }
  }
  const startStr = spec.slice(0, hyphenIdx)
  const endStr = spec.slice(hyphenIdx + 1)
  const start = startStr === '' ? 0 : Number(startStr)
  let end = endStr === '' ? total - 1 : Number(endStr)
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { kind: 'badRequest' }
  }
  if (start > end) {
    return { kind: 'badRequest' }
  }
  if (start >= total) {
    return { kind: 'unsatisfiable' }
  }
  end = Math.min(end, total - 1)
  if (start > end) {
    return { kind: 'unsatisfiable' }
  }
  if (start === 0 && end === total - 1) {
    return { kind: 'full' }
  }
  return { kind: 'partial', start, end }
}

export async function GET(req: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let r2
  try {
    r2 = getR2Client()
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'R2 is not configured' }, { status: 500 })
  }

  const params = await context.params
  const assetId = params.assetId

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .select('object_key, mime_type')
    .eq('id', assetId)
    .eq('user_id', user.id)
    .single()

  if (assetError || !asset) {
    return NextResponse.json({ error: assetError?.message ?? 'Asset not found' }, { status: 404 })
  }
  if (!asset.object_key || asset.object_key === 'pending') {
    return NextResponse.json({ error: 'Asset object key is not ready' }, { status: 409 })
  }

  let totalSize: number
  try {
    const head = await r2.client.send(
      new HeadObjectCommand({
        Bucket: r2.bucketName,
        Key: asset.object_key,
      })
    )
    totalSize = head.ContentLength ?? 0
  } catch (error: any) {
    const errorName = error?.name ?? ''
    if (errorName === 'NoSuchKey' || errorName === 'NotFound') {
      return NextResponse.json({ error: 'Asset binary not found in storage' }, { status: 404 })
    }
    return NextResponse.json({ error: error?.message ?? 'Failed to read asset metadata' }, { status: 500 })
  }

  const rangeParsed = parseBytesRangeHeader(req.headers.get('range'), totalSize)
  if (rangeParsed.kind === 'badRequest') {
    return NextResponse.json({ error: 'Invalid Range header' }, { status: 400 })
  }
  if (rangeParsed.kind === 'unsatisfiable') {
    return new NextResponse(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${totalSize}`,
      },
    })
  }

  const mimeType = asset.mime_type || 'application/octet-stream'

  let object
  try {
    if (rangeParsed.kind === 'full') {
      object = await r2.client.send(
        new GetObjectCommand({
          Bucket: r2.bucketName,
          Key: asset.object_key,
        })
      )
    } else {
      const { start, end } = rangeParsed
      object = await r2.client.send(
        new GetObjectCommand({
          Bucket: r2.bucketName,
          Key: asset.object_key,
          Range: `bytes=${start}-${end}`,
        })
      )
    }
  } catch (error: any) {
    const errorName = error?.name ?? ''
    if (errorName === 'NoSuchKey' || errorName === 'NotFound') {
      return NextResponse.json({ error: 'Asset binary not found in storage' }, { status: 404 })
    }
    return NextResponse.json({ error: error?.message ?? 'Failed to fetch asset from storage' }, { status: 500 })
  }

  if (!object.Body) {
    return NextResponse.json({ error: 'Asset body missing' }, { status: 500 })
  }

  const partLength =
    rangeParsed.kind === 'partial'
      ? rangeParsed.end - rangeParsed.start + 1
      : totalSize

  const baseHeaders: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(partLength),
  }
  if (rangeParsed.kind === 'partial') {
    baseHeaders['Content-Range'] = `bytes ${rangeParsed.start}-${rangeParsed.end}/${totalSize}`
  }

  const status = rangeParsed.kind === 'partial' ? 206 : 200

  const body = object.Body as { transformToWebStream?: () => ReadableStream; transformToByteArray?: () => Promise<Uint8Array> }
  if (typeof body.transformToWebStream === 'function') {
    return new NextResponse(body.transformToWebStream(), {
      status,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=60',
        ...baseHeaders,
      },
    })
  }
  if (typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray()
    const buffer = Buffer.from(bytes)
    return new NextResponse(buffer, {
      status,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=60',
        ...baseHeaders,
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported storage response body type' }, { status: 500 })
}
