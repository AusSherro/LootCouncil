import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

interface YNABTransaction {
    Date: string | number;
    Payee: string;
    Category?: string;
    'Category Group'?: string;
    'Category Group/Category'?: string;
    Memo?: string;
    Outflow?: string | number;
    Inflow?: string | number;
    Account?: string;
    '"Account"'?: string; // YNAB exports with quoted column name
    Cleared?: string;
}

interface YNABBudget {
    Month?: string | number;
    Category?: string;
    'Category Group'?: string;
    'Category Group/Category'?: string;
    Budgeted?: string | number;
    Assigned?: string | number;  // YNAB sometimes uses this field name
    Activity?: string | number;
    Available?: string | number;
}

function parseAmount(value: string | number | undefined): number {
    if (value === undefined || value === '') return 0;
    if (typeof value === 'number') return Math.round(value * 100);
    const cleaned = value.replace(/[$,]/g, '');
    return Math.round(parseFloat(cleaned) * 100) || 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAccountName(row: any): string | undefined {
    // After normalization, Account key should be clean
    return row.Account || undefined;
}

function parseExcelDate(value: string | number | undefined): Date | null {
    if (value === undefined || value === '') return null;
    
    // If it's a number, it's an Excel serial date
    if (typeof value === 'number') {
        // Excel serial date: days since 1899-12-30 (accounting for Excel's leap year bug)
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
        return date;
    }
    
    // Try parsing as string
    const strValue = String(value);
    
    // Try direct Date parse first
    let date = new Date(strValue);
    if (!isNaN(date.getTime())) return date;
    
    // Try DD/MM/YYYY format
    const parts = strValue.split('/');
    if (parts.length === 3) {
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        if (!isNaN(date.getTime())) return date;
    }
    
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCategoryName(row: any): string | undefined {
    // If we have explicit Category, use it
    if (row.Category) return row.Category;

    // If not, try to parse from combined column "Category Group/Category"
    // Format is usually "Group: Category"
    if (row['Category Group/Category']) {
        const parts = row['Category Group/Category'].split(': ');
        // If there's a colon, the part after is the category
        if (parts.length > 1) return parts.slice(1).join(': ');
        // If no colon, assume the whole thing is the category name (or it's a transfer)
        return parts[0];
    }
    return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCategoryGroupName(row: any): string | undefined {
    if (row['Category Group']) return row['Category Group'];

    // Fallback to parsing from combined column
    if (row['Category Group/Category']) {
        const parts = row['Category Group/Category'].split(': ');
        return parts[0];
    }
    return undefined;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        let transactionData: YNABTransaction[] = [];
        let budgetData: YNABBudget[] = [];

        // Helper to normalize keys (remove quotes, trim, etc.)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const normalizeRow = (row: any): any => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const normalized: any = {};
            for (const key of Object.keys(row)) {
                // Remove leading/trailing quotes and whitespace from key
                const cleanKey = key.replace(/^["'\s]+|["'\s]+$/g, '');
                // Also convert value to string if it should be string
                normalized[cleanKey] = row[key];
            }
            return normalized;
        };

        // Check if zip
        if (file.name.endsWith('.zip') || file.type.includes('zip')) {
            const zip = new JSZip();
            const contents = await zip.loadAsync(buffer);

            // Find Register/Transactions file
            const registerFile = Object.values(contents.files).find(f =>
                f.name.toLowerCase().includes('register') ||
                f.name.toLowerCase().includes('transactions')
            );

            // Find Budget/Plan file
            const budgetFile = Object.values(contents.files).find(f =>
                f.name.toLowerCase().includes('budget') ||
                f.name.toLowerCase().includes('plan')
            );

            if (registerFile) {
                const csvContent = await registerFile.async('string');
                const workbook = XLSX.read(csvContent, { type: 'string', raw: false });
                const sheetName = workbook.SheetNames[0];
                const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                transactionData = rawData.map(normalizeRow);
            }

            if (budgetFile) {
                const csvContent = await budgetFile.async('string');
                const workbook = XLSX.read(csvContent, { type: 'string', raw: false });
                const sheetName = workbook.SheetNames[0];
                const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                budgetData = rawData.map(normalizeRow);
            }
        } else {
            // Try standard Excel/Single CSV read
            const workbook = XLSX.read(buffer, { type: 'array' });

            // Process Register (transactions) sheet
            const registerSheet = workbook.Sheets['Register'] || workbook.Sheets['Transactions'];
            if (registerSheet) {
                transactionData = XLSX.utils.sheet_to_json(registerSheet);
            }

            // Process Budget sheet
            const budgetSheet = workbook.Sheets['Budget'];
            if (budgetSheet) {
                budgetData = XLSX.utils.sheet_to_json(budgetSheet);
            }
        }

        let transactionCount = 0;
        let categoryCount = 0;
        let accountCount = 0;

        if (transactionData.length > 0) {
            // Create accounts first
            const accountNames = [...new Set(transactionData.map(t => getAccountName(t)).filter(Boolean))] as string[];
            const accountMap = new Map<string, string>();

            for (const name of accountNames) {
                const existing = await prisma.account.findFirst({ where: { name } });
                if (existing) {
                    accountMap.set(name, existing.id);
                } else {
                    const account = await prisma.account.create({
                        data: {
                            name,
                            type: name.toLowerCase().includes('credit') ? 'credit' :
                                name.toLowerCase().includes('saving') ? 'savings' : 'checking',
                            onBudget: true,
                        },
                    });
                    accountMap.set(name, account.id);
                    accountCount++;
                }
            }

            // Create categories
            const categoryGroups = [...new Set(transactionData.map(t => getCategoryGroupName(t)).filter(Boolean))];
            const groupMap = new Map<string, string>();
            const categoryMap = new Map<string, string>();

            for (const groupName of categoryGroups) {
                if (!groupName) continue;
                const existing = await prisma.categoryGroup.findFirst({ where: { name: groupName } });
                if (existing) {
                    groupMap.set(groupName, existing.id);
                } else {
                    const group = await prisma.categoryGroup.create({
                        data: { name: groupName },
                    });
                    groupMap.set(groupName, group.id);
                }
            }

            const categoryNames = [...new Set(transactionData.map(t => {
                const group = getCategoryGroupName(t);
                const cat = getCategoryName(t);
                return group && cat ? `${group}:${cat}` : null;
            }).filter(Boolean))] as string[];

            for (const catKey of categoryNames) {
                const [groupName, catName] = catKey.split(':');
                const groupId = groupMap.get(groupName);
                if (!groupId || !catName) continue;

                const existing = await prisma.category.findFirst({
                    where: { name: catName, groupId }
                });
                if (existing) {
                    categoryMap.set(catKey, existing.id);
                } else {
                    const category = await prisma.category.create({
                        data: { name: catName, groupId },
                    });
                    categoryMap.set(catKey, category.id);
                    categoryCount++;
                }
            }

            // Create transactions
            for (const t of transactionData) {
                const accountName = getAccountName(t);
                if (!t.Date || !accountName) continue;

                const accountId = accountMap.get(accountName);
                if (!accountId) continue;

                const outflow = parseAmount(t.Outflow);
                const inflow = parseAmount(t.Inflow);
                const amount = inflow - outflow;

                const group = getCategoryGroupName(t);
                const cat = getCategoryName(t);
                const categoryKey = group && cat ? `${group}:${cat}` : null;
                const categoryId = categoryKey ? categoryMap.get(categoryKey) : null;

                // Parse date (handle Excel serial numbers and string dates)
                const date = parseExcelDate(t.Date);
                if (!date) continue;

                await prisma.transaction.create({
                    data: {
                        date,
                        amount,
                        payee: t.Payee ? String(t.Payee) : null,
                        memo: t.Memo ? String(t.Memo) : null,
                        accountId,
                        categoryId: categoryId || null,
                        cleared: t.Cleared === 'Cleared' || t.Cleared === 'Reconciled',
                        isReconciled: t.Cleared === 'Reconciled',
                        approved: true,
                    },
                });
                transactionCount++;
            }

            // Update account balances - working balance from all transactions, cleared from cleared only
            for (const [, id] of accountMap) {
                const totalSum = await prisma.transaction.aggregate({
                    where: { accountId: id },
                    _sum: { amount: true },
                });
                const clearedSum = await prisma.transaction.aggregate({
                    where: { accountId: id, cleared: true },
                    _sum: { amount: true },
                });
                await prisma.account.update({
                    where: { id },
                    data: {
                        balance: totalSum._sum.amount || 0,
                        clearedBalance: clearedSum._sum.amount || 0,
                    },
                });
            }
        }

        if (budgetData.length > 0) {
            for (const b of budgetData) {
                // Handle both Month field name variations
                const monthValue = b.Month;
                if (!monthValue) continue;

                const groupName = getCategoryGroupName(b);
                const categoryName = getCategoryName(b);

                if (!categoryName) continue;

                // Find or create category
                let groupId: string | undefined;

                const existingGroup = await prisma.categoryGroup.findFirst({
                    where: { name: groupName }
                });
                if (existingGroup) {
                    groupId = existingGroup.id;
                } else if (groupName) {
                    const group = await prisma.categoryGroup.create({
                        data: { name: groupName },
                    });
                    groupId = group.id;
                }

                if (!groupId) continue;

                let category = await prisma.category.findFirst({
                    where: { name: categoryName, groupId },
                });
                if (!category) {
                    category = await prisma.category.create({
                        data: { name: categoryName, groupId },
                    });
                    // Only increment if we didn't already count it from transactions
                    // But checking unique count is safer. For now this is fine.
                }

                // Parse month - XLSX might convert "Feb 2026" to Excel serial date
                let monthStr: string;
                try {
                    // If it's a number, it's an Excel serial date for the first day of the month
                    if (typeof monthValue === 'number') {
                        const parsedDate = parseExcelDate(monthValue);
                        if (!parsedDate) continue;
                        monthStr = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}`;
                    } else {
                        const monthString = String(monthValue).trim();
                        
                        // Try parsing "Aug 2016" format: append day 1 for reliable parsing  
                        let monthDate = new Date(monthString + ' 1, 00:00:00');
                        
                        if (isNaN(monthDate.getTime())) {
                            // Try direct parse
                            monthDate = new Date(monthString);
                        }
                        
                        if (isNaN(monthDate.getTime())) {
                            // Try ISO format "2024-02" or "2024-02-01"
                            if (/^\d{4}-\d{2}/.test(monthString)) {
                                const parts = monthString.split('-');
                                monthStr = `${parts[0]}-${parts[1]}`;
                                monthDate = new Date(`${monthStr}-01`);
                            }
                        }

                        if (isNaN(monthDate.getTime())) continue;

                        monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
                    }
                } catch {
                    continue;
                }

                // Handle both "Budgeted" and "Assigned" field names
                const assignedValue = b.Budgeted ?? b.Assigned ?? 0;

                await prisma.monthlyBudget.upsert({
                    where: {
                        month_categoryId: { month: monthStr, categoryId: category.id },
                    },
                    create: {
                        month: monthStr,
                        categoryId: category.id,
                        assigned: parseAmount(assignedValue),
                        activity: parseAmount(b.Activity),
                        available: parseAmount(b.Available),
                    },
                    update: {
                        assigned: parseAmount(assignedValue),
                        activity: parseAmount(b.Activity),
                        available: parseAmount(b.Available),
                    },
                });
            }
        }

        return NextResponse.json({
            success: true,
            transactions: transactionCount,
            categories: categoryCount,
            accounts: accountCount,
        });
    } catch (error) {
        console.error('YNAB import error:', error);
        return NextResponse.json(
            { error: 'Failed to import YNAB data', details: String(error) },
            { status: 500 }
        );
    }
}
