# Loot Council — Development Guide

> **Generated:** 2026-03-04 (last verified 2026-11-04) | **Scan Level:** Comprehensive

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20.9+ | Runtime (Next.js 16 minimum; CI uses Node 20) |
| npm | Included with Node | Package manager |
| Git | Any | Version control |

---

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd loot-council

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create the SQLite database from the committed migrations
npx prisma migrate deploy

# Start the app
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

---

## Running the App

Loot Council runs only on the local machine. On Windows, double-click `start-budget.bat`: it opens `http://127.0.0.1:3000` in the browser and runs `npm run dev`. The server binds to `127.0.0.1`, so it is not reachable from other devices on the network.

---

## Environment Setup

Create `.env` in the `loot-council/` directory:

```env
# Required
DATABASE_URL="file:../data/loot-council.db"

# Optional — AI Features
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="gpt-4o-mini"   # chat model for every AI feature; defaults to gpt-4o-mini
```

These are the only environment variables the code reads. Other settings live elsewhere:

- **Home currency:** totals are in AUD (a constant in the investment and FIRE routes; the display currency follows the profile's Settings).
- **Binance credentials:** entered in the app and stored per profile in the `ApiIntegration` table (`/api/integrations`), not in `.env`.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack on `127.0.0.1:3000` (hot reload) |
| `npm run build` | Production build |
| `npm run start` | Start production server on `127.0.0.1` |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm test` | Rebuild the isolated test database from migrations and run Vitest once |
| `npm run test:watch` | Rebuild the test database, then run Vitest in watch mode |
| `npm run test:prepare` | Rebuild the test database only |
| `npx prisma studio` | Open database GUI at localhost:5555 |
| `npx prisma generate` | Regenerate Prisma client after schema changes |
| `npx prisma migrate dev --name <change>` | Create and apply a migration after editing the schema |
| `start-budget.bat` | Windows: open the browser and run `npm run dev` |

---

## Project Structure Quick Reference

```
loot-council/
├── src/app/              # Pages + API routes (App Router)
│   ├── api/              # 47 API route files (26 top-level domains)
│   ├── budget/           # Budget page
│   ├── transactions/     # Transactions page
│   ├── accounts/         # Accounts page
│   ├── reports/          # Reports page (+ _tabs/)
│   ├── investments/      # Investments page
│   ├── fire/             # FIRE calculator
│   ├── assistant/        # AI assistant
│   └── settings/         # Settings page
├── src/components/       # 31 React components
├── src/lib/              # Utilities, hooks, helpers, and tests (29 files)
├── prisma/               # Schema + migrations
├── data/                 # Local SQLite databases (gitignored)
├── scripts/              # Test DB preparation, demo seeding, DB inspection
└── package.json          # Scripts & dependencies
```

---

## Development Conventions

### Code Style
- **TypeScript strict mode** enabled
- **ESLint** with `eslint-config-next` (core web vitals + typescript)
- **No Prettier** configured (use editor defaults)
- **Path alias:** `@/*` maps to `./src/*`
- **Prisma import:** `import prisma from '@/lib/prisma'` (default export of the shared client)

### Component Patterns
- All pages are **client components** (`'use client'`)
- Data fetching via `useState` + `useEffect` + `fetch()`
- No server components used
- Modal pattern: Fixed overlay with `z-50+` and shared `ModalDialog`; use `useModalA11y` directly only when the form owns the dialog container
- Form pattern: Controlled inputs with state, async submit
- `TransactionForm` remembers the last-used account per profile in `localStorage` (key from `getLastTransactionAccountKey()` in `src/lib/transactionFormPreferences.ts`) and falls back to the first account via `resolveTransactionAccountId()`

### Dates
- Stored transaction dates are UTC midnight, and budget month boundaries are UTC.
- For "today" in the UI (form defaults, filenames, filter presets), use `toLocalDateString()` and `toLocalMonthString()` from `src/lib/utils.ts`. Do not use `new Date().toISOString().slice(0, 10)`: that is the UTC date, which in Australia is still yesterday until 10–11am.
- For recurring schedules, use `calculateNextDueDate()` from `src/lib/scheduleDates.ts`.

### API Route Patterns
```typescript
// Standard GET with error handler and profile scoping
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';

export const GET = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('paramName');
    const data = await prisma.model.findMany({ where: { profileId } });
    return NextResponse.json(data);
}, 'Fetch data');

// Standard POST with body
export const POST = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const body = await request.json();
    const result = await prisma.model.create({ data: { ...body, profileId } });
    return NextResponse.json(result);
}, 'Create record');
```

For caller-supplied IDs, use `src/lib/profileOwnership.ts` instead of an unscoped `findUnique`. Single-record helpers such as `findOwnedAccount`, `findOwnedCategory`, and `findOwnedTransaction` verify the active profile; `ownsAllCategories` and `ownsAllCategoryGroups` cover batch references. Cross-profile IDs return `404`.

To match transaction rules, call `findMatchingRule()` from `src/lib/ruleEngine.ts` with the profile's active rules sorted by priority.

### Styling Rules
Use semantic color tokens from CSS variables:
```css
/* Accent */      text-gold, bg-gold, border-gold
/* Backgrounds */ bg-background, bg-background-secondary, bg-background-tertiary
/* Text */        text-foreground, text-neutral
/* Semantic */    text-success, text-danger, text-warning, text-info
```

### Data Conventions
- **Monetary values:** Always stored as integers in **cents** (e.g., `$10.50` → `1050`). Some API routes accept dollars in the request; see [API Contracts](./api-contracts.md#data-conventions)
- **Inflow/Outflow:** Positive = inflow, Negative = outflow
- **Dates:** ISO 8601 format
- **Month keys:** `"YYYY-MM"` string format
- **IDs:** CUID strings (auto-generated by Prisma)
- **Currency:** Default `AUD`, configurable per asset

---

## Database Management

### Schema Changes
```bash
# 1. Edit prisma/schema.prisma
# 2. Create and apply a migration (also regenerates the client)
npx prisma migrate dev --name describe-your-change
```

Every schema change needs a migration. `npm test` builds the test database with `prisma migrate deploy` and then checks it against `schema.prisma`; if the schema has changes with no migration, the run fails and prints the SQL that is missing (ISSUES.md CRIT-6).

If your local `data/loot-council.db` was created with `prisma db push` (it has no `_prisma_migrations` table), back it up and baseline it once before using migrations:

```bash
npx prisma migrate resolve --applied 20260726120000_init
```

### View Data
```bash
npx prisma studio    # Opens web GUI at localhost:5555
```

`python scripts/inspect-db.py [path]` opens a database file read-only (default `data/loot-council.db`) and reports its tables, row counts, `_prisma_migrations` state, and profile backfill status.

### Demo Data
`scripts/seed-demo.mjs` fills a separate database with realistic fake data (used for the README screenshots). Point it at its own file, never the real one:

```bash
DATABASE_URL="file:../data/loot-council-demo.db" node scripts/seed-demo.mjs
```

### Reset Database
- **Via UI:** Settings → Delete All Data (deletes the active profile's data)
- **Via API:** `DELETE /api/reset`
- **Via Prisma:** `npx prisma migrate reset` (drops and recreates the whole database file)

### Important: Prisma Version
Prisma 7 with the `better-sqlite3` driver adapter. The client is created in `src/lib/prisma.ts`; CLI settings live in `prisma.config.ts`. A relative `DATABASE_URL` is resolved against `prisma/` by `src/lib/databaseUrl.ts`, so `file:../data/loot-council.db` means `data/loot-council.db`.

---

## Testing

`npm test` runs `scripts/prepare-test-db.mjs` and then Vitest once. The script:

1. Deletes `data/loot-council-test.db` (and its journal/WAL files).
2. Applies the committed migrations with `prisma migrate deploy`.
3. Runs `prisma migrate diff` against `schema.prisma` and exits with an error if they differ.

`vitest.config.ts` points `DATABASE_URL` at the test database, so the suite never touches `data/loot-council.db`. It disables file parallelism and uses one worker because the integration tests share that SQLite file.

| Test file | Covers |
|-----------|--------|
| `budgetUtils.test.ts` | Month offsets and budget group classification |
| `ruleEngine.test.ts` | `matchesRule` (malformed regexes, nested quantifiers, length limit) and `findMatchingRule` |
| `scheduleDates.test.ts` | `calculateNextDueDate` month-end clamping and DST behaviour |
| `transactionFormPreferences.test.ts` | Last-used account key and account fallback |
| `utils.test.ts` | Local date helpers |
| `profileIsolation.integration.test.ts` | Ownership helpers and cross-profile transaction, schedule, rule, split, and payee behaviour |
| `budgetInvariants.integration.test.ts` | Split-parent category guard, quick-action scoping, template apply, rollover across skipped months |
| `moneyPaths.integration.test.ts` | Transaction creation, transfers, reconciliation, cleared-state toggling |
| `csvImport.integration.test.ts` | CSV format detection, AU dates, debit/credit columns, duplicates, balances, profile scoping |
| `splitActivity.integration.test.ts` | Split transaction budget activity |
| `investments.integration.test.ts` | Investment currency conversion |
| `pass4AuditFixes.integration.test.ts` | Pass 4 audit regressions: investment/allocation profile scoping, auto-assign and quick actions, cleared-balance moves, transfer-leg deletes, splits in reports, FIRE valuation, export/backup round trip |

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `prisma generate`, lint, typecheck, tests, the production build, and `npm audit --omit=dev --audit-level=high` on pushes and pull requests to `main`.

---

## Build & Production

```bash
# Build
npm run build

# Start production server (127.0.0.1 only)
npm run start
```

The day-to-day launcher, `start-budget.bat`, runs the dev server rather than a production build.

### Notes
- SQLite database file (`loot-council.db`) lives in `data/` with the current `DATABASE_URL`
- Server binds to `127.0.0.1:3000` by default

---

## Debugging Tips

1. **Database issues:** Check `data/loot-council.db` exists and `DATABASE_URL` is correct
2. **Prisma errors:** Run `npx prisma generate` after any schema change
3. **Test setup fails with "Schema drift detected":** create the missing migration with `npx prisma migrate dev`
4. **Build errors:** Run `npm run typecheck` or check `npm run build` output
5. **API errors:** Check browser DevTools Network tab for response details; detailed errors are only in the server console
6. **Theme issues:** Inspect `<html>` element for `theme-*` class
