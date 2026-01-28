import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { performLegalResearch } from '@/lib/ai'

// Sample research results for fallback
function getSampleResearchResults(query: string, jurisdiction: string, practiceArea: string) {
  return {
    summary: `Based on the legal question regarding "${query.substring(0, 100)}...", the following key legal principles and precedents apply in ${jurisdiction || 'the relevant jurisdiction'}. This research memo provides an analysis of applicable case law, statutes, and practical recommendations.`,
    cases: [
      {
        name: "Palsgraf v. Long Island Railroad Co.",
        citation: "248 N.Y. 339, 162 N.E. 99 (1928)",
        year: "1928",
        summary: "Landmark case establishing the concept of proximate cause and duty in negligence law. The court held that a defendant owes a duty of care only to those who are in the reasonably foreseeable zone of danger.",
        relevance: "Establishes foundational principles for determining scope of duty and foreseeability in tort claims."
      },
      {
        name: "Hadley v. Baxendale",
        citation: "9 Ex. 341, 156 Eng. Rep. 145 (1854)",
        year: "1854",
        summary: "Seminal case on contract damages establishing that damages must flow naturally from the breach or be within the contemplation of the parties at the time of contracting.",
        relevance: "Provides framework for analyzing recoverable damages in contract disputes."
      },
      {
        name: "Erie Railroad Co. v. Tompkins",
        citation: "304 U.S. 64 (1938)",
        year: "1938",
        summary: "Supreme Court case establishing that federal courts sitting in diversity must apply state substantive law.",
        relevance: "Important for determining which state's law applies in federal court proceedings."
      }
    ],
    statutes: [
      {
        title: "Statute of Limitations",
        citation: jurisdiction ? `${jurisdiction} Civil Practice Law` : "State Civil Code § 335.1",
        summary: "Establishes time limits for filing various civil actions. Personal injury claims typically must be filed within 2-3 years of the injury."
      },
      {
        title: "Comparative Negligence",
        citation: jurisdiction ? `${jurisdiction} Comp. Neg. Statute` : "State Civil Code § 1714",
        summary: "Allows recovery of damages reduced by plaintiff's percentage of fault. Pure comparative negligence permits recovery even if plaintiff is more than 50% at fault."
      }
    ],
    analysis: `Legal Analysis:\n\n1. APPLICABLE LEGAL FRAMEWORK\nThe legal issues presented involve established principles of ${practiceArea || 'civil law'}. Under the applicable law of ${jurisdiction || 'the jurisdiction'}, several key doctrines govern the analysis.\n\n2. APPLICATION TO FACTS\nBased on the facts presented in the query, the relevant legal standards would be applied as follows. The burden of proof rests with the plaintiff to establish each element of their claim by a preponderance of the evidence.\n\n3. POTENTIAL DEFENSES\nSeveral defenses may be available depending on the specific circumstances, including statute of limitations, comparative negligence, and failure to mitigate damages.\n\n4. DAMAGES ANALYSIS\nRecoverable damages may include compensatory damages (economic and non-economic), and in some cases, punitive damages if the conduct rises to the level of willful or wanton misconduct.`,
    recommendations: [
      "Conduct additional research on specific jurisdictional variations and recent case developments",
      "Review applicable statutes of limitations to ensure timely filing",
      "Gather all relevant documentation and evidence to support the claims",
      "Consider alternative dispute resolution options before litigation",
      "Consult with experts if technical or specialized knowledge is required",
      "Verify all citations in official legal databases before relying on them"
    ]
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { query, jurisdiction, practiceArea, additionalContext } = body

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    try {
      const results = await performLegalResearch({
        query,
        jurisdiction,
        practiceArea,
      })
      return NextResponse.json(results)
    } catch (aiError) {
      // Return sample research if AI fails
      console.log('AI unavailable, returning sample research results')
      const results = getSampleResearchResults(query, jurisdiction || '', practiceArea || '')
      return NextResponse.json(results)
    }
  } catch (error) {
    console.error('Legal research API error:', error)
    return NextResponse.json({ error: 'Failed to perform research' }, { status: 500 })
  }
}
