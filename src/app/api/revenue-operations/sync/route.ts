import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSameOrigin, revenueActor, revenueError, revenueWorkflow } from '@/lib/revenue-operations-api'

const schema = z.object({ cursor: z.string().trim().max(500).optional() }).strict()

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const actor = await revenueActor(); const { cursor } = schema.parse(await request.json())
    return NextResponse.json(await revenueWorkflow().syncInbound(actor, cursor))
  } catch (error) { return revenueError(error) }
}
