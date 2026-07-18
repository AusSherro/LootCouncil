# Loot Council — Project Overview

> **Generated:** 2026-03-04 (last verified 2026-07-18) | **Scan Level:** Comprehensive | **Mode:** Updated

---

## Executive Summary

**Loot Council** is a local-first personal finance application for zero-based envelope budgeting inspired by YNAB. The default Finance theme is clean and work-focused, with optional personality themes including the original dark Dungeon palette. All data lives on the user's machine via SQLite — privacy first, no cloud dependency.

The application is a full-stack monolith built with **Next.js 16** (App Router), **TypeScript 5**, **Prisma 6** ORM over **SQLite**, and styled with **Tailwind CSS 4**. It provides budgeting, investment portfolio tracking, FIRE (Financial Independence, Retire Early) calculator, AI-powered financial advisement, and comprehensive reporting.

---

## Key Characteristics

| Property | Value |
|----------|-------|
| **Project Name** | Loot Council |
| **Repository Type** | Monolith |
| **Project Type** | Full-stack web application |
| **Architecture** | Next.js App Router (client-rendered pages + API routes) |
| **Data Strategy** | Local-first (SQLite file on disk) |
| **Target Audience** | Individuals and households managing personal finances |
| **Locale Focus** | Australian (AUD default, Australian super/CGT rules) |
| **Multi-Profile** | Yes — independent budgets, accounts, settings per profile |
| **License** | MIT |

---

## Tech Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router + Turbopack) | 16.2.6 |
| Language | TypeScript (strict mode) | 5.x |
| Database | SQLite | Local file |
| ORM | Prisma | 6.19.2 |
| Styling | Tailwind CSS | 4.x |
| Icons | Lucide React | 0.563.0 |
| Charts | Recharts | 3.7.0 |
| AI | OpenAI API | 6.17.0 |
| Stock Data | Yahoo Finance (yahoo-finance2) | 3.13.0 |
| Crypto Data | CoinGecko API | (via fetch) |
| Crypto Sync | Binance API | (via fetch) |
| Spreadsheet | xlsx + jszip | 0.20.3 (SheetJS CDN) / 3.10.1 |
| Drag & Drop | dnd-kit | 6.3.1 |
| Testing | Vitest | 4.x |

---

## Feature Summary

### Core Modules

1. **Budgeting** — Zero-based envelope budgeting with category groups, monthly allocations, goals, rollover, templates, quick actions, auto-assign, budget transfers between categories, budget forecasting ("Can I afford it?")
2. **Transactions** — Full CRUD with splits, transfers, reconciliation, bulk operations, scheduled recurring, auto-categorization rules, server-side filtering, pagination, CSV export, date-range presets, filters persisted per profile
3. **Accounts** — Checking, savings, credit, investment accounts with linked credit card payment tracking
4. **Investments** — Multi-asset portfolio (stocks, ETFs, crypto, property, super) with lots, CGT, dividends, allocation targets, live pricing
5. **FIRE Calculator** — Financial Independence projections with Coast/Barista FIRE, customizable rates
6. **Reports** — 8 tabs (Spending Breakdown, Top Movers, Income vs Expense, Savings Rate, Budget vs Actual, Net Worth, By Payee, Category Trends), chart-segment drill-down to transactions, global per-profile category exclusion filter
7. **AI Assistant** — OpenAI-powered chat advisor, spending insights, budget optimization (with data consent)
8. **Data Management** — YNAB import (ZIP + API), CSV import, JSON backup/restore, payee management
9. **Profiles** — Multiple user profiles with independent data isolation

### UX Features

- 7 color themes (Finance default; Dungeon, Forest, Ocean, Crimson, Royal, and Kawaii optional)
- Mobile responsive with bottom navigation
- Keyboard shortcuts (arrow nav, Ctrl+Z undo, N for new transaction)
- Loading skeletons and error boundaries
- Shared accessible modal behavior with focus trapping, Escape handling, focus restoration, and scroll locking
- Undo/redo system
- AI data consent modal
- Selective client-side caching for slow-changing transaction form metadata

---

## Codebase Statistics

| Metric | Count |
|--------|-------|
| API Route Files | 47 |
| Top-Level API Domains | 26 |
| Page Routes | 9 |
| UI Components | 32 |
| Library/Utility/Test Files | 18 |
| Database Models | 20 |
| Prisma Migrations | 1 (initial) |

---

## Architecture Type

**Monolithic Next.js application** using the App Router pattern:
- **Pages** are client-rendered (`'use client'`) using `useState` + `useEffect` for data fetching
- **API routes** serve as the backend, directly accessing Prisma/SQLite
- **No server components** — all pages fetch data client-side via API routes
- **No external backend** — everything runs in a single Next.js process
- **Local-first** — SQLite database stored at `data/loot-council.db`
- **Multi-profile** — Profile model scopes all data; profile selected via cookie/query param
- **Server bound to 127.0.0.1** — Not accessible from network (security hardening)
