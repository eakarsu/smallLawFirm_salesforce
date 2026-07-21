import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { UserRole } from '@prisma/client'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { validatePasswordStrength } from '@/lib/password-validation'
import prisma from '@/lib/prisma'

const createSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
  role: z.nativeEnum(UserRole), password: z.string().max(200),
  hourlyRate: z.union([z.string(), z.number()]).optional(), phone: z.string().trim().max(50).optional(), barNumber: z.string().trim().max(100).optional(),
}).strict()

async function manager() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const user = await prisma.user.findFirst({ where: { id: session.user.id, firmId: session.user.firmId, isActive: true }, select: { role: true } })
  return user && ['ADMIN', 'PARTNER'].includes(user.role) ? { session, role: user.role } : null
}

export async function GET() {
  try {
    const actor = await manager()
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const users = await prisma.user.findMany({
      where: { firmId: actor.session.user.firmId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, hourlyRate: true, status: true, phone: true, barNumber: true },
      orderBy: [{ isActive: 'desc' }, { lastName: 'asc' }],
    })
    return NextResponse.json(users.map((user) => ({ ...user, hourlyRate: Number(user.hourlyRate ?? 0) })))
  } catch (error) {
    console.error('User list failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await manager()
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    const input = createSchema.parse(await request.json())
    if (actor.role !== 'ADMIN' && ['ADMIN', 'PARTNER'].includes(input.role)) return NextResponse.json({ error: 'Only an administrator can provision privileged users' }, { status: 403 })
    const strength = validatePasswordStrength(input.password)
    if (!strength.isValid) return NextResponse.json({ error: 'Password is too weak', suggestions: strength.suggestions }, { status: 422 })
    const hourlyRate = input.hourlyRate === undefined || input.hourlyRate === '' ? null : Number(input.hourlyRate)
    if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 10_000)) return NextResponse.json({ error: 'Hourly rate is invalid' }, { status: 422 })
    const user = await prisma.user.create({ data: {
      email: input.email, password: await bcrypt.hash(input.password, 12), firstName: input.firstName, lastName: input.lastName, role: input.role,
      hourlyRate, phone: input.phone || null, barNumber: input.barNumber || null, firmId: actor.session.user.firmId, emailVerified: false,
    }, select: { id: true, email: true, firstName: true, lastName: true, role: true, hourlyRate: true, status: true, phone: true, barNumber: true } })
    return NextResponse.json({ ...user, hourlyRate: Number(user.hourlyRate ?? 0) }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid user details', details: error.flatten().fieldErrors }, { status: 422 })
    console.error('User provisioning failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json({ error: 'Failed to provision user' }, { status: 500 })
  }
}
