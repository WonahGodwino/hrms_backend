// src/app/api/ai/test/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { calculateAICVReviewScore } from '@/app/lib/aiCVReview'

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY not configured in environment variables' },
        { status: 400 }
      )
    }

    const { jobDescription, cvText } = await request.json()
    
    if (!jobDescription || !cvText) {
      return NextResponse.json(
        { error: 'jobDescription and cvText are required' },
        { status: 400 }
      )
    }

    const result = await calculateAICVReviewScore(jobDescription, cvText, {
      useOpenAI: true,
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4-turbo-preview'
    })

    return NextResponse.json({
      success: true,
      result: result,
      aiService: 'openai',
      model: 'gpt-4-turbo-preview',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('OpenAI test failed:', error)
    
    return NextResponse.json(
      { 
        error: 'OpenAI test failed',
        message: error.message,
        details: error.stack
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'AI Test Endpoint',
    status: 'active',
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    configuredServices: {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      local: true // Always available
    }
  })
}