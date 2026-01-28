import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId') || ''

    const where: any = {
      trustAccount: { firmId: session.user.firmId },
    }

    if (accountId && accountId !== 'all') {
      where.trustAccountId = accountId
    }

    const transactions = await prisma.trustTransaction.findMany({
      where,
      include: {
        trustAccount: { select: { name: true } },
        matter: { select: { title: true, matterNumber: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
      take: 100,
    })

    return NextResponse.json(transactions)
  } catch (error) {
    console.error('Trust transactions API error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Get account
    const account = await prisma.trustAccount.findUnique({
      where: { id: body.accountId },
    })

    if (!account || account.firmId !== session.user.firmId) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const amount = parseFloat(body.amount)

    // Calculate new balance
    let newBalance: number
    if (body.type === 'DEPOSIT') {
      newBalance = Number(account.balance) + amount
    } else {
      newBalance = Number(account.balance) - amount
      if (newBalance < 0) {
        return NextResponse.json({ error: 'Insufficient funds' }, { status: 400 })
      }
    }

    // Create transaction and update account balance in a transaction
    const [transaction] = await prisma.$transaction([
      prisma.trustTransaction.create({
        data: {
          trustAccountId: body.accountId,
          matterId: body.matterId || null,
          type: body.type,
          amount,
          runningBalance: newBalance,
          description: body.description,
          reference: body.reference || null,
          date: new Date(),
          createdById: session.user.id,
        },
        include: {
          trustAccount: { select: { name: true } },
          matter: { select: { title: true, matterNumber: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.trustAccount.update({
        where: { id: body.accountId },
        data: { balance: newBalance },
      }),
    ])

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error('Create trust transaction error:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
