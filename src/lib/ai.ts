import OpenAI from 'openai'

// Lazy initialization to avoid build-time errors when env vars aren't set
let _openai: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': 'GetFirmFlow',
      },
    })
  }
  return _openai
}

// Default model to use via OpenRouter - use env variable or fallback
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku'

// Helper function to extract JSON from AI response (handles markdown code blocks)
function extractJSON(content: string): string {
  // Remove markdown code blocks if present
  let cleaned = content.trim()

  // Handle ```json ... ``` or ``` ... ```
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim()
  }

  // Try to find JSON object if still not clean
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
    }
  }

  return cleaned
}

export async function draftDocument(params: {
  documentType: string
  matterId?: string
  clientName?: string
  matterName?: string
  jurisdiction?: string
  opposingParty?: string
  courtName?: string
  caseNumber?: string
  additionalContext?: string
}): Promise<string> {
  const { documentType, clientName, matterName, jurisdiction, opposingParty, courtName, caseNumber, additionalContext } = params

  const systemPrompt = `You are an experienced legal document drafting assistant for a law firm.
You draft professional, accurate legal documents following standard legal conventions and formatting.
Always include appropriate disclaimers and placeholders for firm-specific information.`

  const contextDetails = [
    clientName ? `Client: ${clientName}` : 'Client: [Client Name]',
    matterName ? `Matter: ${matterName}` : 'Matter: [Matter Name]',
    jurisdiction ? `Jurisdiction: ${jurisdiction}` : '',
    opposingParty ? `Opposing Party: ${opposingParty}` : '',
    courtName ? `Court: ${courtName}` : '',
    caseNumber ? `Case Number: ${caseNumber}` : '',
    additionalContext ? `Additional context: ${additionalContext}` : '',
  ].filter(Boolean).join('\n')

  const userPrompt = `Draft a ${documentType} with the following details:
${contextDetails}

Please create a professional legal document with proper formatting, sections, and legal language.`

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    })

    return response.choices[0]?.message?.content || 'Unable to generate document'
  } catch (error) {
    console.error('AI document drafting error:', error)
    throw new Error('Failed to draft document')
  }
}

export interface LegalResearchResult {
  summary: string
  cases: Array<{
    name: string
    citation: string
    year: string
    summary: string
    relevance: string
  }>
  statutes: Array<{
    title: string
    citation: string
    summary: string
  }>
  analysis: string
  recommendations: string[]
}

export async function performLegalResearch(params: {
  query: string
  jurisdiction?: string
  practiceArea?: string
}): Promise<LegalResearchResult> {
  const { query, jurisdiction, practiceArea } = params

  const systemPrompt = `You are a legal research assistant helping attorneys find relevant case law, statutes, and legal precedents.
You MUST respond in valid JSON format only. No other text.`

  const userPrompt = `Research the following legal question:
${query}
${jurisdiction ? `Jurisdiction: ${jurisdiction}` : ''}
${practiceArea ? `Practice Area: ${practiceArea}` : ''}

Respond with a JSON object in this exact format:
{
  "summary": "A 2-3 sentence summary of the research findings",
  "cases": [
    {
      "name": "Case Name",
      "citation": "Citation",
      "year": "Year",
      "summary": "Brief summary of the case holding",
      "relevance": "Why this case is relevant to the query"
    }
  ],
  "statutes": [
    {
      "title": "Statute title",
      "citation": "Statute citation",
      "summary": "Brief summary of the statute"
    }
  ],
  "analysis": "Detailed legal analysis of the issue",
  "recommendations": ["Recommendation 1", "Recommendation 2", "Recommendation 3"]
}

Include 2-3 relevant cases and 1-2 relevant statutes. Respond ONLY with valid JSON, no additional text.`

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    try {
      // Try to parse as JSON, handling markdown code blocks
      const cleanedContent = extractJSON(content)
      const parsed = JSON.parse(cleanedContent)
      return {
        summary: parsed.summary || 'Research completed.',
        cases: parsed.cases || [],
        statutes: parsed.statutes || [],
        analysis: parsed.analysis || '',
        recommendations: parsed.recommendations || []
      }
    } catch {
      // If not valid JSON, create a basic structure
      return {
        summary: 'Legal research completed. Please review the analysis.',
        cases: [],
        statutes: [],
        analysis: 'The AI analysis returned an unexpected format. Please try again.',
        recommendations: ['Re-run the legal research query', 'Try with more specific terms']
      }
    }
  } catch (error) {
    console.error('AI legal research error:', error)
    throw new Error('Failed to perform legal research')
  }
}

