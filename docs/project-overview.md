# Loot Council — Project Overview

> **Generated:** 2026-03-04 | **Scan Level:** Comprehensive | **Mode:** Updated

---

## Executive Summary

**Loot Council** is a local-first personal finance application that combines serious zero-based envelope budgeting (inspired by YNAB) with a fantasy RPG aesthetic ("Dungeons & Dragons meets High Finance"). All data lives on the user's machine via SQLite — privacy first, no cloud dependency.

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
| **Target Audience** | Individual users managing personal finances |
| **Locale Focus** | Australian (AUD default, Australian super/CGT rules) |
| **Multi-Profile** | Yes — independent budgets, accounts, settings per profile |
| **License** | MIT |

---

## Tech Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js (App Router + Turbopack) | 16.1.6 |
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
| Spreadsheet | xlsx + jszip | 0.18.5 / 3.10.1 |
| Drag & Drop | dnd-kit | 6.3.1 |

---

## Feature Summary

### Core Modules

1. **Budgeting** — Zero-based envelope budgeting with category groups, monthly allocations, goals, rollover, templates, quick actions, auto-assign, budget transfers between categories
2. **Transactions** — Full CRUD with splits, transfers, reconciliation, bulk operations, scheduled recurring, auto-categorization rules, server-side filtering
3. **Accounts** — Checking, savings, credit, investment accounts with linked credit card payment tracking
4. **Investments** — Multi-asset portfolio (stocks, ETFs, crypto, property, super) with lots, CGT, dividends, allocation targets, live pricing
5. **FIRE Calculator** — Financial Independence projections with Coast/Barista FIRE, customizable rates
6. **Reports** — Spending breakdown, income vs expense, net worth, spending by payee, category trends
7. **AI Assistant** — OpenAI-powered chat advisor, spending insights, budget optimization (with data consent)
8. **Data Management** — YNAB import (ZIP + API), CSV import, JSON backup/restore, payee management
9. **Profiles** — Multiple user profiles with independent data isolation

### UX Features

- 6 color themes (Dungeon, Forest, Ocean, Crimson, Royal, Finance)
- Mobile responsive with bottom navigation
- Keyboard shortcuts (arrow nav, Ctrl+Z undo, N for new transaction)
- Loading skeletons and error boundaries
- Undo/redo system
- AI data consent modal
- Lightweight client-side caching

---

## Codebase Statistics

| Metric | Count |
|--------|-------|
| API Route Files | 46 |
| API Domains | 28 |
| Page Routes | 9 |
| UI Components | 26 |
| Library/Utility Files | 7 |
| Database Models | 18 |
| Prisma Migrations | 1 (initial) |

---

## Architecture Type

**Monolithic Next.js application** using the App Router pattern:
- **Pages** are client-rendered (`'use client'`) using `useState` + `useEffect` for data fetching
- **API routes** serve as the backend, directly accessing Prisma/SQLite
- **No server components** — all pages fetch data client-side via API routes
- **No external backend** — everything runs in a single Next.js process
- **Local-first** — SQLite database stored as a file (`loot-council.db`) in the project directory
- **Multi-profile** — Profile model scopes all data; profile selected via cookie/query param
- **Server bound to 127.0.0.1** — Not accessible from network (security hardening)
