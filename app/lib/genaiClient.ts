import { GoogleGenAI } from '@google/genai'

let clientInstance: GoogleGenAI | null = null

export function getGenAIClient(): GoogleGenAI {
  if (clientInstance) {
    return clientInstance
  }

  // Get API key from environment variable
  // Try GEMINI_API_KEY first (as shown in the example), then fall back to GOOGLE_API_KEY
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set')
  }

  clientInstance = new GoogleGenAI({ apiKey })

  return clientInstance
}
