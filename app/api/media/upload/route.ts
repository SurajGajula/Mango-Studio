import { PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { getNextAccountMediaName } from '@/app/lib/accountMediaNaming'
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

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart form data with a file field' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const file = formData.get('file')
  const folderIdRaw = formData.get('folderId')
  const storageScopeRaw = formData.get('storageScope')
  const sourceAssetIdRaw = formData.get('sourceAssetId')
  const durationSecondsRaw = formData.get('durationSeconds')
  const storageScope = storageScopeRaw === 'bg-removed' ? 'bg-removed' : 'default'
  const sourceAssetId =
    typeof sourceAssetIdRaw === 'string' && sourceAssetIdRaw.trim().length > 0
      ? sourceAssetIdRaw.trim()
      : null
  const requestedFolderId = typeof folderIdRaw === 'string' && folderIdRaw.length > 0 ? folderIdRaw : null
  const folderId =
    storageScope === 'bg-removed' ? await ensureBgRemovedFolderId(user.id) : requestedFolderId
  const durationSeconds =
    typeof durationSecondsRaw === 'string' && durationSecondsRaw.length > 0
      ? Number(durationSecondsRaw)
      : null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  let r2
  try {
    r2 = getR2Client()
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'R2 is not configured' }, { status: 500 })
  }

  const kind = normalizeKind(file.type)
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

  const admin = createAdminClient()
  const defaultName = await getNextAccountMediaName(user.id, kind)
  const { data: insertedAsset, error: insertError } = await admin
    .from('media_assets')
    .insert({
      user_id: user.id,
      folder_id: folderId,
      kind,
      name: defaultName,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      duration_seconds: durationSeconds,
      object_key: 'pending',
    })
    .select('*')
    .single()

  if (insertError || !insertedAsset) {
    return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 })
  }

  const objectKey = `${user.id}/${insertedAsset.id}/${sanitizeFileName(file.name)}`

  try {
    const arrayBuffer = await file.arrayBuffer()
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucketName,
        Key: objectKey,
        Body: Buffer.from(arrayBuffer),
        ContentType: file.type,
      })
    )
  } catch (error: any) {
    await admin.from('media_assets').delete().eq('id', insertedAsset.id).eq('user_id', user.id)
    return NextResponse.json({ error: error?.message ?? 'R2 upload failed' }, { status: 500 })
  }

  const { data: updatedAsset, error: updateError } = await admin
    .from('media_assets')
    .update({
      object_key: objectKey,
      updated_at: new Date().toISOString(),
    })
    .eq('id', insertedAsset.id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (updateError || !updatedAsset) {
    return NextResponse.json({ error: updateError?.message ?? 'Finalize failed' }, { status: 500 })
  }

  return NextResponse.json({ asset: updatedAsset })
}
