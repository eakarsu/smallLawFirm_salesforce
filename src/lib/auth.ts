import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import prisma from './prisma'
import { UserRole } from '@prisma/client'
import { rateLimiter } from './rate-limit'

const invalidPasswordHash = '$2a$12$xRUp3qX6EXWLbwWjjIo/JuAAVvuh5o.km1YaA3r1qAxAlNCfmD5R2'

function sessionSecret() {
  const value = process.env.NEXTAUTH_SECRET?.trim()
  if (!value || Buffer.byteLength(value) < 32 || /^(your-secret|change-me|dev-secret|replace-with)/i.test(value)) {
    throw new Error('NEXTAUTH_SECRET must be a non-placeholder secret of at least 32 bytes')
  }
  return value
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password required')
        }

        const email = credentials.email.trim().toLowerCase()
        const address = request.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
        if (!rateLimiter(`login:${address}:${email}`, 8, 15 * 60_000).success) throw new Error('Too many sign-in attempts; try again later')

        const user = await prisma.user.findUnique({
          where: { email },
          include: { firm: true }
        })

        if (!user) {
          await bcrypt.compare(credentials.password, invalidPasswordHash)
          throw new Error('Invalid email or password')
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid || !user.isActive) {
          throw new Error('Invalid email or password')
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          firmId: user.firmId,
          firmName: user.firm.name,
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.firmId = user.firmId
        token.firmName = user.firmName
        token.firstName = user.firstName
        token.lastName = user.lastName
      } else if (token.id) {
        const liveUser = await prisma.user.findFirst({
          where: { id: token.id, firmId: token.firmId, isActive: true },
          include: { firm: { select: { name: true } } },
        })
        if (!liveUser) {
          token.id = ''; token.firmId = ''; token.role = ''
        } else {
          token.role = liveUser.role; token.firmName = liveUser.firm.name
          token.firstName = liveUser.firstName; token.lastName = liveUser.lastName
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
        session.user.firmId = token.firmId as string
        session.user.firmName = token.firmName as string
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  secret: sessionSecret(),
}
