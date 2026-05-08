import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserProject } from '@/app/lib/projectTypes'

const ACTIVE_PROJECT_KEY_PREFIX = 'active-project-id:'

function activeProjectStorageKey(userId: string): string {
  return `${ACTIVE_PROJECT_KEY_PREFIX}${userId}`
}

type ProjectsResponse = { projects: UserProject[] }

export function useProjects(userId: string | null) {
  const [projects, setProjects] = useState<UserProject[]>([])
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const setActiveProjectId = useCallback(
    (projectId: string | null) => {
      setActiveProjectIdState(projectId)
      if (!userId || !projectId) return
      localStorage.setItem(activeProjectStorageKey(userId), projectId)
    },
    [userId]
  )

  const refreshProjects = useCallback(async () => {
    if (!userId) {
      setProjects([])
      setActiveProjectIdState(null)
      setReady(true)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', { method: 'GET' })
      const body = (await res.json().catch(() => null)) as ProjectsResponse | { error?: string } | null
      if (!res.ok || !body || !('projects' in body)) {
        throw new Error((body as { error?: string } | null)?.error ?? 'Failed to load projects')
      }
      const nextProjects = body.projects ?? []
      setProjects(nextProjects)
      const stored = localStorage.getItem(activeProjectStorageKey(userId))
      const preferredId = stored && nextProjects.some((p) => p.id === stored) ? stored : nextProjects[0]?.id ?? null
      setActiveProjectIdState(preferredId)
      if (preferredId) {
        localStorage.setItem(activeProjectStorageKey(userId), preferredId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
      setReady(true)
    }
  }, [userId])

  useEffect(() => {
    setReady(false)
    void refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    if (!userId) return
    const onProjectsUpdated = () => {
      void refreshProjects()
    }
    window.addEventListener('projects-updated', onProjectsUpdated)
    return () => window.removeEventListener('projects-updated', onProjectsUpdated)
  }, [refreshProjects, userId])

  const createProject = useCallback(
    async (name: string) => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = (await res.json().catch(() => null)) as { project?: UserProject; error?: string } | null
      if (!res.ok || !body?.project) throw new Error(body?.error ?? 'Failed to create project')
      setProjects((prev) => [body.project as UserProject, ...prev])
      setActiveProjectId(body.project.id)
      return body.project as UserProject
    },
    [setActiveProjectId]
  )

  const renameProject = useCallback(async (projectId: string, name: string) => {
    const res = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name }),
    })
    const body = (await res.json().catch(() => null)) as { project?: UserProject; error?: string } | null
    if (!res.ok || !body?.project) throw new Error(body?.error ?? 'Failed to rename project')
    setProjects((prev) => prev.map((project) => (project.id === projectId ? (body.project as UserProject) : project)))
  }, [])

  const deleteProject = useCallback(
    async (projectId: string) => {
      const res = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const body = (await res.json().catch(() => null)) as ProjectsResponse | { error?: string } | null
      if (!res.ok || !body || !('projects' in body)) throw new Error((body as { error?: string } | null)?.error ?? 'Failed to delete project')
      const nextProjects = body.projects ?? []
      setProjects(nextProjects)
      if (activeProjectId === projectId) {
        const nextActiveId = nextProjects[0]?.id ?? null
        setActiveProjectId(nextActiveId)
      }
    },
    [activeProjectId, setActiveProjectId]
  )

  return useMemo(
    () => ({
      projects,
      activeProjectId,
      setActiveProjectId,
      loading,
      error,
      ready,
      refreshProjects,
      createProject,
      renameProject,
      deleteProject,
    }),
    [projects, activeProjectId, setActiveProjectId, loading, error, ready, refreshProjects, createProject, renameProject, deleteProject]
  )
}
