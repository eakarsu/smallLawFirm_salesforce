import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { generateInvoiceEmailHtml, sendEmail, textEmailHtml } from '@/lib/email'
import prisma from '@/lib/prisma'

const schema = z.object({
  recipientEmail: z.string().email().max(254).optional(),
  cc: z.string().email().max(254).optional(),
  subject: z.string().trim().min(1).max(180).optional(),
  message: z.string().trim().min(1).max(10_000).optional(),
  attachPdf: z.literal(false).optional(),
}).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let logId: string | null = null
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const input = schema.parse(await request.json().catch(() => ({})))
    const invoice = await prisma.invoice.findFirst({
      where: { id: (await params).id, firmId: session.user.firmId },
      include: { matter: { include: { client: true } }, firm: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    const emailTo = input.recipientEmail || invoice.matter.client.email
    if (!emailTo) return NextResponse.json({ error: 'No recipient email is available' }, { status: 422 })
    const subject = input.subject || `Invoice ${invoice.invoiceNumber} from ${invoice.firm.name}`
    const html = input.message ? textEmailHtml(input.message.split(/\r?\n/).filter(Boolean)) : generateInvoiceEmailHtml({
      invoiceNumber: invoice.invoiceNumber, clientName: invoice.matter.client.displayName, matterName: invoice.matter.title,
      totalAmount: Number(invoice.balanceDue), dueDate: invoice.dueDate, firmName: invoice.firm.name,
    })
    const pending = await prisma.emailLog.create({ data: {
      firmId: session.user.firmId, userId: session.user.id, to: emailTo, cc: input.cc || null, subject, body: input.message || 'Generated invoice delivery message',
      entityType: 'INVOICE', entityId: invoice.id, status: 'PENDING',
    } })
    logId = pending.id
    const delivery = await sendEmail({ to: emailTo, cc: input.cc, subject, html })
    const sentAt = new Date()
    await prisma.$transaction([
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT', sentAt } }),
      prisma.emailLog.update({ where: { id: pending.id }, data: { status: 'SENT', sentAt } }),
      prisma.activity.create({ data: {
        firmId: session.user.firmId, userId: session.user.id, type: 'INVOICE_SENT', description: `Sent invoice ${invoice.invoiceNumber}`,
        entityType: 'INVOICE', entityId: invoice.id, metadata: { recipientEmail: emailTo, cc: input.cc || null, subject, providerMessageId: delivery.messageId },
      } }),
    ])
    return NextResponse.json({ success: true, message: `Invoice sent to ${emailTo}`, sentAt: sentAt.toISOString(), providerMessageId: delivery.messageId })
  } catch (error) {
    if (logId) await prisma.emailLog.update({ where: { id: logId }, data: { status: 'FAILED', error: 'Email provider delivery failed' } }).catch(() => undefined)
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid invoice delivery request', details: error.flatten().fieldErrors }, { status: 422 })
    console.error('Invoice delivery failed', error instanceof Error ? error.name : typeof error)
    return NextResponse.json({ error: 'Invoice delivery failed; invoice status was not changed' }, { status: 503 })
  }
}
