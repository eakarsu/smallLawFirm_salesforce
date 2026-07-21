import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { authOptions } from './auth'
import { createRevenueProviders, RevenueProviderConfigurationError, RevenueProviderRequestError } from './revenue-operations-providers'
import { PrismaRevenueRepository } from './revenue-operations-repository'
import { RevenueOperationsWorkflow, RevenueWorkflowError, type RevenueActor, type RevenueState } from './revenue-operations-workflow'

export async function revenueActor(): Promise<RevenueActor> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session.user.firmId) throw new RevenueWorkflowError('UNAUTHORIZED', 'Authentication is required', 401)
  return { userId: session.user.id, firmId: session.user.firmId, role: session.user.role }
}

export function revenueWorkflow() {
  const configured = Number(process.env.REVENUE_HOURLY_LIMIT ?? '100')
  const hourlyLimit = Number.isInteger(configured) && configured > 0 && configured <= 10_000 ? configured : 100
  return new RevenueOperationsWorkflow(new PrismaRevenueRepository(), createRevenueProviders(), undefined, hourlyLimit)
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) throw new RevenueWorkflowError('INVALID_ORIGIN', 'Cross-origin mutation was rejected', 403)
}

export function prospectSummary(state: RevenueState) {
  return {
    id: state.id,
    normalizedEmail: state.normalizedEmail,
    givenName: state.givenName,
    familyName: state.familyName,
    company: state.company,
    region: state.region,
    lifecycle: state.lifecycle,
    ownerId: state.ownerId,
    source: state.attribution.source,
    qualityScore: state.dataQuality.score,
    retryAt: state.retryAt,
    syncStatus: state.sync.status,
    updatedAt: state.updatedAt,
  }
}

export function revenueError(error: unknown) {
  if (error instanceof RevenueWorkflowError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: 'Request validation failed', code: 'INVALID_INPUT', details: error.flatten().fieldErrors }, { status: 422 })
  if (error instanceof RevenueProviderConfigurationError) return NextResponse.json({ error: error.message, code: error.code }, { status: 503 })
  if (error instanceof RevenueProviderRequestError) return NextResponse.json({ error: error.message, code: error.code, retryAfterSeconds: error.retryAfterSeconds }, { status: 502 })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'Prospect identity already exists', code: 'DUPLICATE_PROSPECT' }, { status: 409 })
  console.error('Revenue operations request failed', error instanceof Error ? error.name : typeof error)
  return NextResponse.json({ error: 'Revenue operation failed', code: 'INTERNAL_ERROR' }, { status: 500 })
}
