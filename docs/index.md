# Loot Council — Documentation Index

> **Generated:** 2026-02-12 | **Mode:** Initial Scan | **Scan Level:** Quick

---

## Project Overview

- **Type:** Monolith — Full-stack web application
- **Primary Language:** TypeScript 5 (strict mode)
- **Framework:** Next.js 16 (App Router + Turbopack)
- **Database:** SQLite (local file) via Prisma 6
- **Architecture:** Local-first, monolithic, client-rendered pages + API routes

### Quick Reference

- **Tech Stack:** Next.js 16-1 · TypeScript 5 · SQLite · Prisma 6 · Tailwind CSS 4 · Recharts · Lucide React · OpenAI
- **Entry Point:** `src/app/layout.tsx` (root layout) → `src/app/page.tsx` (dashboard)
- **API Gateway:** `src/app/api/*/route.ts` (46 route files, 26 domains)
- **Database:** `prisma/schema.prisma` (17 models) → `prisma/loot-council.db`
- **Architecture Pattern:** Client-side rendered React pages fetching from co-located API routes over SQLite

---

## Generated Documentation

- [Project Overview](./project-overview.md) — Executive summary, tech stack, feature list, codebase stats
- [Architecture](./architecture.md) — Architecture pattern, technology choices, data flow, security
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory structure with all critical paths
- [Component Inventory](./component-inventory.md) — 26 UI components cataloged by category
- [API Contracts](./api-contracts.md) — 46 API endpoints across 26 domains
- [Data Models](./data-models.md) — 17 Prisma models with field definitions and relationships
- [Development Guide](./development-guide.md) — Setup, commands, conventions, debugging

---

## Existing Project Documentation

- [README.md](../loot-council/README.md) — Project overview, features, getting started, keyboard shortcuts
- [ai_context.md](../loot-council/ai_context.md) — Comprehensive AI developer context (tech stack, patterns, feature status)
- [ISSUES.md](../loot-council/ISSUES.md) — Issue tracker (critical, security, performance, code quality, features)
- [schema.prisma](../loot-council/prisma/schema.prisma) — Full database schema

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
2. **AI Context** — `loot-council/ai_context.md` (detailed patterns and conventions)
3. **Relevant domain docs** — Architecture, API, Data Models as needed
4. **Issue tracker** — `loot-council/ISSUES.md` for known issues and planned features

---

## Scan Metadata

| Property | Value |
|----------|-------|
| Scan Date | 2026-02-12 |
| Scan Level | Quick (pattern-based, no source file reading) |
| Mode | Initial Scan |
| Documents Generated | 7 |
| State File | [project-scan-report.json](./project-scan-report.json) |
