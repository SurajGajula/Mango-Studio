export const GEMINI_TTS_SAMPLE_RATE = 24000
export const GEMINI_TTS_CHANNELS = 1
export const GEMINI_TTS_BITS_PER_SAMPLE = 16

export const GEMINI_TTS_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const

export type GeminiTtsVoice = (typeof GEMINI_TTS_VOICES)[number]

export function pcmToWav(
  pcm: Buffer,
  sampleRate = GEMINI_TTS_SAMPLE_RATE,
  channels = GEMINI_TTS_CHANNELS,
  bitsPerSample = GEMINI_TTS_BITS_PER_SAMPLE
): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function normalizeGeminiTtsVoice(voiceName?: string): GeminiTtsVoice {
  if (!voiceName) return 'Kore'
  const match = GEMINI_TTS_VOICES.find((v) => v.toLowerCase() === voiceName.trim().toLowerCase())
  return match ?? 'Kore'
}
