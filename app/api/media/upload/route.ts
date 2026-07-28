import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getNextAccountMediaName } from '@/app/lib/accountMediaNaming'
import { findExistingUploadedAsset } from '@/app/lib/accountMediaDedup'
import { ensureBgRemovedFolderId, findSystemFolderIds } from '@/app/lib/accountMediaSystemFolders'
import { AccountMediaKind } from '@/app/lib/accountMediaTypes'
import { getR2Client } from '@/app/lib/r2Client'
import { createAdminClient } from '@/app/utils/supabase/admin'
import { createClient } from '@/app/utils/supabase/server'

function normalizeKind(fileType: string): AccountMediaKind | null {
  if (fileType.startsWith('image/')) return 'image'
  if (fileType.startsWith('video/')) return 'video'
  if (fileType.startsWith('audio/')) return 'audio'
  return null
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value)
}

type UploadRequestBody = {
  fileName?: unknown
  mimeType?: unknown
  sizeBytes?: unknown
  contentHash?: unknown
  folderId?: unknown
  storageScope?: unknown
  sourceAssetId?: unknown
  durationSeconds?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: UploadRequestBody
  try {
    body = (await req.json()) as UploadRequestBody
  } catch {
    return NextResponse.json({ error: 'Expected JSON upload metadata' }, { status: 400 })
  }

  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : ''
  const contentHash = typeof body.contentHash === 'string' ? body.contentHash.trim().toLowerCase() : ''
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : Number(body.sizeBytes)
  const storageScope = body.storageScope === 'bg-removed' ? 'bg-removed' : 'default'
  const sourceAssetId =
    typeof body.sourceAssetId === 'string' && body.sourceAssetId.trim().length > 0
      ? body.sourceAssetId.trim()
      : null
  const requestedFolderId =
    typeof body.folderId === 'string' && body.folderId.length > 0 ? body.folderId : null
  const durationSeconds =
    body.durationSeconds === undefined || body.durationSeconds === null
      ? null
      : Number(body.durationSeconds)

  if (!fileName) {
    return NextResponse.json({ error: 'Missing fileName' }, { status: 400 })
  }
  if (!mimeType) {
    return NextResponse.json({ error: 'Missing mimeType' }, { status: 400 })
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: 'Invalid sizeBytes' }, { status: 400 })
  }
  if (!isSha256Hex(contentHash)) {
    return NextResponse.json({ error: 'Invalid contentHash' }, { status: 400 })
  }
  if (durationSeconds !== null && !Number.isFinite(durationSeconds)) {
    return NextResponse.json({ error: 'Invalid durationSeconds' }, { status: 400 })
  }

  let r2
  try {
    r2 = getR2Client()
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'R2 is not configured' }, { status: 500 })
  }

  const kind = normalizeKind(mimeType)
  if (!kind) {
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 400 })
  }
  if (storageScope === 'bg-removed' && kind !== 'image') {
    return NextResponse.json({ error: 'Only images can use bg-removed storage scope' }, { status: 400 })
  }
  if (storageScope === 'bg-removed' && sourceAssetId) {
    const { data: sourceAsset, error: sourceAssetError } = await supabase
      .from('media_assets')
      .select('id, kind')
      .eq('id', sourceAssetId)
      .eq('user_id', user.id)
      .single()
    if (sourceAssetError || !sourceAsset || sourceAsset.kind !== 'image') {
      return NextResponse.json({ error: sourceAssetError?.message ?? 'Invalid source asset' }, { status: 400 })
    }
  }

  const folderId =
    storageScope === 'bg-removed' ? await ensureBgRemovedFolderId(user.id) : requestedFolderId

  if (requestedFolderId && storageScope !== 'bg-removed') {
    const hiddenFolderIds = await findSystemFolderIds(user.id)
    if (hiddenFolderIds.includes(requestedFolderId)) {
      return NextResponse.json({ error: 'Cannot upload to system folders directly' }, { status: 400 })
    }
    const { data: folder, error: folderError } = await supabase
      .from('media_folders')
      .select('id')
      .eq('id', requestedFolderId)
      .eq('user_id', user.id)
      .single()
    if (folderError || !folder) {
      return NextResponse.json({ error: folderError?.message ?? 'Folder not found' }, { status: 400 })
    }
  }

  if (storageScope === 'default') {
    try {
      const existingAsset = await findExistingUploadedAsset(user.id, {
        kind,
        contentHash,
        originalFilename: fileName,
        mimeType,
        sizeBytes,
      })
      if (existingAsset) {
        return NextResponse.json({ asset: existingAsset, deduplicated: true })
      }
    } catch (error: any) {
      return NextResponse.json({ error: error?.message ?? 'Failed to check for duplicate media' }, { status: 500 })
    }
  }

  const admin = createAdminClient()
  let defaultName: string
  try {
    defaultName = await getNextAccountMediaName(user.id, kind)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to allocate media name' }, { status: 500 })
  }

  const assetId = randomUUID()
  const objectKey = `${user.id}/${assetId}/${sanitizeFileName(fileName)}`
  const { data: insertedAsset, error: insertError } = await admin
    .from('media_assets')
    .insert({
      id: assetId,
      user_id: user.id,
      folder_id: folderId,
      kind,
      name: defaultName,
      original_filename: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      duration_seconds: durationSeconds,
      object_key: objectKey,
      content_hash: contentHash,
    })
    .select('*')
    .single()

  if (insertError || !insertedAsset) {
    return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 })
  }

  try {
    const uploadUrl = await getSignedUrl(
      r2.client,
      new PutObjectCommand({
        Bucket: r2.bucketName,
        Key: objectKey,
        ContentType: mimeType,
      }),
      { expiresIn: 60 * 15 }
    )
    return NextResponse.json({ asset: insertedAsset, uploadUrl })
  } catch (error: any) {
    await admin.from('media_assets').delete().eq('id', insertedAsset.id).eq('user_id', user.id)
    return NextResponse.json({ error: error?.message ?? 'Failed to create upload URL' }, { status: 500 })
  }
}
