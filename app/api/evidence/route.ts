/**
 * Evidence Search API
 * Provides evidence-backed search results for medical queries
 */

import { NextResponse } from 'next/server';
import { synthesizeEvidence, generateEvidenceSummary } from '@/lib/evidence';
import type { EvidenceSearchOptions } from '@/lib/evidence/types';

export const maxDuration = 30;

interface EvidenceRequest {
  query: string;
  maxResults?: number;
  minEvidenceLevel?: number;
  studyTypes?: string[];
  minYear?: number;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as EvidenceRequest;
    const { 
      query, 
      maxResults = 8, 
      minEvidenceLevel = 5,
      studyTypes,
      minYear 
    } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const options: EvidenceSearchOptions = {
      query,
      maxResults,
      minEvidenceLevel,
      studyTypes,
      minYear,
    };

    const result = await synthesizeEvidence(options);
    
    // Generate summary statistics
    const summary = generateEvidenceSummary(result.context.citations);

    return NextResponse.json({
      success: true,
      shouldUseEvidence: result.shouldUseEvidence,
      citations: result.context.citations,
      summary,
      searchTimeMs: result.searchTimeMs,
    });
  } catch (error) {
    console.error('[Evidence API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to search evidence',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

