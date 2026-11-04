# Loot Council — API Contracts

> **Generated:** 2026-03-04 (last verified 2026-11-04) | **Scan Level:** Comprehensive

---

## Overview

The API layer consists of **47 route files** across **26 top-level domains**, all implemented as Next.js App Router API routes (`route.ts`). Routes use Prisma ORM to interact with a local SQLite database. Financial data routes resolve the active profile with `getProfileId()` and enforce ownership before reading or mutating IDs.

**Base URL:** `http://127.0.0.1:3000/api` (the server binds to loopback only)

**Common Patterns:**
- `GET` — Fetch data (query params for filtering)
- `POST` — Create records, or run an action selected by an `action` field in the body
- `PUT` — Bulk update, reorder, or "process" operations (varies by route; see tables)
- `PATCH` — Partial updates; the record `id` is usually in the JSON body
- `DELETE` — Remove records; the `id` is usually a query param (`?id=`), except `budget/auto-assign` and `transactions/bulk`, which take a JSON body
- All amounts are stored in **cents** (integers); some routes accept dollars in the request (see [Data Conventions](#data-conventions))
- All responses return JSON (except `GET /api/export`, which returns a JSON file download)
- Errors return `{ error: string }` with a 4xx/5xx status. Some routes use the `withErrorHandler` wrapper (`src/lib/apiHandler.ts`); the rest use an equivalent local `try/catch`
- Profile scoping via `getProfileId()` (`src/lib/profile.ts`)

---

## API Domain Map

Request columns list query params as `?name` and JSON body fields as `{ name }`. Response columns show the top-level keys of a successful response.

### Core Financial

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/accounts` | GET | — | `{ accounts }` (includes off-budget accounts and linked-card info) |
| | POST | `{ name, type, onBudget, balance }` (balance in dollars) | Account (201) |
| | PATCH | `{ id, action?, updates?, reconcileBalance?, reconcileDate?, linkedAccountId? }` — `action` is `reconcile`, `link`, or `reopen`; otherwise `updates` is applied | `{ account }`; reconcile adds `clearedBalance`, `adjustmentNeeded`, `transactionsReconciled` |
| | DELETE | `?id` | `{ success, message }` — closes the account if it has transactions, otherwise deletes it |
| `/api/budget` | GET | `?month` (YYYY-MM, default current local month), `?showHidden` | `{ month, groups, totals: { readyToAssign, assigned, activity, available, accountBalance } }` |
| | POST | `{ categoryId, month, amount }` (assign one category) | MonthlyBudget plus recomputed `activity`, `available` |
| | PUT | — | Recalculates MonthlyBudget activity/available for every category and month: `{ success, message, records, created }` |
| `/api/budget/auto-assign` | GET | `?month` | Preview: `{ readyToAssign, totalNeeded, totalWouldAssign, shortfall, categories }` |
| | POST | `{ month }` | `{ success, assigned, remaining, categories, message }` |
| | DELETE | `{ month, categories }` (JSON body) | Reverses an auto-assign: `{ success, reversed, message }` |
| `/api/budget/copy` | POST | `{ sourceMonth, targetMonth }` | `{ success, copied, message }` (runs in one transaction) |
| `/api/budget/forecast` | GET | `?currentMonth`, `?targetMonth`, `?additionalAmount` (cents), `?additionalDescription`, `?additionalTargetMonth`, `?monthlyIncome` (cents, 0 = auto-detect) | `{ canAfford, projectedBalanceAtTarget, shortfall, lowestBalance, lowestMonth, monthlyProjections, additionalExpense, summary }` |
| `/api/budget/quick-actions` | POST | `{ action, categoryId, month }` — `action` is `lastMonth`, `average`, `underfunded`, or `clear` | `{ success, newAmount }` |
| `/api/budget/transfer` | POST | `{ fromCategoryId, toCategoryId, amount, month }` | `{ success, from, to, transferred }` |
| `/api/categories` | GET | `?showHidden` | `{ categoryGroups }` |
| | POST | `{ type: 'group' \| 'category', name, groupId? }` | `{ group }` or `{ category }` |
| | PATCH | `{ type, id, updates }` (whitelisted fields) | `{ group }` or `{ category }` |
| | DELETE | `?type`, `?id` | `{ success }`; refuses (400) when transactions or split lines still reference the category |
| | PUT | `{ type, items \| orders: [{ id, sortOrder, groupId? }] }` (reorder) | `{ success }` |
| `/api/transactions` | GET | `?accountId`, `?categoryId`, `?cleared`, `?q`, `?startDate`, `?endDate`, `?minAmount`, `?maxAmount`, `?hideReconciliationAdjustments`, `?runningBalance`, `?limit` (1–500, default 100), `?offset` | `{ transactions, total }` |
| | POST | `{ date, amount, accountId, payee?, memo?, categoryId?, cleared?, applyRules? }` — invalid dates are rejected (400) | Transaction (201) |
| | PUT | `?id` plus `{ date, amount, payee, memo, accountId, categoryId, cleared }` | Transaction |
| | DELETE | `?id` | `{ success }` — deleting one leg of a transfer reverses both accounts and removes the Transfer |
| `/api/transactions/[id]` | PATCH | Partial transaction fields | `{ transaction }` |
| | DELETE | — | `{ success }` |
| `/api/transactions/bulk` | POST | `{ transactionIds, updates }` | `{ success, updated, message }` |
| | DELETE | `{ transactionIds }` (JSON body) | `{ success, deleted, message }` |
| `/api/splits` | GET | `?transactionId` | `{ splits }` |
| | POST | `{ transactionId, splits: [{ categoryId, amount, memo? }] }` — split total must equal the transaction amount | `{ success, count }` |
| | DELETE | `?transactionId` (un-split) | `{ success }` |
| `/api/transfers` | GET | `?limit` (default 50) | `{ transfers }` |
| | POST | `{ sourceAccountId, destinationAccountId, amount, date, memo? }` | `{ transfer }` (201) |
| | DELETE | `?id` | `{ success }` |
| `/api/transfers/match` | GET | `?transactionId` or `?findUnmatched=true` | `{ transaction, potentialMatches }` or `{ matches }` |
| | POST | `{ outflowId, inflowId }` | `{ success, transferId }`; 409 if either side is already matched |
| | DELETE | `?transferId` | `{ success }` (unlink) |

### Automation & Rules

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/rules` | GET | — | `{ rules }` |
| | POST | `{ name, matchField, matchType, matchValue, categoryId?, payeeRename?, memoTemplate?, priority? }`, or `{ action: 'apply', payee, memo, amount }` to test rules against a transaction | `{ rule }`, or the apply result |
| | PATCH | `{ id, ...fields, isActive? }` | `{ rule }` |
| | DELETE | `?id` | `{ success }` |
| `/api/templates` | GET | — | `{ templates }` |
| | POST | `{ name, description?, items }`; `{ action: 'saveFromMonth', name, description?, month }`; or `{ action: 'apply', templateId, month }` | `{ template }`, or `{ success, applied }` for apply |
| | PATCH | `{ id, name?, description?, items? }` | `{ template }` |
| | DELETE | `?id` | `{ success }` |
| `/api/scheduled` | GET | `?upcomingDays` (default 30) | `{ scheduled, upcoming }` |
| | POST | `{ name, amount, payee?, memo?, accountId, categoryId?, frequency, nextDueDate, dayOfMonth?, dayOfWeek?, ... }` | `{ scheduled }` |
| | PUT | — | Creates transactions for every due schedule with `autoCreate` and advances `nextDueDate` (via `calculateNextDueDate` in `src/lib/scheduleDates.ts`): `{ processed }` |
| | PATCH | `{ id, ...fields }` | `{ scheduled }` |
| | DELETE | `?id` | `{ success }` |
| `/api/reconcile` | GET | `?accountId` | `{ account, unreconciledCleared, ... }` |
| | POST | `{ accountId, action: 'reconcile', transactionIds }` or `{ accountId, action: 'complete', statementBalance }` | `{ success, reconciled }` or `{ success, adjustment }` |
| | PATCH | `{ transactionId, cleared }` | `{ transaction }` |

### Investment & FIRE

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/investments` | GET | — | `{ assets, summary, allocations, rates }` — summary totals are in AUD |
| | POST | `{ symbol, name, assetClass, currency, isManual, currentPrice, dividendYield, stakingYield }` | Asset |
| `/api/investments/[id]` | GET | — | Asset |
| | PATCH | Asset fields | Asset |
| | DELETE | — | `{ success }` |
| `/api/investments/lots` | GET | `?assetId` | Lots with CGT calculations |
| | POST | `{ assetId, purchaseDate, units, unitPrice, brokerage? }` | Lot |
| `/api/investments/prices` | GET | `?symbol`, `?type` (`stock` default, or `crypto`) | `{ symbol, name, price, currency, ... }` |
| | POST | — | Refreshes prices for all non-manual assets (Yahoo Finance / CoinGecko): `{ message, updated }` |
| `/api/investments/allocations` | GET | — | `{ allocations, totalValue, investNext, investNextAmount }` (values converted to AUD) |
| | POST | `{ targets: [{ assetClass, targetPct, priority? }] }` | `{ success }` |
| `/api/fire` | GET | — | `{ settings, calculations }` |
| | POST | Whitelisted FireSettings fields | FireSettings |
| `/api/assets` | GET | — | `{ assets }` |
| | POST | Asset fields (`quantity`, `costBasis` and `currentPrice` in dollars, `isManual`, ...) | Asset (201); if a matching asset exists it is updated (quantity and cost basis added) and returned |
| | PUT | — | Refreshes tracked asset prices: `{ message, updated, total, manualSkipped, errors? }` |
| | PATCH | `?id` plus `{ currentPrice }` | Asset |
| | DELETE | `?id` | `{ success }` |
| `/api/binance` | GET | — | Wallet balances from the stored Binance integration |
| | POST | — | Syncs balances into Asset rows: `{ success, created, updated, total }` |
| `/api/networth` | GET | `?months` (default 12), `?excludeAccounts`, `?excludeAssets`, `?excludeAssetClass` | `{ history, currentNetWorth, accountBalance, assetValue, availableAccounts, availableAssets }` |
| `/api/quote` | GET | `?symbol` | Live market quote from Yahoo Finance: `{ symbol, name, shortName, price, previousClose, change, changePercent, currency, exchangeName, assetClass, ... }` |
| | POST | `{ symbols }` | Quotes for several symbols |

### AI Features

All AI routes return a helpful message instead of failing when `OPENAI_API_KEY` is unset. The model comes from `OPENAI_MODEL` (default `gpt-4o-mini`).

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/ai/chat` | POST | `{ message }` | `{ response, context }` |
| `/api/ai/insights` | GET | — | `{ insights, summary }` |
| `/api/ai/optimize` | GET | `?savingsGoal` (decimal, default 0.2), `?priorities` (comma-separated) | `{ recommendations, summary }` |
| | POST | `{ recommendations: [{ categoryName, suggestedAmount }] }` | Applies them to the budget: `{ message, updated }` |

### Data Management

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/import/ynab` | POST | multipart: `file` (YNAB ZIP export) | `{ success, transactions, categories, accounts }` |
| `/api/import/ynab-api` | GET | `?token` | `{ budgets: [{ id, name, lastModified }] }` |
| | POST | `{ token, budgetId }` | `{ success, accounts, categories, payees, transactions, toBeBudgeted, debug }` |
| `/api/import/ynab-api/sync` | GET | — | `{ hasSynced, lastSync, budgetId, serverKnowledge }` |
| | POST | `{ token }` | Delta sync: `{ success, serverKnowledge, stats }` |
| `/api/import/csv` | GET | — | `{ supportedFormats }` |
| | POST | multipart: `file`, `accountId`, `action` (`preview` or `import`) | Preview rows, or `{ success, imported, skipped, duplicates, total }` |
| `/api/import/backup` | POST | Backup JSON from `/api/export` | `{ success, message, stats, restoredFrom }` — replaces the active profile's data with the backup, in one transaction |
| `/api/export` | GET | — | File download `loot-council-backup-YYYY-MM-DD.json` with all profile data (integration metadata only, no credentials) |
| `/api/reset` | DELETE | — | `{ success }` — deletes all data for the active profile |
| `/api/reset/budget` | DELETE | — | `{ success }` — resets budget data for the active profile |

### Auxiliary

| Route | Method | Request | Response |
|-------|--------|---------|----------|
| `/api/payees` | GET | `?q`, `?limit` (default 10) | `{ payees }` |
| | POST | `{ name }` | `{ payee }` (201 when created) |
| | DELETE | `?id` | `{ success }` |
| `/api/payees/manage` | GET | — | `{ payees }` |
| | POST | `{ action: 'merge', fromPayee, toPayee }` or `{ action: 'rename', fromPayee, newName }` | Result of the merge/rename |
| `/api/payees/similar` | POST | `{ payees }` (array of names) | `{ groups }` of likely duplicates |
| `/api/profiles` | GET | — | `{ profiles }` |
| | POST | `{ name }` | Profile (201) |
| | PATCH | `{ id, name }` | Profile |
| | DELETE | `?id` | `{ success }`; refuses to delete the last profile |
| `/api/reports/advanced` | GET | `?type` (`income-expense` default, `spending-by-payee`, `category-trends`, `budget-vs-actual`, `net-worth-trend`, `top-movers`), `?startDate`, `?endDate`, `?months` (default 12), `?excludeCategories`, `?categoryId`, `?month`, `?compareWith` (`last-month` or `last-year`) | `{ report, data, ... }` |
| `/api/settings` | GET | — | Settings for the active profile |
| | PUT | Settings fields | Settings |
| `/api/integrations` | GET | — | `{ integrations }` with keys masked (`••••` + last 4) |
| | POST | `{ provider, apiKey, apiSecret, enabled }` | `{ success, integration: { id, provider, enabled } }` |
| | DELETE | `?provider` | `{ success }` |
| `/api/age-of-money` | GET | — | `{ ageOfMoney, status, message, trend, analyzedTransactions }` |

---

## Profile Scoping and Ownership

Financial routes must treat the active profile as a data boundary:

1. Resolve it with `getProfileId(request)` from `src/lib/profile.ts` (order: `?profileId` query param, then the `loot-council-profile` cookie, then the oldest profile).
2. Include the profile in list and create queries. Some records are scoped indirectly through an owned account or category group.
3. Before operations on caller-supplied IDs, use the helpers in `src/lib/profileOwnership.ts` (`findOwnedAccount`, `findOwnedCategory`, `findOwnedCategoryGroup`, `findOwnedTransaction`, `findOwnedPayee`, `findOwnedRule`, `findOwnedScheduledTransaction`, `findOwnedTemplate`).
4. Use `ownsAllCategories` or `ownsAllCategoryGroups` for batch references.
5. Return `404` for an ID owned by another profile so the API does not reveal that record's existence.

Payee names use the composite unique key `[profileId, name]`, allowing separate profiles to use the same merchant name. YNAB IDs are unique per profile (`[profileId, ynabId]`), so the same YNAB budget can be imported into more than one profile.

### Transaction Rule Safety

`src/lib/ruleEngine.ts` exports two functions:

- `matchesRule(value, matchType, matchValue)` — case-insensitive `equals`, `contains`, `startsWith`, `endsWith`, or `regex`. Regex patterns are limited to 200 characters, nested quantifiers are rejected, and malformed patterns return `false`.
- `findMatchingRule(rules, { payee, memo, amount })` — returns the first rule (pass them sorted by priority, highest first) whose `matchField` matches. `amount` is in dollars.

Both `/api/transactions` (when `applyRules` is set) and `/api/rules` (`action: 'apply'`) use `findMatchingRule`. Do not construct regular expressions from rule input directly.

### Split Transactions

A split parent keeps `categoryId = null`; its category assignments live in `SubTransaction` rows. Transaction create, update, and bulk routes refuse to give a split parent a category. Budget activity, reports, and category deletion checks all include split lines.

---

## Authentication

**None.** All API routes are open. The app is meant to run on the user's own machine: `npm run dev` and `npm run start` bind to `127.0.0.1`, so other devices on the network cannot reach the API. See ISSUES.md SEC-1.

---

## Error Handling Pattern

```typescript
// Centralized error handler wrapper (src/lib/apiHandler.ts)
import { withErrorHandler } from '@/lib/apiHandler';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const data = await prisma.model.findMany({ ... });
  return NextResponse.json(data);
}, 'Fetch data');
// On an uncaught error: logs "[API] Fetch data: ..." and returns
// { error: 'Failed to fetch data' } with status 500.
```

Errors are logged server-side only; generic messages are returned to the client.

---

## Data Conventions

- **Monetary values:** Stored and returned as integers in cents (e.g., `$10.50` → `1050`). Request units are not uniform, so check the route before sending:
  - **Dollars** (the route multiplies by 100): transaction `amount` on `POST`/`PUT /api/transactions` and `PATCH /api/transactions/[id]`, the `minAmount`/`maxAmount` filters, `POST /api/budget` `amount`, `POST /api/budget/transfer` `amount`, `POST /api/transfers` `amount`, scheduled transaction `amount`, account opening `balance`, `/api/assets` prices and cost basis, and the rule-test `amount`
  - **Cents:** split line amounts (must be integers), `/api/budget/forecast` amounts, `/api/investments` and `/api/investments/lots` prices
- **Dates:** ISO 8601 strings. Stored dates are UTC midnight; budget month boundaries are UTC. Client "today" defaults use the local-date helpers in `src/lib/utils.ts`
- **Months:** `YYYY-MM` strings
- **IDs:** CUID strings (generated by Prisma)
- **Currency:** Totals in AUD; assets can be priced in their own currency and are converted with cached exchange rates
- **Inflow/Outflow:** Positive = inflow, Negative = outflow
