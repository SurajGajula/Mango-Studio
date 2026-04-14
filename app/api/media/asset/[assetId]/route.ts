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

  const object = await r2.client.send(
    new GetObjectCommand({
      Bucket: r2.bucketName,
      Key: asset.object_key,
    })
  )

  if (!object.Body) {
    return NextResponse.json({ error: 'Asset body missing' }, { status: 500 })
  }

  return new Response(object.Body.transformToWebStream(), {
    headers: {
      'Content-Type': asset.mime_type,
      'Cache-Control': 'private, max-age=60',
    },
  })
}
