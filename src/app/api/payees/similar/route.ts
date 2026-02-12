import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
}) : null;

interface SimilarGroup {
    payees: string[];
    suggestedName: string;
    confidence: number;
}

// Normalize payee name for comparison
function normalizePayee(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')         // Normalize spaces
        .trim();
}

// Calculate Levenshtein distance
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

// Calculate similarity score (0-1)
function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const distance = levenshteinDistance(a, b);
    return 1 - (distance / maxLen);
}

// Find similar payees using string similarity
function findSimilarPayeesLocal(payees: string[]): SimilarGroup[] {
    const normalized = payees.map(p => ({ original: p, normalized: normalizePayee(p) }));
    const groups: SimilarGroup[] = [];
    const used = new Set<string>();
    
    for (let i = 0; i < normalized.length; i++) {
        if (used.has(normalized[i].original)) continue;
        
        const similar: string[] = [normalized[i].original];
        
        for (let j = i + 1; j < normalized.length; j++) {
            if (used.has(normalized[j].original)) continue;
            
            const sim = similarity(normalized[i].normalized, normalized[j].normalized);
            
            // Also check if one contains the other
            const containment = 
                normalized[i].normalized.includes(normalized[j].normalized) ||
                normalized[j].normalized.includes(normalized[i].normalized);
            
            if (sim > 0.7 || containment) {
                similar.push(normalized[j].original);
                used.add(normalized[j].original);
            }
        }
        
        if (similar.length > 1) {
            used.add(normalized[i].original);
            
            // Pick the cleanest name as suggested (shortest without numbers at end)
            const suggestedName = similar
                .map(s => s.replace(/\s*#?\d+$/, '').trim()) // Remove trailing numbers
                .sort((a, b) => {
                    // Prefer shorter, cleaner names
                    const aScore = a.length + (a.match(/[^a-zA-Z\s]/g)?.length || 0) * 10;
                    const bScore = b.length + (b.match(/[^a-zA-Z\s]/g)?.length || 0) * 10;
                    return aScore - bScore;
                })[0] || similar[0];
            
            groups.push({
                payees: similar,
                suggestedName,
                confidence: 0.8,
            });
        }
    }
    
    return groups;
}

// Find similar payees using AI
async function findSimilarPayeesAI(payees: string[]): Promise<SimilarGroup[]> {
    if (!openai) {
        return findSimilarPayeesLocal(payees);
    }
    
    const prompt = `You are a financial data cleanup AI. Analyze these payee names and group similar ones that likely refer to the same merchant/entity.

Payee names:
${payees.slice(0, 100).map((p, i) => `${i + 1}. ${p}`).join('\n')}

Rules:
- Group payees that are clearly the same entity (e.g., "AMZN MKTPLC", "Amazon", "AMAZON.COM" are the same)
- Account for bank transaction formatting (truncation, abbreviations, reference numbers)
- Ignore trailing transaction IDs or reference numbers
- Only group if you're confident they're the same entity

Respond with ONLY a JSON array:
[{
    "payees": ["Original Name 1", "Original Name 2"],
    "suggestedName": "Clean Merchant Name",
    "confidence": 0.95
}, ...]

Return empty array [] if no similar payees found. Only include groups with 2+ payees.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 1500,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const groups = JSON.parse(jsonMatch[0]) as SimilarGroup[];
            // Validate that payees exist in original list
            return groups.filter(g => 
                g.payees.length >= 2 && 
                g.payees.every(p => payees.includes(p))
            );
        }
        return [];
    } catch (error) {
        console.error('AI similar payee detection failed:', error);
        // Fall back to local algorithm
        return findSimilarPayeesLocal(payees);
    }
}

// POST - Find similar payees
export async function POST(request: NextRequest) {
    try {
        const { payees } = await request.json();

        if (!payees || !Array.isArray(payees) || payees.length < 2) {
            return NextResponse.json({ groups: [] });
        }

        // Use AI if available, otherwise use local algorithm
        const groups = await findSimilarPayeesAI(payees);

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Similar payee detection error:', error);
        return NextResponse.json({ error: 'Failed to find similar payees' }, { status: 500 });
    }
}
