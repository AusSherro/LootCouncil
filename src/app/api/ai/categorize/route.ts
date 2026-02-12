import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { categorizeTransaction, batchCategorizeTransactions } from '@/lib/openai';

// POST - Categorize transactions with AI
export async function POST(request: NextRequest) {
    try {
        // Check if OpenAI API key is configured
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({ 
                error: 'AI features require an OpenAI API key. Add OPENAI_API_KEY to your environment variables.',
                suggestions: [],
                noApiKey: true,
            });
        }

        const body = await request.json();
        const { transactionIds, mode = 'batch' } = body;

        // Get existing categories
        const categories = await prisma.category.findMany({
            select: { name: true },
        });
        const categoryNames = categories.map(c => c.name);

        if (mode === 'single' && transactionIds?.length === 1) {
            // Single transaction categorization
            const tx = await prisma.transaction.findUnique({
                where: { id: transactionIds[0] },
            });
            
            if (!tx) {
                return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
            }

            const result = await categorizeTransaction(tx.payee || 'Unknown', tx.amount, categoryNames);
            
            return NextResponse.json({
                transactionId: tx.id,
                ...result,
            });
        }

        // Batch categorization
        let transactions;
        if (transactionIds?.length > 0) {
            transactions = await prisma.transaction.findMany({
                where: { id: { in: transactionIds } },
                select: { id: true, payee: true, amount: true },
            });
        } else {
            // Get uncategorized transactions (no category)
            transactions = await prisma.transaction.findMany({
                where: { categoryId: null },
                select: { id: true, payee: true, amount: true },
                take: 20, // Limit to 20 at a time
            });
        }

        if (transactions.length === 0) {
            return NextResponse.json({ 
                message: 'No transactions to categorize',
                results: [] 
            });
        }

        // Map transactions to ensure payee is never null
        const mappedTransactions = transactions.map(t => ({
            id: t.id,
            payee: t.payee || 'Unknown',
            amount: t.amount,
        }));

        const results = await batchCategorizeTransactions(mappedTransactions, categoryNames);
        
        // Convert Map to array for response
        const resultArray = Array.from(results.entries()).map(([id, data]) => ({
            transactionId: id,
            ...data,
        }));

        return NextResponse.json({
            message: `Categorized ${resultArray.length} transactions`,
            results: resultArray,
        });
    } catch (error) {
        console.error('AI categorization error:', error);
        return NextResponse.json({ error: 'Failed to categorize transactions' }, { status: 500 });
    }
}

// PATCH - Apply AI suggestions to transactions
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { suggestions } = body; // Array of { transactionId, cleanMerchant, categoryName }

        if (!suggestions?.length) {
            return NextResponse.json({ error: 'No suggestions provided' }, { status: 400 });
        }

        let updated = 0;
        let created = 0;

        for (const suggestion of suggestions) {
            const { transactionId, cleanMerchant, categoryName } = suggestion;

            // Find or create category
            let category = await prisma.category.findFirst({
                where: { name: categoryName },
            });

            if (!category) {
                // Create new category with default group
                let group = await prisma.categoryGroup.findFirst({
                    where: { name: 'Other' },
                });
                
                if (!group) {
                    group = await prisma.categoryGroup.create({
                        data: { name: 'Other', sortOrder: 999 },
                    });
                }

                category = await prisma.category.create({
                    data: {
                        name: categoryName,
                        groupId: group.id,
                    },
                });
                created++;
            }

            // Update transaction
            await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                    payee: cleanMerchant,
                    categoryId: category.id,
                },
            });
            updated++;
        }

        return NextResponse.json({
            message: `Updated ${updated} transactions, created ${created} new categories`,
            updated,
            created,
        });
    } catch (error) {
        console.error('Apply suggestions error:', error);
        return NextResponse.json({ error: 'Failed to apply suggestions' }, { status: 500 });
    }
}
