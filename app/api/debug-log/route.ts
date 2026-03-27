import { appendFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const text = await req.text()
  const file = path.join(process.cwd(), 'debug-seedance.ndjson')
  await appendFile(file, `${text}\n`, 'utf8')
  return NextResponse.json({ ok: true })
}
