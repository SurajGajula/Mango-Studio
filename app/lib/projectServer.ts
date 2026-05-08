import { createAdminClient } from '@/app/utils/supabase/admin'
import { UserProject } from '@/app/lib/projectTypes'

const PROJECTS_TABLE = 'projects'
const SNAPSHOTS_TABLE = 'project_snapshots'
const LEGACY_SNAPSHOT_NAME = 'default'

function defaultProjectName(): string {
  return 'My First Project'
}

async function insertProject(userId: string, name: string): Promise<UserProject | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(PROJECTS_TABLE)
    .insert({
      user_id: userId,
      name,
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !data) return null
  return data as UserProject
}

export async function listUserProjects(userId: string): Promise<UserProject[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as UserProject[]
}

export async function ensureUserHasProject(userId: string): Promise<UserProject | null> {
  const projects = await listUserProjects(userId)
  if (projects.length > 0) return projects[0]

  const admin = createAdminClient()
  const legacy = await admin
    .from(SNAPSHOTS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('name', LEGACY_SNAPSHOT_NAME)
    .maybeSingle()

  const created = await insertProject(userId, defaultProjectName())
  if (!created) return null

  if (legacy.data?.id) {
    await admin
      .from(SNAPSHOTS_TABLE)
      .update({
        project_id: created.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', legacy.data.id)
      .eq('user_id', userId)
  }

  return created
}

export async function resolveProjectId(userId: string, requestedProjectId: string | null): Promise<string | null> {
  if (requestedProjectId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from(PROJECTS_TABLE)
      .select('id')
      .eq('id', requestedProjectId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  const ensured = await ensureUserHasProject(userId)
  return ensured?.id ?? null
}
