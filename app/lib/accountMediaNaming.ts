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

const MAX_NAME_ALLOCATION_ATTEMPTS = 12

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

export async function getNextAccountMediaName(userId: string, kind: MediaKind): Promise<string> {
  const admin = createAdminClient()
  const column = COUNTER_COLUMN_BY_KIND[kind]
  const label = LABEL_BY_KIND[kind]

  for (let attempt = 0; attempt < MAX_NAME_ALLOCATION_ATTEMPTS; attempt++) {
    const { data: existing, error: readError } = await admin
      .from('user_media_counters')
      .select('image_count, video_count, audio_count')
      .eq('user_id', userId)
      .maybeSingle()

    if (readError) {
      throw readError
    }

    if (!existing) {
      const initialValues = {
        user_id: userId,
        image_count: kind === 'image' ? 1 : 0,
        video_count: kind === 'video' ? 1 : 0,
        audio_count: kind === 'audio' ? 1 : 0,
      }
      const { error: insertError } = await admin.from('user_media_counters').insert(initialValues)
      if (!insertError) {
        return `${label} 1`
      }
      if (isUniqueViolation(insertError)) {
        continue
      }
      throw insertError
    }

    const currentCount = existing[column] ?? 0
    const nextCount = currentCount + 1
    const { data: updated, error: updateError } = await admin
      .from('user_media_counters')
      .update({
        [column]: nextCount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq(column, currentCount)
      .select(column)
      .maybeSingle()

    if (updateError) {
      throw updateError
    }
    if (updated) {
      return `${label} ${nextCount}`
    }
  }

  throw new Error('Failed to allocate media name')
}
