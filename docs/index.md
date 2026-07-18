# Loot Council — Documentation Index

> **Generated:** 2026-03-04 (last verified 2026-07-18) | **Mode:** Updated | **Scan Level:** Comprehensive

---

## Project Overview

- **Type:** Monolith — Full-stack web application
- **Primary Language:** TypeScript 5 (strict mode)
- **Framework:** Next.js 16 (App Router + Turbopack)
- **Database:** SQLite (local file) via Prisma 6
- **Architecture:** Local-first, monolithic, client-rendered pages + API routes

### Quick Reference

- **Tech Stack:** Next.js 16.2.6 · TypeScript 5 · SQLite · Prisma 6 · Tailwind CSS 4 · Recharts · Lucide React · OpenAI
- **Entry Point:** `src/app/layout.tsx` (root layout) → `src/app/page.tsx` (dashboard)
- **API Gateway:** `src/app/api/*/route.ts` (47 route files, 26 top-level domains)
- **Database:** `prisma/schema.prisma` (20 models) → `data/loot-council.db`
- **Architecture Pattern:** Client-side rendered React pages fetching from co-located API routes over SQLite
- **Multi-Profile:** Each profile has independent budgets, accounts, transactions, and settings
- **Reports:** 8 tab components under `src/app/reports/_tabs/` (Spending Breakdown, Top Movers, Income/Expense, Savings Rate, Budget vs Actual, Net Worth, By Payee, Category Trends)

---

## Generated Documentation

- [Project Overview](./project-overview.md) — Executive summary, tech stack, feature list, codebase stats
- [Architecture](./architecture.md) — Architecture pattern, technology choices, data flow, security
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory structure with all critical paths
- [Component Inventory](./component-inventory.md) — 32 UI components cataloged by category
- [API Contracts](./api-contracts.md) — 47 route files across 26 top-level domains
- [Data Models](./data-models.md) — 20 Prisma models with field definitions and relationships
- [Development Guide](./development-guide.md) — Setup, commands, conventions, debugging

---

## Existing Project Documentation

- [README.md](../README.md) — Project overview, features, getting started, keyboard shortcuts
- [ai_context.md](../ai_context.md) — Comprehensive AI developer context (tech stack, patterns, feature status)
- [ISSUES.md](../ISSUES.md) — Issue tracker (critical, security, performance, code quality, features)
- [schema.prisma](../prisma/schema.prisma) — Full database schema

---

## Getting Started

### For New Developers

1. Read [Project Overview](./project-overview.md) for the big picture
2. Follow [Development Guide](./development-guide.md) for setup
3. Explore [Source Tree Analysis](./source-tree-analysis.md) to understand the codebase layout
4. Review [Architecture](./architecture.md) for technical decisions

### For Feature Development

1. Check [API Contracts](./api-contracts.md) for existing endpoints
2. Review [Data Models](./data-models.md) for database schema
3. See [Component Inventory](./component-inventory.md) for reusable UI parts
4. Consult [ai_context.md](../loot-council/ai_context.md) for coding patterns and conventions

### For AI-Assisted Development

When working with AI coding assistants, provide these files as context:
1. **This index** — `docs/index.md` (navigation and overview)
2. **AI Context** — `ai_context.md` (detailed patterns and conventions)
3. **Relevant domain docs** — Architecture, API, Data Models as needed
4. **Issue tracker** — `ISSUES.md` for known issues and planned features

---

## Scan Metadata

| Property | Value |
|----------|-------|
| Scan Date | 2026-03-04 |
| Last Verification | 2026-07-18 |
| Scan Level | Comprehensive |
| Mode | Updated |
| Documents Generated | 7 |
