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
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''

    const where: any = {
      firmId: session.user.firmId,
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    if (type && type !== 'all') {
      where.type = type
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        client: { select: { id: true, firstName: true, lastName: true, companyName: true, type: true } },
      },
      orderBy: { lastName: 'asc' },
    })

    return NextResponse.json(contacts)
  } catch (error) {
    console.error('Contacts API error:', error)
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const contact = await prisma.contact.create({
      data: {
        firmId: session.user.firmId,
        type: body.type,
        firstName: body.firstName,
        lastName: body.lastName,
        company: body.company || null,
        title: body.title || null,
        email: body.email || null,
        phone: body.phone || null,
        notes: body.notes || null,
        clientId: body.clientId || null,
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, companyName: true, type: true } },
      },
    })

    return NextResponse.json(contact, { status: 201 })
  } catch (error) {
    console.error('Create contact error:', error)
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 })
  }
}
