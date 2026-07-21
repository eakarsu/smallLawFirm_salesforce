import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSameOrigin, revenueActor, revenueError, revenueWorkflow } from '@/lib/revenue-operations-api'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign_owner'), ownerId: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.literal('enrich') }).strict(),
  z.object({ action: z.literal('prepare_review'), subject: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(10_000) }).strict(),
  z.object({ action: z.literal('review'), decision: z.enum(['APPROVE', 'REJECT']), notes: z.string().trim().min(1).max(2_000) }).strict(),
  z.object({ action: z.literal('send_outreach') }).strict(),
  z.object({ action: z.literal('verify_engagement') }).strict(),
  z.object({ action: z.literal('handoff'), startsAt: z.string().datetime() }).strict(),
  z.object({ action: z.literal('opt_out'), reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal('sync_outbound') }).strict(),
])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request)
    const actor = await revenueActor(); const workflow = revenueWorkflow(); const input = schema.parse(await request.json())
    let result
    switch (input.action) {
      case 'assign_owner': result = await workflow.assignOwner(actor, (await params).id, input.ownerId); break
      case 'enrich': result = await workflow.enrich(actor, (await params).id); break
      case 'prepare_review': result = await workflow.prepareReview(actor, (await params).id, input.subject, input.body); break
      case 'review': result = await workflow.review(actor, (await params).id, input.decision, input.notes); break
      case 'send_outreach': result = await workflow.sendOutreach(actor, (await params).id); break
      case 'verify_engagement': result = await workflow.verifyEngagement(actor, (await params).id); break
      case 'handoff': result = await workflow.handoff(actor, (await params).id, input.startsAt); break
      case 'opt_out': result = await workflow.optOut(actor, (await params).id, input.reason); break
      case 'sync_outbound': result = await workflow.syncOutbound(actor, (await params).id); break
    }
    return NextResponse.json(result)
  } catch (error) { return revenueError(error) }
}
