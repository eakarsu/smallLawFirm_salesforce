import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prospectSummary, requireSameOrigin, revenueActor, revenueError, revenueWorkflow } from '@/lib/revenue-operations-api'

const createSchema = z.object({
  email: z.string().email().max(254),
  givenName: z.string().trim().max(100).default(''),
  familyName: z.string().trim().max(100).default(''),
  company: z.string().trim().max(180).default(''),
  region: z.string().trim().min(2).max(20),
  source: z.string().trim().min(1).max(100),
  campaign: z.string().trim().max(100).optional(),
}).strict()

export async function GET() {
  try {
    const actor = await revenueActor(); const workflow = revenueWorkflow()
    const prospects = await workflow.list(actor)
    const metrics = ['ADMIN', 'PARTNER'].includes(actor.role) ? await workflow.metrics(actor) : null
    return NextResponse.json({ prospects: prospects.map(prospectSummary), metrics })
  } catch (error) { return revenueError(error) }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const actor = await revenueActor(); const input = createSchema.parse(await request.json())
    return NextResponse.json(await revenueWorkflow().createManual(actor, input), { status: 201 })
  } catch (error) { return revenueError(error) }
}
