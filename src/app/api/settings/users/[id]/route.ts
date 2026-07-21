import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { UserRole } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

const schema = z.object({
  hourlyRate: z.number().min(0).max(10_000).optional(), role: z.nativeEnum(UserRole).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  firstName: z.string().trim().min(1).max(100).optional(), lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(50).optional(), barNumber: z.string().trim().max(100).optional(),
}).strict()

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const actor = await prisma.user.findFirst({ where: { id: session.user.id, firmId: session.user.firmId, isActive: true }, select: { role: true } })
    if (!actor || !['ADMIN', 'PARTNER'].includes(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    const input = schema.parse(await request.json())
    const user = await prisma.user.findFirst({ where: { id: (await params).id, firmId: session.user.firmId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (actor.role !== 'ADMIN' && (['ADMIN', 'PARTNER'].includes(user.role) || (input.role && ['ADMIN', 'PARTNER'].includes(input.role)))) return NextResponse.json({ error: 'Only an administrator can change privileged users' }, { status: 403 })
    const disablingAdmin = user.role === 'ADMIN' && (input.status === 'INACTIVE' || (input.role && input.role !== 'ADMIN'))
    if (disablingAdmin && await prisma.user.count({ where: { firmId: session.user.firmId, role: 'ADMIN', isActive: true } }) <= 1) return NextResponse.json({ error: 'The last active administrator cannot be disabled or demoted' }, { status: 409 })
    const status = input.status ?? user.status
    const updated = await prisma.user.update({ where: { id: user.id }, data: {
      ...input, status, isActive: status === 'ACTIVE', phone: input.phone === '' ? null : input.phone, barNumber: input.barNumber === '' ? null : input.barNumber,
    }, select: { id: true, email: true, firstName: true, lastName: true, role: true, hourlyRate: true, status: true, phone: true, barNumber: true } })
    return NextResponse.json({ ...updated, hourlyRate: Number(updated.hourlyRate ?? 0) })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid user update', details: error.flatten().fieldErrors }, { status: 422 })
    console.error('User update failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
