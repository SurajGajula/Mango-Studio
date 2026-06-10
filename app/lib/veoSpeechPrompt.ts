export function veoSpeechPrompt(script: string, motionPrompt?: string): string {
  const motion =
    motionPrompt?.trim() ||
    'The subject faces the camera with natural, subtle head and body movement.'
  const dialogue = script.replace(/"/g, '\\"').trim()
  return (
    `${motion} They speak directly to camera with accurate lip sync and expressive delivery, saying: "${dialogue}"`
  )
}
