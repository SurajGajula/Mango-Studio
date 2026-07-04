import type { LocalUploadedFileMeta } from '@/app/lib/webLlm/localReplaceImagesIntent'

export function buildUploadedFilesContext(files: LocalUploadedFileMeta[]): string {
  const lines = [`Attached files (${files.length}):`]
  for (const file of files) {
    lines.push(`  - index=${file.index} type=${file.type ?? 'image'} name="${file.name}"`)
  }
  return lines.join('\n')
}
