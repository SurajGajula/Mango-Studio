import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/utils/supabase/server'
import { generateRoutingDataset } from '@/app/lib/webLlm/training/generateRoutingDataset'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    count?: number
    seed?: number
    includeExperiments?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const count = typeof body.count === 'number' ? Math.min(Math.max(body.count, 1), 200) : 25

  try {
    const result = await generateRoutingDataset({
      count,
      seed: typeof body.seed === 'number' ? body.seed : Date.now(),
      includeExperiments: body.includeExperiments !== false,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate routing dataset' },
      { status: 500 }
    )
  }
}
