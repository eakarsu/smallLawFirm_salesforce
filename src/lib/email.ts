import nodemailer from 'nodemailer'

export interface EmailOptions {
  to: string
  cc?: string
  subject: string
  html: string
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for email delivery`)
  return value
}

export async function sendEmail(options: EmailOptions): Promise<{ messageId: string }> {
  const port = Number(process.env.SMTP_PORT ?? '587')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SMTP_PORT is invalid')
  const user = required('SMTP_USER')
  const transporter = nodemailer.createTransport({
    host: required('SMTP_HOST'),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    auth: { user, pass: required('SMTP_PASSWORD') },
  })
  const result = await transporter.sendMail({
    from: required('SMTP_FROM'), to: options.to, cc: options.cc, subject: options.subject,
    html: options.html, disableFileAccess: true, disableUrlAccess: true,
  })
  if (!result.messageId) throw new Error('SMTP provider returned no message identity')
  return { messageId: result.messageId }
}

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!))

export function textEmailHtml(lines: string[]) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>`
}

export function generateInvoiceEmailHtml(invoice: {
  invoiceNumber: string; clientName: string; matterName: string; totalAmount: number; dueDate: Date; firmName: string
}): string {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.totalAmount)
  const dueDate = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(invoice.dueDate)
  return textEmailHtml([
    `Dear ${invoice.clientName},`,
    `Invoice ${invoice.invoiceNumber} from ${invoice.firmName} is ready for ${invoice.matterName}.`,
    `Amount due: ${amount}. Due date: ${dueDate}.`,
    `Please contact ${invoice.firmName} with questions.`,
  ])
}
