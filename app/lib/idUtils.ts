/**
 * Generates a unique ID with a prefix and a random suffix to avoid collisions.
 * @param prefix - The prefix for the ID (e.g. 'video', 'image', 'effect').
 * @returns A unique ID string.
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 9)
  return `${prefix}-${timestamp}-${randomSuffix}`
}
