'use client'

import { CenteredModal } from '@/app/components/ui/CenteredModal'
import { UserProject } from '@/app/lib/projectTypes'
import styles from './ProjectSelectModal.module.css'

type ProjectSelectModalProps = {
  projects: UserProject[]
  activeProjectId: string | null
  onSelect: (projectId: string) => void
  onClose: () => void
}

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ProjectSelectModal({ projects, activeProjectId, onSelect, onClose }: ProjectSelectModalProps) {
  return (
    <CenteredModal onClose={onClose} size="folder">
      <div className={styles.header}>
        <h2>Select project</h2>
      </div>
      <div className={styles.list} role="listbox" aria-label="Projects">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={`${styles.projectOption} ${project.id === activeProjectId ? styles.projectOptionActive : ''}`}
            onClick={() => {
              onSelect(project.id)
              onClose()
            }}
          >
            <span className={styles.projectName}>{project.name}</span>
            <span className={styles.projectMeta}>Created {formatCreatedAt(project.created_at)}</span>
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          Close
        </button>
      </div>
    </CenteredModal>
  )
}
