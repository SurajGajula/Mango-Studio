import { createAdminClient } from '@/app/utils/supabase/admin'

type MediaKind = 'image' | 'video' | 'audio'

const COUNTER_COLUMN_BY_KIND: Record<MediaKind, 'image_count' | 'video_count' | 'audio_count'> = {
  image: 'image_count',
  video: 'video_count',
  audio: 'audio_count',
}

const LABEL_BY_KIND: Record<MediaKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
}

export async function getNextAccountMediaName(userId: string, kind: MediaKind): Promise<string> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('user_media_counters')
    .select('image_count, video_count, audio_count')
    .eq('user_id', userId)
    .maybeSingle()

  if (!existing) {
    const initialValues = {
      user_id: userId,
      image_count: kind === 'image' ? 1 : 0,
      video_count: kind === 'video' ? 1 : 0,
      audio_count: kind === 'audio' ? 1 : 0,
    }
    const { error: insertError } = await admin.from('user_media_counters').insert(initialValues)
    if (insertError) {
      throw insertError
    }
    return `${LABEL_BY_KIND[kind]} 1`
  }

  const column = COUNTER_COLUMN_BY_KIND[kind]
  const nextCount = (existing[column] ?? 0) + 1
  const { error: updateError } = await admin
    .from('user_media_counters')
    .update({
      [column]: nextCount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateError) {
    throw updateError
  }

  return `${LABEL_BY_KIND[kind]} ${nextCount}`
}
