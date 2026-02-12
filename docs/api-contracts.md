# Loot Council — API Contracts

> **Generated:** 2026-02-12 | **Scan Level:** Quick (pattern-based, endpoints inferred from file structure)

---

## Overview

The API layer consists of **46 route files** across **26 domains**, all implemented as Next.js App Router API routes (`route.ts`). All routes use Prisma ORM to interact with a local SQLite database.

**Base URL:** `http://localhost:3000/api`

**Common Patterns:**
- `GET` — Fetch data (query params for filtering)
- `POST` — Create records
- `PUT` — Update/replace records
- `PATCH` — Partial updates
- `DELETE` — Remove records
- All amounts stored in **cents** (integers)
- All responses return JSON

---

## API Domain Map

### Core Financial

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/accounts` | GET, POST, PATCH, DELETE | Account CRUD (checking, savings, credit, investment) |
| `/api/budget` | GET, PUT | Monthly budget data and assignment updates |
| `/api/budget/auto-assign` | POST | Auto-fund categories with goals |
| `/api/budget/copy` | POST | Copy budget from one month to another |
| `/api/budget/quick-actions` | POST | Quick budget actions (last month, average, underfunded) |
| `/api/categories` | GET, POST, PATCH, DELETE | Category and category group management |
| `/api/transactions` | GET, POST | Transaction list (with filtering) and creation |
| `/api/transactions/[id]` | PATCH, DELETE | Individual transaction update/delete |
| `/api/transactions/bulk` | POST, DELETE | Bulk edit/delete operations |
| `/api/splits` | GET, POST, PUT | Split transaction management |
| `/api/transfers` | GET, POST | Transfer CRUD |
| `/api/transfers/match` | POST | Transfer matching between accounts |

### Automation & Rules

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/rules` | GET, POST, PATCH, DELETE | Transaction auto-categorization rules |
| `/api/templates` | GET, POST, PUT, DELETE | Budget template management |
| `/api/scheduled` | GET, POST, PATCH, DELETE | Scheduled/recurring transactions |
| `/api/reconcile` | POST | Account reconciliation |

### Investment & FIRE

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/investments` | GET, POST | Holdings CRUD with AUD conversion |
| `/api/investments/[id]` | PATCH, DELETE | Individual asset operations |
| `/api/investments/lots` | GET, POST, PATCH, DELETE | Purchase lot management (CGT tracking) |
| `/api/investments/prices` | GET | Symbol lookup (Yahoo Finance / CoinGecko) |
| `/api/investments/allocations` | GET, PUT | Target vs current portfolio allocation |
| `/api/fire` | GET, PUT | FIRE calculator settings |
| `/api/assets` | PATCH | Asset value updates |
| `/api/binance` | GET, POST | Binance wallet sync |
| `/api/exchange` | GET | Currency exchange rates (1hr cached) |
| `/api/networth` | GET | Net worth history |

### AI Features

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/ai/chat` | POST | Financial advisor chat (OpenAI) |
| `/api/ai/categorize` | POST | Auto-categorize transactions |
| `/api/ai/insights` | POST | Spending insights generation |
| `/api/ai/optimize` | POST | Budget optimization suggestions |

### Data Management

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/import/ynab` | POST | YNAB ZIP file import |
| `/api/import/ynab-api` | POST | YNAB API initial import |
| `/api/import/ynab-api/sync` | POST | YNAB API delta sync |
| `/api/import/csv` | POST | CSV transaction import |
| `/api/import/backup` | POST | Restore from JSON backup |
| `/api/export` | GET | Full JSON data export |
| `/api/reset` | DELETE | Delete all data |
| `/api/reset/budget` | DELETE | Reset budget data only |

### Auxiliary

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/payees` | GET | Payee list |
| `/api/payees/manage` | POST, PATCH, DELETE | Payee merge, rename, delete |
| `/api/payees/similar` | GET | Find similar/duplicate payees |
| `/api/reports/advanced` | GET | Advanced reports (5 types) |
| `/api/settings` | GET, PATCH | App settings (theme, currency, etc.) |
| `/api/integrations` | GET, POST, PATCH, DELETE | API key management |
| `/api/age-of-money` | GET | Age of Money calculation |
| `/api/quote` | GET | Random financial quote |

---

## Authentication

**None.** All API routes are open. The application is designed for local-first use (localhost only). See ISSUES.md SEC-1 for details on this known limitation.

---

## Error Handling Pattern

```typescript
// Standard error response pattern used across routes
try {
  // ... operation
  return NextResponse.json({ data });
} catch (error) {
  return NextResponse.json(
    { error: 'Operation failed', details: error.message },
    { status: 500 }
  );
}
```

> **Note:** Error details are currently leaked to the client (ISSUES.md SEC-4). No centralized error middleware exists (ISSUES.md FEAT-7).

---

## Data Conventions

- **Monetary values:** Stored as integers in cents (e.g., `$10.50` → `1050`)
- **Dates:** ISO 8601 format
- **IDs:** CUID strings (generated by Prisma)
- **Currency:** Default `AUD`, configurable per asset
- **Inflow/Outflow:** Positive = inflow, Negative = outflow
