import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    boundedText,
    centsAmount,
    formatZodError,
    idString,
    isIsoDateString,
    isoDate,
    MAX_AMOUNT_DOLLARS,
    moneyAmount,
    monthKey,
    nonNegativeMoneyAmount,
    nullableId,
    parseBody,
    parseWith,
    positiveMoneyAmount,
    requiredText,
    toCents,
} from './validation';

function jsonRequest(body: string) {
    return new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

describe('moneyAmount', () => {
    it('accepts finite numbers within the bound', () => {
        for (const value of [0, -12.5, 0.01, MAX_AMOUNT_DOLLARS, -MAX_AMOUNT_DOLLARS]) {
            expect(moneyAmount.parse(value)).toBe(value);
        }
    });

    it('accepts numeric strings and returns a number', () => {
        expect(moneyAmount.parse('12.50')).toBe(12.5);
        expect(moneyAmount.parse(' -3 ')).toBe(-3);
        expect(moneyAmount.parse('.5')).toBe(0.5);
    });

    it('rejects non-numbers, non-finite values and out-of-range amounts', () => {
        for (const value of ['abc', '', '12abc', '1e3', null, undefined, true, {}, [], NaN, Infinity,
            MAX_AMOUNT_DOLLARS + 1, -MAX_AMOUNT_DOLLARS - 1]) {
            expect(moneyAmount.safeParse(value).success, String(value)).toBe(false);
        }
    });

    it('has positive and non-negative variants', () => {
        expect(positiveMoneyAmount.safeParse(0).success).toBe(false);
        expect(positiveMoneyAmount.safeParse(-5).success).toBe(false);
        expect(positiveMoneyAmount.parse(5)).toBe(5);
        expect(nonNegativeMoneyAmount.parse(0)).toBe(0);
        expect(nonNegativeMoneyAmount.safeParse(-0.01).success).toBe(false);
    });

    it('converts to integer cents without float drift', () => {
        expect(toCents(250.5)).toBe(25050);
        expect(toCents(0.1 + 0.2)).toBe(30);
        expect(toCents(-19.99)).toBe(-1999);
    });
});

describe('centsAmount', () => {
    it('accepts integers and rejects fractions or strings', () => {
        expect(centsAmount.parse(-5000)).toBe(-5000);
        expect(centsAmount.safeParse(12.5).success).toBe(false);
        expect(centsAmount.safeParse('500').success).toBe(false);
        expect(centsAmount.safeParse(MAX_AMOUNT_DOLLARS * 100 + 1).success).toBe(false);
    });
});

describe('isoDate', () => {
    it('accepts dates and ISO timestamps and returns a Date', () => {
        const day = isoDate.parse('2026-09-10');
        expect(day).toBeInstanceOf(Date);
        expect(day.toISOString()).toBe('2026-09-10T00:00:00.000Z');
        expect(isoDate.parse('2026-09-10T12:30:00.000Z').toISOString()).toBe('2026-09-10T12:30:00.000Z');
        expect(isoDate.parse('2024-02-29').getUTCDate()).toBe(29);
    });

    it('rejects impossible days, other formats and non-strings', () => {
        for (const value of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', 'never', '',
            '10/09/2026', 'Sep 10 2026', '2026-9-1', 12345, null, undefined]) {
            expect(isoDate.safeParse(value).success, String(value)).toBe(false);
        }
        expect(isIsoDateString('2026-04-31')).toBe(false);
    });
});

describe('monthKey', () => {
    it('accepts YYYY-MM only', () => {
        expect(monthKey.parse('2026-09')).toBe('2026-09');
        for (const value of ['2026-13', '2026-9', '2026-09-01', 202609]) {
            expect(monthKey.safeParse(value).success, String(value)).toBe(false);
        }
    });
});

describe('ids', () => {
    it('idString trims and requires a value', () => {
        expect(idString.parse(' abc ')).toBe('abc');
        expect(idString.safeParse('').success).toBe(false);
        expect(idString.safeParse('   ').success).toBe(false);
        expect(idString.safeParse(5).success).toBe(false);
        expect(idString.safeParse('x'.repeat(192)).success).toBe(false);
    });

    it('nullableId maps empty values to null and keeps optional distinct', () => {
        const schema = z.object({ categoryId: nullableId.optional() });
        expect(schema.parse({})).toEqual({});
        expect(schema.parse({ categoryId: '' })).toEqual({ categoryId: null });
        expect(schema.parse({ categoryId: null })).toEqual({ categoryId: null });
        expect(schema.parse({ categoryId: 'cat_1' })).toEqual({ categoryId: 'cat_1' });
        expect(schema.safeParse({ categoryId: 42 }).success).toBe(false);
    });
});

describe('text', () => {
    it('boundedText trims and enforces the maximum', () => {
        expect(boundedText(5).parse('  hi  ')).toBe('hi');
        expect(boundedText(5).parse('')).toBe('');
        expect(boundedText(5).safeParse('toolong').success).toBe(false);
        expect(boundedText(5).safeParse(5).success).toBe(false);
    });

    it('requiredText rejects blank strings', () => {
        expect(requiredText(10).safeParse('   ').success).toBe(false);
        expect(requiredText(10).parse(' Rent ')).toBe('Rent');
    });
});

describe('parseBody', () => {
    const schema = z.object({ amount: moneyAmount, date: isoDate });

    it('returns typed data for a valid body', async () => {
        const result = await parseBody(jsonRequest(JSON.stringify({ amount: 5, date: '2026-01-02' })), schema);
        expect(result.success).toBe(true);
        expect(result.data?.amount).toBe(5);
        expect(result.data?.date).toBeInstanceOf(Date);
    });

    it('returns a 400 naming the offending fields', async () => {
        const result = await parseBody(jsonRequest(JSON.stringify({ amount: 'abc' })), schema);
        expect(result.success).toBe(false);
        expect(result.response?.status).toBe(400);
        const body = await result.response!.json();
        expect(body.error).toMatch(/^Invalid request: /);
        expect(body.error).toContain('amount');
        expect(body.error).toContain('date');
    });

    it('returns a 400 for malformed JSON', async () => {
        const result = await parseBody(jsonRequest('{not json'), schema);
        expect(result.response?.status).toBe(400);
        expect((await result.response!.json()).error).toMatch(/valid JSON/);
    });

    it('parseWith validates an existing value', () => {
        expect(parseWith(monthKey, '2026-01').data).toBe('2026-01');
        expect(parseWith(monthKey, 'Jan').response?.status).toBe(400);
    });

    it('formatZodError joins paths and messages', () => {
        const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
        expect(result.success).toBe(false);
        expect(formatZodError(result.error!)).toMatch(/^a\.b: /);
    });
});
