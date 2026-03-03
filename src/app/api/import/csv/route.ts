import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface CSVRow {
    [key: string]: string;
}

interface ParsedTransaction {
    date: Date;
    amount: number;
    payee: string;
    memo: string;
    originalRow: CSVRow;
}

interface BankFormat {
    name: string;
    dateColumns: string[];
    amountColumns: string[];
    creditColumns?: string[];
    debitColumns?: string[];
    payeeColumns: string[];
    memoColumns: string[];
    dateFormat: 'AU' | 'US' | 'ISO';
}

// Common Australian bank formats
const BANK_FORMATS: BankFormat[] = [
    {
        name: 'ANZ',
        dateColumns: ['Date', 'Transaction Date', 'date'],
        amountColumns: ['Amount', 'amount'],
        payeeColumns: ['Description', 'Payee', 'Narrative', 'description'],
        memoColumns: ['Reference', 'Details', 'Memo', 'memo'],
        dateFormat: 'AU',
    },
    {
        name: 'CommBank',
        dateColumns: ['Date', 'date'],
        amountColumns: ['Amount', 'Debit/Credit'],
        creditColumns: ['Credit'],
        debitColumns: ['Debit'],
        payeeColumns: ['Description', 'Narrative'],
        memoColumns: ['Balance'],
        dateFormat: 'AU',
    },
    {
        name: 'NAB',
        dateColumns: ['Date', 'Transaction Date'],
        amountColumns: ['Amount'],
        creditColumns: ['Credit Amount'],
        debitColumns: ['Debit Amount'],
        payeeColumns: ['Transaction Details', 'Description'],
        memoColumns: ['Merchant Category', 'Reference'],
        dateFormat: 'AU',
    },
    {
        name: 'Westpac',
        dateColumns: ['Date', 'Transaction Date'],
        amountColumns: ['Amount'],
        creditColumns: ['Credit ($)'],
        debitColumns: ['Debit ($)'],
        payeeColumns: ['Narrative', 'Description'],
        memoColumns: ['Balance ($)', 'Reference'],
        dateFormat: 'AU',
    },
    {
        name: 'Generic',
        dateColumns: ['date', 'Date', 'DATE', 'transaction_date', 'TransactionDate', 'Posted Date'],
        amountColumns: ['amount', 'Amount', 'AMOUNT', 'transaction_amount', 'Value'],
        creditColumns: ['credit', 'Credit', 'CREDIT', 'Inflow', 'incoming'],
        debitColumns: ['debit', 'Debit', 'DEBIT', 'Outflow', 'outgoing'],
        payeeColumns: ['payee', 'Payee', 'PAYEE', 'description', 'Description', 'DESCRIPTION', 'merchant', 'Merchant', 'name', 'Name'],
        memoColumns: ['memo', 'Memo', 'MEMO', 'notes', 'Notes', 'reference', 'Reference', 'category', 'Category'],
        dateFormat: 'AU',
    },
];

// POST - Analyze CSV and return preview
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const accountId = formData.get('accountId') as string;
        const action = formData.get('action') as string; // 'preview' or 'import'
        
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const text = await file.text();
        const rows = parseCSV(text);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'No data found in CSV' }, { status: 400 });
        }

        const headers = Object.keys(rows[0]);
        const { format, transactions } = detectFormatAndParse(rows, headers);

        if (action === 'preview') {
            return NextResponse.json({
                headers,
                sampleRows: rows.slice(0, 5),
                totalRows: rows.length,
                detectedFormat: format?.name || 'Unknown',
                parsedTransactions: transactions.slice(0, 10),
            });
        }

        // Import mode
        if (!accountId) {
            return NextResponse.json({ error: 'Account ID required for import' }, { status: 400 });
        }

        let imported = 0;
        let duplicates = 0;
        const skipped = 0;

        // Wrap entire import in a transaction to prevent race conditions
        await prisma.$transaction(async (tx) => {
            for (const t of transactions) {
                // Check for duplicate (same date, amount, payee within 5 days)
                const startDate = new Date(t.date);
                startDate.setDate(startDate.getDate() - 2);
                const endDate = new Date(t.date);
                endDate.setDate(endDate.getDate() + 2);

                const existing = await tx.transaction.findFirst({
                    where: {
                        accountId,
                        amount: t.amount,
                        date: { gte: startDate, lte: endDate },
                        payee: t.payee,
                    },
                });

                if (existing) {
                    duplicates++;
                    continue;
                }

                // Create the transaction
                await tx.transaction.create({
                    data: {
                        date: t.date,
                        amount: t.amount,
                        payee: t.payee,
                        memo: t.memo || null,
                        accountId,
                        cleared: true,
                        approved: false, // Mark as unapproved for review
                    },
                });

                // Update account balance
                await tx.account.update({
                    where: { id: accountId },
                    data: { balance: { increment: t.amount } },
                });

                imported++;
            }
        });

        return NextResponse.json({
            success: true,
            imported,
            skipped,
            duplicates,
            total: transactions.length,
        });
    } catch (error) {
        console.error('Error importing CSV:', error);
        return NextResponse.json({ error: 'Failed to import CSV' }, { status: 500 });
    }
}

