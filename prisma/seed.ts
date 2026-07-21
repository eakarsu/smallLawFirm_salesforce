import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for controlled bootstrap`)
  return value
}

async function main() {
  if (process.env.ALLOW_BOOTSTRAP_SEED !== 'true') throw new Error('Refusing to seed without ALLOW_BOOTSTRAP_SEED=true')
  const password = required('BOOTSTRAP_ADMIN_PASSWORD')
  if (password.length < 16 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be 16+ characters with upper, lower, number, and special characters')
  }
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL is invalid')
  if (await prisma.user.findUnique({ where: { email } })) throw new Error('Bootstrap administrator already exists; no changes were made')
  const firm = await prisma.firm.create({ data: {
    name: required('BOOTSTRAP_FIRM_NAME'),
    email: process.env.BOOTSTRAP_FIRM_EMAIL?.trim().toLowerCase() || null,
    timezone: process.env.BOOTSTRAP_FIRM_TIMEZONE?.trim() || 'America/New_York',
  } })
  await prisma.user.create({ data: {
    email, password: await bcrypt.hash(password, 12), firstName: required('BOOTSTRAP_ADMIN_FIRST_NAME'), lastName: required('BOOTSTRAP_ADMIN_LAST_NAME'),
    role: UserRole.ADMIN, firmId: firm.id, isActive: true, status: 'ACTIVE', emailVerified: false,
  } })
  console.log('Controlled firm and administrator bootstrap completed; no credentials were printed')
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Bootstrap failed'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
