# Loot Council — Data Models

> **Generated:** 2026-03-04 | **Scan Level:** Comprehensive

---

## Overview

The database uses **SQLite** (local file: `prisma/loot-council.db`) managed through **Prisma 6** ORM. The schema defines **18 models** organized into 8 functional domains.

**Key conventions:**
- All monetary values stored as **integers in cents** (avoids floating-point errors)
- IDs use **CUID** strings (Prisma default)
- Timestamps use `DateTime` with `@default(now())` and `@updatedAt`
- YNAB import compatibility via optional `ynabId` fields
- **Multi-profile:** Most models have an optional `profileId` FK to scope data per profile

---

## Entity Relationship Diagram (Conceptual)

```
┌─────────────────┐
│    Profile       │────┐ (scopes all data per user/profile)
└─────────────────┘    │
                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│   Settings      │     │  CategoryGroup   │────▶│    Category     │
│   (singleton)   │     │  (guilds)        │ 1:N │  (quests)       │
└─────────────────┘     └──────────────────┘     └───────┬────────┘
                                                         │ 1:N
┌─────────────────┐     ┌──────────────────┐     ┌───────▼────────┐
│    Account      │────▶│   Transaction    │◀───▶│ MonthlyBudget  │
│  (gold pouches) │ 1:N │  (the ledger)    │     │ (allocations)  │
└─────────────────┘     └───────┬──────────┘     └────────────────┘
                                │ 1:N
                        ┌───────▼──────────┐
                        │ SubTransaction   │
                        │ (split entries)  │
                        └──────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│     Asset       │────▶│    AssetLot      │     │AllocationTarget│
│  (investments)  │ 1:N │  (purchase lots) │     │ (portfolio %)  │
└─────────────────┘     └──────────────────┘     └────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ FireSettings    │     │  ExchangeRate    │     │ ApiIntegration │
│  (FIRE calc)    │     │  (FX rates)      │     │ (API keys)     │
└─────────────────┘     └──────────────────┘     └────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│     Payee       │     │    Transfer      │     │ ScheduledTxn   │
│  (merchants)    │     │  (linked moves)  │     │ (recurring)    │
└─────────────────┘     └──────────────────┘     └────────────────┘

┌─────────────────┐     ┌──────────────────┐
│TransactionRule  │     │ BudgetTemplate   │────▶ BudgetTemplateItem
│ (auto-categorize)│    │ (saved configs)  │ 1:N
└─────────────────┘     └──────────────────┘
```

---

## Domain 0: Profiles

### Profile
User profile for data isolation. All major models reference a profile.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Profile display name |
| createdAt | DateTime | Auto-set |
| updatedAt | DateTime | Auto-updated |

**Relations:** Has many Account, CategoryGroup, Payee, Transfer, Asset, AllocationTarget, FireSettings, ScheduledTransaction, TransactionRule, BudgetTemplate, Settings, ApiIntegration.

---

## Domain 1: Core Budgeting

### Account
Represents a financial account (checking, savings, credit card, investment).

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Account name |
| type | String | `checking`, `savings`, `credit`, `investment` |
| onBudget | Boolean | Whether included in budget calculations |
| balance | Int | Current balance in cents |
| clearedBalance | Int | Cleared transactions balance in cents |
| closed | Boolean | Whether account is closed |
| lastReconciled | DateTime? | Last reconciliation date |
| linkedAccountId | String? | For credit cards: payment source account |
| ynabId | String? | YNAB import ID (unique) |
| profileId | String? | FK to Profile |

**Relations:** Has many `Transaction`. Belongs to `Profile`. Self-referential for credit card linking.

### CategoryGroup
Groups related budget categories together (e.g., "Bills", "Fun Money").

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Group name |
| sortOrder | Int | Display ordering |
| isHidden | Boolean | Whether hidden from view |
| ynabId | String? | YNAB import ID |

**Relations:** Has many `Category`.

### Category
Individual budget category within a group (e.g., "Rent", "Groceries").

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Category name |
| groupId | String | FK to CategoryGroup |
| goalType | String? | `TB`, `TBD`, `MF`, `NEED`, `DEBT` |
| goalTarget | Int? | Target amount in cents |
| goalDueDate | DateTime? | Goal deadline |
| sortOrder | Int | Display ordering |
| isHidden | Boolean | Whether hidden |
| rolloverType | String | `available`, `none`, `cap` |
| rolloverCap | Int? | Max rollover if type=cap |
| goalPercentageComplete | Int? | 0-100 progress |
| goalUnderFunded | Int? | Amount still needed (cents) |
| goalOverallFunded | Int? | Total funded toward goal |
| goalOverallLeft | Int? | Remaining for goal |
| goalCadence | Int? | Frequency type |
| goalCadenceFrequency | Int? | Every N periods |
| goalDay | Int? | Day of month |

**Relations:** Belongs to `CategoryGroup`. Has many `Transaction`, `SubTransaction`, `MonthlyBudget`.

### MonthlyBudget
Monthly allocation for a category.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| month | String | Format: `"YYYY-MM"` |
| categoryId | String | FK to Category |
| assigned | Int | Money assigned this month (cents) |
| activity | Int | Spending this month (cents) |
| available | Int | Rollover + Assigned - Activity (cents) |