// GET - Get column mapping options and supported formats
export async function GET() {
    return NextResponse.json({
        supportedFormats: BANK_FORMATS.map(f => ({
            name: f.name,
            dateColumns: f.dateColumns,
            amountColumns: f.amountColumns,
            payeeColumns: f.payeeColumns,
        })),
        instructions: 'Upload a CSV file with your bank transactions. The system will attempt to auto-detect the format.',
    });
}

// Parse CSV text into rows
function parseCSV(text: string): CSVRow[] {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    // Detect delimiter (comma, semicolon, or tab)
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t') && !firstLine.includes(',')) {
        delimiter = '\t';
    } else if (firstLine.includes(';') && !firstLine.includes(',')) {
        delimiter = ';';
    }

    // Parse headers
    const headers = parseCSVLine(lines[0], delimiter);
    
    // Parse data rows
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i], delimiter);
        if (values.length === headers.length) {
            const row: CSVRow = {};
            headers.forEach((h, idx) => {
                row[h.trim()] = values[idx].trim();
            });
            rows.push(row);
        }
    }

    return rows;
}

// Parse a single CSV line, handling quoted values
function parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);

    return result;
}

// Detect bank format and parse transactions
function detectFormatAndParse(rows: CSVRow[], headers: string[]): { format: BankFormat | null; transactions: ParsedTransaction[] } {
    // Try each format until one works
    for (const format of BANK_FORMATS) {
        const dateCol = format.dateColumns.find(c => headers.includes(c));
        const amountCol = format.amountColumns.find(c => headers.includes(c));
        const payeeCol = format.payeeColumns.find(c => headers.includes(c));
        const creditCol = format.creditColumns?.find(c => headers.includes(c));
        const debitCol = format.debitColumns?.find(c => headers.includes(c));
        const memoCol = format.memoColumns.find(c => headers.includes(c));

        // Need at least date and (amount OR credit/debit) and payee
        if (dateCol && (amountCol || (creditCol && debitCol)) && payeeCol) {
            const transactions: ParsedTransaction[] = [];

            for (const row of rows) {
                try {
                    const dateStr = row[dateCol];
                    const date = parseDate(dateStr, format.dateFormat);
                    
                    if (!date || isNaN(date.getTime())) continue;

                    let amount: number;
                    if (amountCol) {
                        amount = parseAmount(row[amountCol]);
                    } else if (creditCol && debitCol) {
                        const credit = parseAmount(row[creditCol] || '0');
                        const debit = parseAmount(row[debitCol] || '0');
                        amount = credit > 0 ? credit : -debit;
                    } else {
                        continue;
                    }

                    if (amount === 0) continue;

                    const payee = row[payeeCol] || 'Unknown';
                    const memo = memoCol ? row[memoCol] : '';

                    transactions.push({
                        date,
                        amount: Math.round(amount * 100), // Convert to cents
                        payee: payee.trim(),
                        memo: memo.trim(),
                        originalRow: row,
                    });
                } catch {
                    // Skip invalid rows
                }
            }

            if (transactions.length > 0) {
                return { format, transactions };
            }
        }
    }

    return { format: null, transactions: [] };
}

// Parse date string based on format
function parseDate(dateStr: string, format: 'AU' | 'US' | 'ISO'): Date | null {
    if (!dateStr) return null;
    
    dateStr = dateStr.trim();

    // Try ISO format first (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return new Date(dateStr);
    }

    // Australian format (DD/MM/YYYY)
    if (format === 'AU' && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateStr)) {
        const [day, month, year] = dateStr.split('/').map(Number);
        const fullYear = year < 100 ? 2000 + year : year;
        return new Date(fullYear, month - 1, day);
    }

    // US format (MM/DD/YYYY)
    if (format === 'US' && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateStr)) {
        const [month, day, year] = dateStr.split('/').map(Number);
        const fullYear = year < 100 ? 2000 + year : year;
        return new Date(fullYear, month - 1, day);
    }

    // Try parsing with Date constructor as fallback
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
}

// Parse amount string to number
function parseAmount(amountStr: string): number {
    if (!amountStr) return 0;
    
    // Remove currency symbols, commas, and spaces
    let cleaned = amountStr.replace(/[^0-9.\-+()]/g, '');
    
    // Handle parentheses as negative (accounting format)
    if (amountStr.includes('(') && amountStr.includes(')')) {
        cleaned = '-' + cleaned.replace(/[()]/g, '');
    }
    
    // Handle DR/CR suffix
    if (amountStr.toUpperCase().includes('DR')) {
        cleaned = '-' + cleaned.replace(/DR/gi, '');
    }
    
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
}
