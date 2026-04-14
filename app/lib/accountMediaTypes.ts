export type AccountMediaKind = 'image' | 'video' | 'audio'

export type AccountMediaAsset = {
  id: string
  user_id: string
  folder_id: string | null
  kind: AccountMediaKind
  name: string
  original_filename: string
  mime_type: string
  size_bytes: number
  duration_seconds: number | null
  object_key: string
  created_at: string
  updated_at: string
}

export type AccountMediaFolder = {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  created_at: string
  updated_at: string
}
