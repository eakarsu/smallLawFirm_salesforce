import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdvisoryHandlers } from '@/lib/native-advisory-runtime'
import { advisoryRepository } from '@/lib/native-advisory-repository'
const handlers = createAdvisoryHandlers({
  async authenticate() { const session = await getServerSession(authOptions); return session?.user?.id ? { id: session.user.id, scopeId: session.user.firmId, role: session.user.role } : null },
  repository: advisoryRepository, maxPrompt: 4000, maxTokens: 180, timeoutMs: 45000, requireReceipt: true,
  systemPrompt: 'Give concise law-firm workflow guidance. Do not provide legal advice and clearly distinguish operational suggestions.',
  reply: item => ({ content: item.content, receipt: { id: item.id, provider: 'openrouter', providerRequestId: item.providerReceipt?.id, model: item.model, createdAt: item.createdAt } }),
})
export const POST = handlers.POST
export const GET = handlers.GET