**Unique:** `[month, categoryId]`

---

## Domain 2: Transactions

### Transaction
Individual financial transaction.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| date | DateTime | Transaction date |
| amount | Int | Positive=inflow, Negative=outflow (cents) |
| payee | String? | Merchant/payee name |
| memo | String? | Notes |
| accountId | String | FK to Account |
| categoryId | String? | FK to Category |
| cleared | Boolean | Whether cleared by bank |
| approved | Boolean | Whether user-approved |
| isReconciled | Boolean | Whether reconciled |
| isSplit | Boolean | Has subtransactions |
| transferId | String? | Links transfer pairs |
| ynabId | String? | YNAB import ID |

**Relations:** Belongs to `Account`, `Category`. Has many `SubTransaction`.

### SubTransaction
Split transaction line item.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| transactionId | String | FK to Transaction |
| categoryId | String? | FK to Category |
| amount | Int | Split amount (cents) |
| memo | String? | Split memo |

### Payee
Merchant/payee entity.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Unique payee name |
| ynabId | String? | YNAB import ID |
| transferAccountId | String? | For transfer payees |

### Transfer
Linked account-to-account money movement.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| amount | Int | Transfer amount (cents, positive) |
| date | DateTime | Transfer date |
| sourceAccountId | String | From account |
| destinationAccountId | String | To account |
| sourceTransactionId | String? | Outflow transaction |
| destTransactionId | String? | Inflow transaction |

---

## Domain 3: Automation

### TransactionRule
Auto-categorization rule for incoming transactions.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Rule display name |
| matchField | String | `payee`, `memo`, `amount` |
| matchType | String | `contains`, `equals`, `startsWith`, `endsWith`, `regex` |
| matchValue | String | Pattern to match |
| categoryId | String? | Auto-assign category |
| payeeRename | String? | Optional payee rename |
| memoTemplate | String? | Optional memo template |
| priority | Int | Higher = checked first |
| isActive | Boolean | Whether rule is active |

### ScheduledTransaction
Recurring bill or income.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| name | String | Description |
| amount | Int | Amount in cents |
| frequency | String | `daily`, `weekly`, `biweekly`, `monthly`, `yearly` |
| nextDueDate | DateTime | Next occurrence |
| autoCreate | Boolean | Auto-create when due |
| reminderDays | Int | Days before to remind |

### BudgetTemplate / BudgetTemplateItem
Saved budget configurations for quick application.

---

## Domain 4: Investments

### Asset
Investment holding (stocks, ETFs, crypto, property, superannuation).

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| symbol | String | Ticker (AAPL, BTC, etc.) |
| name | String | Full name |
| assetClass | String | `stock`, `etf`, `crypto`, `property`, `super`, `cash`, `other` |
| currency | String | Native currency (default AUD) |
| quantity | Float | Units held |
| costBasis | Int | Total cost (cents) |
| currentPrice | Int | Price per unit (cents) |
| isManual | Boolean | Manual (no auto-pricing) |
| annualDividend | Int | Estimated annual dividend (cents) |
| dividendYield | Float | As decimal (0.04 = 4%) |
| stakingYield | Float | Crypto staking yield |

**Relations:** Has many `AssetLot`.

### AssetLot
Individual purchase lot for capital gains tracking.

| Field | Type | Notes |
|-------|------|-------|
| id | String (CUID) | Primary key |
| assetId | String | FK to Asset |
| purchaseDate | DateTime | Buy date |
| units | Float | Units purchased |
| unitPrice | Int | Buy price per unit (cents) |
| totalCost | Int | Total cost incl. fees (cents) |
| brokerage | Int | Fees (cents) |
| soldUnits | Float | Units sold from this lot |
| capitalGain | Int? | Realized gain (cents) |
| cgtDiscount | Boolean | Held >12 months (50% AUS CGT discount) |

### AllocationTarget
Portfolio rebalancing target.

| Field | Type | Notes |
|-------|------|-------|
| assetClass | String | Unique asset class |
| targetPct | Float | Target as decimal (0.30 = 30%) |
| priority | Int | Rebalancing priority |

---

## Domain 5: FIRE & Settings

### FireSettings
Financial Independence calculator configuration (singleton).

Key fields: `yearOfBirth`, `retirementAge`, `preservationAge`, `annualExpenses`, `withdrawalRate` (default 4%), `inflationRate` (default 2.5%), `expectedReturn` (default 7%), `employerContribRate` (default 11.5% — Australian super).

### Settings
Application settings (singleton, id="default").

Key fields: `budgetName`, `currency` (AUD), `dateFormat` (DD/MM/YYYY), `theme` (dungeon), `toBeBudgeted` (Ready to Assign), `ynabBudgetId`, `ynabServerKnowledge` (delta sync cursor).

### ExchangeRate
Cached currency conversion rates.

| Field | Type | Notes |
|-------|------|-------|
| fromCurrency | String | Source currency |
| toCurrency | String | Target currency |
| rate | Float | Conversion rate |
| **Unique** | | `[fromCurrency, toCurrency]` |

### ApiIntegration
Stored API credentials (Binance, etc.).

---

## Migration History

| Migration | Date | Description |
|-----------|------|-------------|
| `20260202034301_init` | 2026-02-02 | Initial schema (all 18 models including Profile) |
