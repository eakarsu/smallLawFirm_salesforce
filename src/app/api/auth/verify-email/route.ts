import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { applicationUrl, digestAuthToken, issueAuthToken } from '@/lib/auth-tokens'
import { sendEmail, textEmailHtml } from '@/lib/email'
import { rateLimiter } from '@/lib/rate-limit'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!rateLimiter(`verify:${session.user.id}`, 3, 60 * 60_000).success) return NextResponse.json({ error: 'Too many verification requests' }, { status: 429 })
    const user = await prisma.user.findFirst({ where: { id: session.user.id, firmId: session.user.firmId, isActive: true } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (user.emailVerified) return NextResponse.json({ message: 'Email already verified' })
    const token = issueAuthToken()
    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({ where: { userId: user.id, used: false }, data: { used: true } }),
      prisma.emailVerificationToken.create({ data: { token: token.digest, userId: user.id, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }),
    ])
    try {
      const url = applicationUrl('/verify-email', token.raw)
      await sendEmail({ to: user.email, subject: 'Verify your GetFirmFlow email', html: textEmailHtml(['Verify your email using this one-time link within 24 hours:', url]) })
    } catch (error) {
      await prisma.emailVerificationToken.updateMany({ where: { userId: user.id, token: token.digest }, data: { used: true } })
      throw error
    }
    return NextResponse.json({ message: 'Verification email sent' })
  } catch (error) {
    console.error('Verification email delivery failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 503 })
  }
}

export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get('token')
    if (!raw || raw.length > 200) return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 })
    const token = await prisma.emailVerificationToken.findUnique({ where: { token: digestAuthToken(raw) } })
    if (!token || token.used || token.expiresAt < new Date()) return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 })
    await prisma.$transaction([
      prisma.user.update({ where: { id: token.userId }, data: { emailVerified: true } }),
      prisma.emailVerificationToken.update({ where: { id: token.id }, data: { used: true } }),
    ])
    return NextResponse.json({ message: 'Email verified successfully' })
  } catch (error) {
    console.error('Email verification failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json({ error: 'Failed to verify email' }, { status: 500 })
  }
}
