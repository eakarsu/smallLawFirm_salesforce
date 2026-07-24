import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt || prompt.length > 4000) return NextResponse.json({ error: 'Prompt must contain 1-4000 characters' }, { status: 400 })
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    const model = process.env.OPENROUTER_MODEL?.trim()
    const baseUrl = process.env.OPENROUTER_BASE_URL?.replace(/\/$/, '')
    if (!apiKey || !model || !baseUrl) return NextResponse.json({ error: 'AI provider is not configured' }, { status: 503 })
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Give concise law-firm workflow guidance. Do not provide legal advice and clearly distinguish operational suggestions.' }, { role: 'user', content: prompt }], max_tokens: 180 }),
      signal: AbortSignal.timeout(45000), cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({})) as { id?: string; model?: string; choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!response.ok || !payload.id || !content) throw new Error(`OpenRouter request failed with HTTP ${response.status}`)
    const receipt = await prisma.aiProviderReceipt.create({
      data: { userId: session.user.id, provider: 'openrouter', providerRequestId: payload.id, model: payload.model || model, prompt, content },
      select: { id: true, provider: true, providerRequestId: true, model: true, createdAt: true },
    })
    return NextResponse.json({ content, receipt })
  } catch (error) {
    console.error('Runtime AI request failed', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'AI provider request failed' }, { status: 502 })
  }
}