export interface ContractReviewResult {
  summary: string
  keyTerms: Array<{
    term: string
    description: string
    location: string
  }>
  risks: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    title: string
    description: string
    recommendation: string
  }>
  missingClauses: Array<{
    clause: string
    importance: string
    recommendation: string
  }>
  recommendations: string[]
  overallRiskLevel: 'low' | 'medium' | 'high'
  riskScore: number
}

export async function reviewContract(params: {
  contractText: string
  contractType?: string
  clientRole?: string
  focusAreas?: string[] | string
}): Promise<ContractReviewResult> {
  const { contractText, contractType, clientRole, focusAreas } = params

  const focusAreasStr = Array.isArray(focusAreas) ? focusAreas.join(', ') : focusAreas || ''

  const contextInfo = [
    contractType ? `Contract Type: ${contractType}` : '',
    clientRole ? `Client Role: ${clientRole}` : '',
    focusAreasStr ? `Focus Areas: ${focusAreasStr}` : '',
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are a contract review specialist. Analyze contracts for risks, compliance issues, and key terms.
Provide structured analysis with specific recommendations.
You MUST respond in valid JSON format only. No other text.
${contextInfo ? `\nContext:\n${contextInfo}` : ''}`

  const userPrompt = `Review this contract:

${contractText.substring(0, 15000)}

Respond with a JSON object in this exact format:
{
  "summary": "2-3 sentence summary of the contract and key concerns",
  "keyTerms": [
    {
      "term": "Term name",
      "description": "Description of what this term means",
      "location": "Section X"
    }
  ],
  "risks": [
    {
      "severity": "low|medium|high|critical",
      "title": "Risk title",
      "description": "Description of the risk",
      "recommendation": "How to address this risk"
    }
  ],
  "missingClauses": [
    {
      "clause": "Clause name",
      "importance": "Why this clause is important",
      "recommendation": "Suggested language or approach"
    }
  ],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "overallRiskLevel": "low|medium|high",
  "riskScore": 0-100
}

Include 4-6 key terms, 3-5 risks, 2-3 missing clauses, and 4-6 recommendations.
Respond ONLY with valid JSON, no additional text.`

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    try {
      const cleanedContent = extractJSON(content)
      const parsed = JSON.parse(cleanedContent)
      return {
        summary: parsed.summary || 'Contract reviewed.',
        keyTerms: parsed.keyTerms || [],
        risks: parsed.risks || [],
        missingClauses: parsed.missingClauses || [],
        recommendations: parsed.recommendations || [],
        overallRiskLevel: parsed.overallRiskLevel || 'medium',
        riskScore: typeof parsed.riskScore === 'number' ? parsed.riskScore : 50
      }
    } catch {
      // If parsing still fails, return a structured response
      return {
        summary: 'Contract analysis completed. Please review the findings below.',
        keyTerms: [],
        risks: [{
          severity: 'medium' as const,
          title: 'Analysis Note',
          description: 'The AI analysis returned an unexpected format. Please try again or review the contract manually.',
          recommendation: 'Re-run the analysis or consult with a legal professional.'
        }],
        missingClauses: [],
        recommendations: ['Re-run the contract analysis', 'Consider manual review for complex contracts'],
        overallRiskLevel: 'medium' as const,
        riskScore: 50
      }
    }
  } catch (error) {
    console.error('AI contract review error:', error)
    throw new Error('Failed to review contract')
  }
}

export async function captureTimeEntry(params: {
  description: string
  matterContext?: string
}): Promise<{
  suggestedHours: number
  activityCode: string
  enhancedDescription: string
  billable: boolean
}> {
  const { description, matterContext } = params

  const systemPrompt = `You are a legal billing assistant. Analyze work descriptions to suggest appropriate time entries.
Consider standard legal billing practices and UTBMS activity codes.`

  const userPrompt = `Analyze this work description for time entry:
"${description}"
${matterContext ? `Matter context: ${matterContext}` : ''}

Provide:
1. Suggested hours (in 0.1 increments)
2. Appropriate UTBMS activity code (A101-A110)
3. Enhanced professional description
4. Whether this is typically billable

Format as JSON:
{
  "suggestedHours": 0.0,
  "activityCode": "A101",
  "enhancedDescription": "...",
  "billable": true
}`

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content || '{}'
    try {
      return JSON.parse(content)
    } catch {
      return {
        suggestedHours: 0.5,
        activityCode: 'A108',
        enhancedDescription: description,
        billable: true,
      }
    }
  } catch (error) {
    console.error('AI time capture error:', error)
    throw new Error('Failed to capture time entry')
  }
}

export async function enhanceTimeDescription(description: string): Promise<string> {
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a legal billing assistant. Enhance time entry descriptions to be professional, detailed, and suitable for client invoices. Keep it concise but descriptive.',
        },
        {
          role: 'user',
          content: `Enhance this time entry description: "${description}"`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    })

    return response.choices[0]?.message?.content || description
  } catch (error) {
    console.error('AI enhance description error:', error)
    return description
  }
}

export interface CaseAnalysisResult {
  strengthScore: number
  riskLevel: 'low' | 'medium' | 'high'
  keyStrengths: string[]
  keyWeaknesses: string[]
  recommendedActions: string[]
  similarCases: Array<{
    name: string
    outcome: string
    relevance: number
  }>
  estimatedOutcome: string
  strategicRecommendations: string
}

export async function analyzeCaseStrength(params: {
  caseDescription: string
  opposingArguments?: string
  evidence?: string
  witnesses?: string
}): Promise<CaseAnalysisResult> {
  const { caseDescription, opposingArguments, evidence, witnesses } = params

  const systemPrompt = `You are a legal case analyst. Analyze case details and provide strategic insights.
You MUST respond in valid JSON format only. No other text.`

  const userPrompt = `Analyze the following case:

Case Description:
${caseDescription}

${opposingArguments ? `Opposing Arguments:\n${opposingArguments}\n` : ''}
${evidence ? `Available Evidence:\n${evidence}\n` : ''}
${witnesses ? `Witnesses:\n${witnesses}\n` : ''}

Respond with a JSON object in this exact format:
{
  "strengthScore": 0-100,
  "riskLevel": "low|medium|high",
  "keyStrengths": ["Strength 1", "Strength 2", "Strength 3"],
  "keyWeaknesses": ["Weakness 1", "Weakness 2"],
  "recommendedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "similarCases": [
    {"name": "Case Name (Year)", "outcome": "Outcome description", "relevance": 0-100}
  ],
  "estimatedOutcome": "2-3 sentence estimated outcome analysis",
  "strategicRecommendations": "2-3 sentence strategic recommendations"
}

Respond ONLY with valid JSON, no additional text.`

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    try {
      const cleanedContent = extractJSON(content)
      const parsed = JSON.parse(cleanedContent)
      return {
        strengthScore: typeof parsed.strengthScore === 'number' ? parsed.strengthScore : 50,
        riskLevel: parsed.riskLevel || 'medium',
        keyStrengths: parsed.keyStrengths || [],
        keyWeaknesses: parsed.keyWeaknesses || [],
        recommendedActions: parsed.recommendedActions || [],
        similarCases: parsed.similarCases || [],
        estimatedOutcome: parsed.estimatedOutcome || '',
        strategicRecommendations: parsed.strategicRecommendations || ''
      }
    } catch {
      return {
        strengthScore: 50,
        riskLevel: 'medium' as const,
        keyStrengths: ['Case details have been received'],
        keyWeaknesses: ['Unable to complete full analysis'],
        recommendedActions: ['Re-run the case analysis', 'Provide more detailed case information'],
        similarCases: [],
        estimatedOutcome: 'Analysis could not be completed. Please try again with more specific details.',
        strategicRecommendations: 'Consider re-running the analysis or consulting directly with legal counsel.'
      }
    }
  } catch (error) {
    console.error('AI case analysis error:', error)
    throw new Error('Failed to analyze case')
  }
}

export interface ClientIntakeResult {
  conflictCheck: {
    status: 'clear' | 'potential' | 'conflict'
    details: string[]
  }
  matterRecommendation: {
    practiceArea: string
    matterType: string
    complexity: 'low' | 'moderate' | 'high' | 'very_high'
    estimatedHours: number
    suggestedRetainer: number
  }
  riskAssessment: {
    level: 'low' | 'medium' | 'high'
    factors: string[]
  }
  nextSteps: string[]
  questionsToAsk: string[]
  documentsNeeded: string[]
}

export async function analyzeClientIntake(params: {
  clientType: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  companyName?: string
  legalIssue: string
  urgency?: string
  budget?: string
  referralSource?: string
  additionalNotes?: string
}): Promise<ClientIntakeResult> {
  const { clientType, firstName, lastName, companyName, legalIssue, urgency, budget, additionalNotes } = params

  const systemPrompt = `You are a legal intake specialist. Analyze client intake information and provide recommendations.
You MUST respond in valid JSON format only. No other text.`

  const userPrompt = `Analyze this client intake:

Client Type: ${clientType}
Name: ${firstName} ${lastName}
${companyName ? `Company: ${companyName}` : ''}
Legal Issue: ${legalIssue}
${urgency ? `Urgency: ${urgency}` : ''}
${budget ? `Budget: ${budget}` : ''}
${additionalNotes ? `Additional Notes: ${additionalNotes}` : ''}

Respond with a JSON object in this exact format:
{
  "conflictCheck": {
    "status": "clear|potential|conflict",
    "details": ["Detail 1", "Detail 2"]
  },
  "matterRecommendation": {
    "practiceArea": "Practice area name",
    "matterType": "Specific matter type",
    "complexity": "low|moderate|high|very_high",
    "estimatedHours": 0,
    "suggestedRetainer": 0
  },
  "riskAssessment": {
    "level": "low|medium|high",
    "factors": ["Factor 1", "Factor 2"]
  },
  "nextSteps": ["Step 1", "Step 2", "Step 3"],
  "questionsToAsk": ["Question 1", "Question 2", "Question 3"],
  "documentsNeeded": ["Document 1", "Document 2", "Document 3"]
}

Respond ONLY with valid JSON, no additional text.`

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    try {
      const cleanedContent = extractJSON(content)
      const parsed = JSON.parse(cleanedContent)
      return {
        conflictCheck: parsed.conflictCheck || { status: 'clear', details: [] },
        matterRecommendation: parsed.matterRecommendation || {
          practiceArea: 'General',
          matterType: 'Consultation',
          complexity: 'moderate',
          estimatedHours: 10,
          suggestedRetainer: 2500
        },
        riskAssessment: parsed.riskAssessment || { level: 'medium', factors: [] },
        nextSteps: parsed.nextSteps || [],
        questionsToAsk: parsed.questionsToAsk || [],
        documentsNeeded: parsed.documentsNeeded || []
      }
    } catch {
      return {
        conflictCheck: { status: 'clear' as const, details: ['Intake received - further analysis needed'] },
        matterRecommendation: {
          practiceArea: 'General',
          matterType: 'Consultation',
          complexity: 'moderate' as const,
          estimatedHours: 10,
          suggestedRetainer: 2500
        },
        riskAssessment: { level: 'medium' as const, factors: ['Analysis format error - please retry'] },
        nextSteps: ['Re-run the intake analysis', 'Schedule initial consultation'],
        questionsToAsk: ['What is the primary legal issue?', 'What are the time constraints?'],
        documentsNeeded: ['Identification documents', 'Any relevant contracts or correspondence']
      }
    }
  } catch (error) {
    console.error('AI client intake error:', error)
    throw new Error('Failed to analyze client intake')
  }
}
