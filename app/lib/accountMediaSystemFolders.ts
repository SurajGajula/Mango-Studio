import { createAdminClient } from '@/app/utils/supabase/admin'

export const BG_REMOVED_SYSTEM_FOLDER_NAME = '__seedance_system_bg_removed__'

export function isSystemFolderName(name: string): boolean {
  return name === BG_REMOVED_SYSTEM_FOLDER_NAME
}

export async function findSystemFolderIds(userId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('media_folders')
    .select('id')
    .eq('user_id', userId)
    .eq('name', BG_REMOVED_SYSTEM_FOLDER_NAME)

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => row.id as string)
}

export async function ensureBgRemovedFolderId(userId: string): Promise<string> {
  const admin = createAdminClient()
  const existingIds = await findSystemFolderIds(userId)
  if (existingIds.length > 0) {
    return existingIds[0]
  }

  const { data, error } = await admin
    .from('media_folders')
    .insert({
      user_id: userId,
      parent_id: null,
      name: BG_REMOVED_SYSTEM_FOLDER_NAME,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to create background-removed system folder')
  }

  return data.id as string
}
