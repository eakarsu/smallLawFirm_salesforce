import { NextResponse } from 'next/server'
import { prospectSummary, revenueActor, revenueError, revenueWorkflow } from '@/lib/revenue-operations-api'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const state = await revenueWorkflow().view(await revenueActor(), (await params).id)
    return NextResponse.json({ ...state, ...prospectSummary(state) })
  }
  catch (error) { return revenueError(error) }
}
