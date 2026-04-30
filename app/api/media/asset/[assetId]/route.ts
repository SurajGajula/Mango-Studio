import { GetObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { getR2Client } from '@/app/lib/r2Client'
import { createClient } from '@/app/utils/supabase/server'

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
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

  let object
  try {
    object = await r2.client.send(
      new GetObjectCommand({
        Bucket: r2.bucketName,
        Key: asset.object_key,
      })
    )
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

  if (typeof object.Body.transformToWebStream === 'function') {
    return new Response(object.Body.transformToWebStream(), {
      headers: {
        'Content-Type': asset.mime_type,
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  if (typeof object.Body.transformToByteArray === 'function') {
    const bytes = await object.Body.transformToByteArray()
    const buffer = Buffer.from(bytes)
    return new Response(buffer, {
      headers: {
        'Content-Type': asset.mime_type,
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported storage response body type' }, { status: 500 })
}
