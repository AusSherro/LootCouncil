// Demo data seeder for README screenshots.
// Populates an ISOLATED database (never the real one) with realistic fake data.
// Usage: DATABASE_URL="file:../data/loot-council-demo.db" node scripts/seed-demo.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic PRNG so the dataset is reproducible.
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(20260719);
const jitter = (base, pct = 0.08) => Math.round(base * (1 + (rand() * 2 - 1) * pct));
const day = (n) => String(n).padStart(2, '0');
const dateISO = (y, m, d) => new Date(`${y}-${day(m)}-${day(d)}T09:30:00.000Z`);

// Reporting window: Feb..Jul 2026 (current month = 2026-07 per project date).
const YEAR = 2026;
const MONTHS = [2, 3, 4, 5, 6, 7];
const CURRENT = '2026-07';
const monthKey = (m) => `${YEAR}-${day(m)}`;

async function main() {
    const existing = await prisma.profile.findFirst();
    if (existing) {
        console.log(`Profile already present ("${existing.name}") — assuming demo DB already seeded. Aborting.`);
        return;
    }

    const profile = await prisma.profile.create({ data: { name: 'Alex & Sam' } });
    const profileId = profile.id;
    console.log(`Created profile "${profile.name}"`);

    await prisma.settings.create({
        data: { profileId, budgetName: 'Alex & Sam', currency: 'AUD', theme: 'finance' },
    });

    // ---- Accounts (balances derive from transactions; start at 0) ----
    const checking = await prisma.account.create({
        data: { profileId, name: 'Everyday Checking', type: 'checking', onBudget: true },
    });
    const savings = await prisma.account.create({
        data: { profileId, name: 'High-Interest Savings', type: 'savings', onBudget: true },
    });
    const credit = await prisma.account.create({
        data: { profileId, name: 'Rewards Credit Card', type: 'credit', onBudget: true },
    });

    // ---- Category groups & categories ----
    // planned = monthly assignment target (cents). goal is optional.
    const groupDefs = [
        {
            name: 'Immediate Obligations',
            cats: [
                { name: 'Rent', planned: 210000, goalType: 'MF', goalTarget: 210000 },
                { name: 'Groceries', planned: 80000, goalType: 'MF', goalTarget: 80000 },
                { name: 'Electricity', planned: 15000 },
                { name: 'Water', planned: 6000 },
                { name: 'Internet', planned: 8000 },
                { name: 'Mobile Phones', planned: 9000 },
            ],
        },
        {
            name: 'True Expenses',
            cats: [
                { name: 'Car Registration', planned: 15000, goalType: 'NEED', goalTarget: 90000 },
                { name: 'Insurance', planned: 12000 },
                { name: 'Medical', planned: 8000 },
                { name: 'Home Maintenance', planned: 10000 },
            ],
        },
        {
            name: 'Quality of Life',
            cats: [
                { name: 'Dining Out', planned: 40000 },
                { name: 'Entertainment', planned: 15000 },
                { name: 'Hobbies', planned: 12000 },
                { name: 'Fitness', planned: 9000 },
                { name: 'Gifts', planned: 8000 },
            ],
        },
        {
            name: 'Subscriptions',
            cats: [
                { name: 'Streaming', planned: 6000 },
                { name: 'Software', planned: 4000 },
            ],
        },
        {
            name: 'Transport',
            cats: [
                { name: 'Fuel', planned: 24000 },
                { name: 'Public Transport', planned: 8000 },
            ],
        },
        {
            name: 'Savings Goals',
            savings: true,
            cats: [
                { name: 'Emergency Fund', planned: 60000, goalType: 'TB', goalTarget: 1500000 },
                { name: 'Holiday', planned: 40000, goalType: 'TBD', goalTarget: 600000, goalDue: dateISO(2026, 12, 1) },
                { name: 'New Car', planned: 50000, goalType: 'TB', goalTarget: 2500000 },
            ],
        },
    ];

    // Payees that map to a category for realistic transaction generation.
    const spendPayees = {
        Rent: ['Watson Property Group'],
        Groceries: ['Woolworths', 'Coles', 'Aldi', 'Harris Farm'],
        Electricity: ['Origin Energy'],
        Water: ['Sydney Water'],
        Internet: ['Aussie Broadband'],
        'Mobile Phones': ['Telstra'],
        'Car Registration': ['Service NSW'],
        Insurance: ['NRMA Insurance'],
        Medical: ['Priceline Pharmacy', 'City Medical Centre'],
        'Home Maintenance': ['Bunnings Warehouse'],
        'Dining Out': ['Mecca Coffee', 'Thai Rico', 'Grill House', 'Uber Eats', 'The Local Cafe'],
        Entertainment: ['Event Cinemas', 'Ticketek'],
        Hobbies: ['Kmart', 'Gumtree Seller', 'Officeworks'],
        Fitness: ['Anytime Fitness'],
        Gifts: ['Amazon AU', 'Etsy'],
        Streaming: ['Netflix', 'Spotify', 'Disney+'],
        Software: ['Adobe', 'GitHub', 'Google One'],
        Fuel: ['BP', 'Ampol', '7-Eleven'],
        'Public Transport': ['Opal Travel'],
    };

    const catRecords = {}; // name -> {id, planned, savings}
    for (let gi = 0; gi < groupDefs.length; gi++) {
        const g = groupDefs[gi];
        const group = await prisma.categoryGroup.create({
            data: { profileId, name: g.name, sortOrder: gi },
        });
        for (let ci = 0; ci < g.cats.length; ci++) {
            const c = g.cats[ci];
            const cat = await prisma.category.create({
                data: {
                    groupId: group.id,
                    name: c.name,
                    sortOrder: ci,
                    goalType: c.goalType ?? null,
                    goalTarget: c.goalTarget ?? null,
                    goalDueDate: c.goalDue ?? null,
                },
            });
            catRecords[c.name] = { id: cat.id, planned: c.planned, savings: !!g.savings };
        }
    }

    // ---- Generate transactions + envelope math per month ----
    const txns = []; // {date, amount, payee, memo, accountId, categoryId, cleared}
    const running = {}; // categoryName -> cumulative available
    for (const name of Object.keys(catRecords)) running[name] = 0;

    const monthlyBudgetRows = [];
    const perMonthPerCatSpend = {}; // `${m}:${name}` -> spend cents (negative)

    for (const m of MONTHS) {
        const isCurrent = monthKey(m) === CURRENT;
        // Spending days depend on whether the month is complete or in-progress.
        const lastDay = isCurrent ? 18 : 26;

        for (const [name, rec] of Object.entries(catRecords)) {
            if (rec.savings) continue; // savings funded via assignment, not spent
            const payees = spendPayees[name] || ['General Store'];
            const isRent = name === 'Rent';
            const txCount = isRent ? 1 : rec.planned >= 60000 ? 6 : rec.planned >= 15000 ? 3 : 1;
            // Target monthly spend as a ratio of planned (mostly under, occasional small overspend).
            const ratio = isRent ? 1 : 0.82 + rand() * 0.22; // 0.82..1.04
            let remaining = Math.round(rec.planned * ratio);
            let spent = 0;
            const onCredit = ['Groceries', 'Dining Out', 'Fuel', 'Hobbies', 'Gifts', 'Entertainment'].includes(name);
            for (let i = 0; i < txCount; i++) {
                const last = i === txCount - 1;
                let amt = last ? remaining : Math.max(300, Math.round((remaining / (txCount - i)) * (0.8 + rand() * 0.4)));
                if (amt > remaining) amt = remaining;
                if (amt <= 0) break;
                remaining -= amt;
                spent += amt;
                const d = 2 + Math.floor(rand() * (lastDay - 2));
                const payee = payees[Math.floor(rand() * payees.length)];
                txns.push({
                    date: dateISO(YEAR, m, d),
                    amount: -amt,
                    payee,
                    accountId: onCredit ? credit.id : checking.id,
                    categoryId: rec.id,
                    cleared: !isCurrent || d < 12,
                });
            }
            perMonthPerCatSpend[`${m}:${name}`] = -spent;
        }

        // Income: two earners, each paid once per month (Alex on the 1st, Sam on the 15th).
        txns.push({
            date: dateISO(YEAR, m, 1), amount: 360000, payee: 'Acme Corp Payroll',
            accountId: checking.id, categoryId: null, cleared: true, memo: 'Alex — salary',
        });
        txns.push({
            date: dateISO(YEAR, m, 15), amount: 290000, payee: 'Northwind Studio',
            accountId: checking.id, categoryId: null, cleared: true, memo: 'Sam — salary',
        });
    }

    // Envelope assignment simulation (assigned per month per category) -> MonthlyBudget rows.
    for (const m of MONTHS) {
        for (const [name, rec] of Object.entries(catRecords)) {
            const assigned = rec.planned;
            const activity = rec.savings ? 0 : (perMonthPerCatSpend[`${m}:${name}`] || 0);
            running[name] += assigned + activity;
            monthlyBudgetRows.push({
                month: monthKey(m), categoryId: rec.id, assigned, activity, available: running[name],
            });
        }
    }

    // Insert transactions.
    await prisma.transaction.createMany({
        data: txns.map((t) => ({
            date: t.date, amount: t.amount, payee: t.payee, memo: t.memo ?? null,
            accountId: t.accountId, categoryId: t.categoryId, cleared: t.cleared, approved: true,
        })),
    });

    // Recompute account balances from transactions.
    for (const acc of [checking, savings, credit]) {
        const agg = await prisma.transaction.aggregate({
            where: { accountId: acc.id }, _sum: { amount: true },
        });
        const bal = agg._sum.amount || 0;
        await prisma.account.update({
            where: { id: acc.id }, data: { balance: bal, clearedBalance: bal },
        });
    }

    await prisma.monthlyBudget.createMany({ data: monthlyBudgetRows });

    // ---- Force a clean "Ready to Assign" by nudging the current savings assignment ----
    // RTA = onBudgetBalance - (allAssigned + allCategorizedActivity)
    const onBudgetAccounts = await prisma.account.findMany({ where: { profileId, onBudget: true } });
    const totalBalance = onBudgetAccounts.reduce((s, a) => s + a.balance, 0);
    const assignedAgg = await prisma.monthlyBudget.aggregate({ _sum: { assigned: true } });
    const catActivityAgg = await prisma.transaction.aggregate({
        where: { categoryId: { not: null } }, _sum: { amount: true },
    });
    const envelopeTotal = (assignedAgg._sum.assigned || 0) + (catActivityAgg._sum.amount || 0);
    const rta = totalBalance - envelopeTotal;

    // Absorb the surplus into Emergency Fund's current-month assignment so RTA lands on $0.
    if (rta !== 0) {
        const ef = catRecords['Emergency Fund'];
        const efRow = await prisma.monthlyBudget.findFirst({
            where: { categoryId: ef.id, month: CURRENT },
        });
        if (efRow) {
            await prisma.monthlyBudget.update({
                where: { id: efRow.id },
                data: { assigned: efRow.assigned + rta, available: efRow.available + rta },
            });
        }
    }

    // ---- Scheduled transactions (upcoming bills) ----
    await prisma.scheduledTransaction.createMany({
        data: [
            { profileId, name: 'Rent', amount: -210000, payee: 'Watson Property Group', accountId: checking.id, categoryId: catRecords['Rent'].id, frequency: 'monthly', nextDueDate: dateISO(2026, 8, 1), autoCreate: true },
            { profileId, name: 'Netflix', amount: -1899, payee: 'Netflix', accountId: credit.id, categoryId: catRecords['Streaming'].id, frequency: 'monthly', nextDueDate: dateISO(2026, 7, 24) },
            { profileId, name: 'Gym Membership', amount: -3900, payee: 'Anytime Fitness', accountId: checking.id, categoryId: catRecords['Fitness'].id, frequency: 'monthly', nextDueDate: dateISO(2026, 7, 28) },
            { profileId, name: 'Salary — Alex', amount: 360000, payee: 'Acme Corp Payroll', accountId: checking.id, categoryId: null, frequency: 'biweekly', nextDueDate: dateISO(2026, 7, 29) },
        ],
    });

    // ---- Transaction rules ----
    await prisma.transactionRule.createMany({
        data: [
            { profileId, name: 'Groceries', matchField: 'payee', matchType: 'contains', matchValue: 'Woolworths', categoryId: catRecords['Groceries'].id, priority: 10 },
            { profileId, name: 'Fuel', matchField: 'payee', matchType: 'contains', matchValue: 'BP', categoryId: catRecords['Fuel'].id, priority: 5 },
            { profileId, name: 'Streaming', matchField: 'payee', matchType: 'contains', matchValue: 'Netflix', categoryId: catRecords['Streaming'].id, priority: 5 },
        ],
    });

    // ---- Investments ----
    const assets = [
        { symbol: 'VAS.AX', name: 'Vanguard Australian Shares ETF', assetClass: 'etf', currency: 'AUD', quantity: 420, currentPrice: 10450, costBasis: 3780000, dividendYield: 0.041 },
        { symbol: 'VGS.AX', name: 'Vanguard International Shares ETF', assetClass: 'etf', currency: 'AUD', quantity: 260, currentPrice: 12680, costBasis: 2860000, dividendYield: 0.019 },
        { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', currency: 'AUD', quantity: 0.42, currentPrice: 9850000, costBasis: 2650000, stakingYield: 0 },
        { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', currency: 'AUD', quantity: 3.1, currentPrice: 520000, costBasis: 1180000, stakingYield: 0.035 },
        { symbol: 'SUPER', name: 'AustralianSuper — Balanced', assetClass: 'super', currency: 'AUD', quantity: 1, currentPrice: 8650000, costBasis: 7200000, isManual: true },
        { symbol: 'PROP', name: 'Investment Unit — Newcastle', assetClass: 'property', currency: 'AUD', quantity: 1, currentPrice: 52000000, costBasis: 46000000, isManual: true },
    ];
    for (const a of assets) {
        await prisma.asset.create({
            data: {
                profileId, symbol: a.symbol, name: a.name, assetClass: a.assetClass, currency: a.currency,
                quantity: a.quantity, currentPrice: a.currentPrice, costBasis: a.costBasis,
                isManual: a.isManual ?? false, dividendYield: a.dividendYield ?? 0, stakingYield: a.stakingYield ?? 0,
            },
        });
    }

    await prisma.allocationTarget.createMany({
        data: [
            { profileId, assetClass: 'etf', targetPct: 0.4, priority: 3 },
            { profileId, assetClass: 'crypto', targetPct: 0.1, priority: 1 },
            { profileId, assetClass: 'super', targetPct: 0.2, priority: 2 },
            { profileId, assetClass: 'property', targetPct: 0.3, priority: 2 },
        ],
    });

    // ---- FIRE settings ----
    await prisma.fireSettings.create({
        data: {
            profileId, yearOfBirth: 1992, retirementAge: 52, preservationAge: 60,
            annualExpenses: 6000000, withdrawalRate: 0.04, inflationRate: 0.025, expectedReturn: 0.07,
            annualSuperContrib: 1500000, employerContribRate: 0.115,
            fireNumber: 150000000, coastFireNumber: 62000000,
        },
    });

    const txnCount = await prisma.transaction.count();
    console.log(`Seeded ${txnCount} transactions, ${monthlyBudgetRows.length} budget rows, ${assets.length} assets. RTA nudged by ${(rta / 100).toFixed(2)}.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
