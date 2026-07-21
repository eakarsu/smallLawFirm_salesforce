import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { applicationUrl, issueAuthToken } from '@/lib/auth-tokens'
import { sendEmail, textEmailHtml } from '@/lib/email'
import { rateLimiter } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const generic = { message: 'If an account with that email exists, a password reset link has been sent.' }
  try {
    const value: unknown = await request.json()
    const email = typeof value === 'object' && value && 'email' in value ? String(value.email).trim().toLowerCase() : ''
    const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!rateLimiter(`forgot:${address}:${email}`, 5, 15 * 60_000).success) return NextResponse.json(generic, { status: 202 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json(generic, { status: 202 })
    const user = await prisma.user.findUnique({ where: { email } })
    if (user?.isActive) {
      const token = issueAuthToken()
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({ where: { userId: user.id, used: false }, data: { used: true } }),
        prisma.passwordResetToken.create({ data: { token: token.digest, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) } }),
      ])
      try {
        const url = applicationUrl('/reset-password', token.raw)
        await sendEmail({ to: user.email, subject: 'Reset your GetFirmFlow password', html: textEmailHtml(['A password reset was requested for your account.', `Open this one-time link within one hour: ${url}`, 'If you did not request this, no action is required.']) })
      } catch (error) {
        await prisma.passwordResetToken.updateMany({ where: { userId: user.id, token: token.digest }, data: { used: true } })
        console.error('Password reset email delivery failed', error instanceof Error ? error.name : typeof error)
      }
    }
    return NextResponse.json(generic, { status: 202 })
  } catch (error) {
    console.error('Password reset request failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json(generic, { status: 202 })
  }
}
