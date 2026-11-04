import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Shared request-body validation for API routes.
 *
 * Routes describe their body with a Zod schema built from the pieces below and
 * call `parseBody`, which turns any failure into a 400 with a readable message.
 * Profile ownership checks still happen in the route (see profileOwnership.ts);
 * these schemas only cover shape and range.
 */

/** Largest absolute dollar amount accepted from the client. */
export const MAX_AMOUNT_DOLLARS = 999_999_999;
/** The same bound expressed in cents, for bodies that already send cents. */
export const MAX_AMOUNT_CENTS = MAX_AMOUNT_DOLLARS * 100;

const NUMERIC_STRING = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*$/;

/**
 * Accepts a finite number, or a string that is entirely a decimal number
 * (form inputs sometimes arrive as strings). Anything else is rejected.
 */
export const finiteNumber = z.union([
    z.number(),
    z.string().regex(NUMERIC_STRING, 'must be a number').transform(Number),
], { error: 'must be a number' }).refine(Number.isFinite, 'must be a finite number');

/** A dollar amount from the client, within ±MAX_AMOUNT_DOLLARS. Output is still dollars. */
export const moneyAmount = finiteNumber.refine(
    value => Math.abs(value) <= MAX_AMOUNT_DOLLARS,
    `must be between -${MAX_AMOUNT_DOLLARS} and ${MAX_AMOUNT_DOLLARS}`,
);

/** A dollar amount that must be greater than zero. */
export const positiveMoneyAmount = moneyAmount.refine(value => value > 0, 'must be greater than 0');

/** A dollar amount that must be zero or more. */
export const nonNegativeMoneyAmount = moneyAmount.refine(value => value >= 0, 'must not be negative');

/** An integer amount already in cents, within ±MAX_AMOUNT_CENTS. */
export const centsAmount = z
    .number({ error: 'must be a number' })
    .int('must be a whole number of cents')
    .refine(value => Math.abs(value) <= MAX_AMOUNT_CENTS, 'is out of range');

/** Converts a validated dollar amount to integer cents. */
export function toCents(dollars: number): number {
    return Math.round(dollars * 100);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** True when the string is `YYYY-MM-DD` (optionally followed by a time) naming a real calendar day. */
export function isIsoDateString(value: string): boolean {
    const match = ISO_DATE.exec(value);
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    if (month < 1 || month > 12 || day < 1) return false;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return false;
    return !Number.isNaN(new Date(value).getTime());
}

/** An ISO date (`YYYY-MM-DD` or a full ISO timestamp). Output is a `Date`. */
export const isoDate = z
    .string({ error: 'must be a date string' })
    .trim()
    .refine(isIsoDateString, 'must be a valid date (YYYY-MM-DD)')
    .transform(value => new Date(value));

/** A budget month key, `YYYY-MM`. Output stays a string. */
export const monthKey = z
    .string({ error: 'must be a month string' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be a month in YYYY-MM format');

/** A database id. */
export const idString = z
    .string({ error: 'must be an id string' })
    .trim()
    .min(1, 'is required')
    .max(191, 'is too long');

/**
 * An id that may be cleared: `null` or `''` both mean "none" and come out as
 * `null`. Add `.optional()` when the field may also be left out.
 */
export const nullableId = z.preprocess(value => (value === '' ? null : value), idString.nullable());

/**
 * Free text up to `max` characters (after trimming). Use `.optional()` /
 * `.nullable()` at the call site to say whether it may be missing.
 */
export function boundedText(max: number) {
    return z
        .string({ error: 'must be text' })
        .trim()
        .max(max, `must be at most ${max} characters`);
}

/** Like `boundedText` but must contain at least one non-space character. */
export function requiredText(max: number) {
    return boundedText(max).min(1, 'is required');
}

/** Formats the first few issues as `field: message; field: message`. */
export function formatZodError(error: z.ZodError): string {
    return error.issues
        .slice(0, 3)
        .map(issue => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
}

/** Wraps a schema's error as the standard 400 response. */
export function validationError(error: z.ZodError): NextResponse {
    return NextResponse.json({ error: `Invalid request: ${formatZodError(error)}` }, { status: 400 });
}

export type ParseResult<T> =
    | { success: true; data: T; response?: undefined }
    | { success: false; data?: undefined; response: NextResponse };

/** Validates an already-read value (a parsed body, or `searchParams` entries). */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): ParseResult<z.output<S>> {
    const result = schema.safeParse(value);
    if (!result.success) return { success: false, response: validationError(result.error) };
    return { success: true, data: result.data };
}

/**
 * Reads the JSON body and validates it. On failure returns a 400 response for
 * the route to return as-is:
 *
 *     const parsed = await parseBody(request, schema);
 *     if (!parsed.success) return parsed.response;
 *     const { amount } = parsed.data;
 */
export async function parseBody<S extends z.ZodType>(
    request: Request,
    schema: S,
): Promise<ParseResult<z.output<S>>> {
    const body = await readJsonBody(request);
    if (!body.success) return body;
    return parseWith(schema, body.data);
}

/**
 * Reads the JSON body without validating it, for routes that pick a schema
 * from a field such as `action`. Malformed JSON still yields a 400. Read
 * `action` with `actionOf`, then validate with `parseWith`.
 */
export async function readJsonBody(request: Request): Promise<ParseResult<unknown>> {
    try {
        return { success: true, data: await request.json() };
    } catch {
        return {
            success: false,
            response: NextResponse.json({ error: 'Invalid request: body must be valid JSON' }, { status: 400 }),
        };
    }
}

/** The body's `action` field when it is a string, otherwise undefined. */
export function actionOf(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) return undefined;
    const action = (body as { action?: unknown }).action;
    return typeof action === 'string' ? action : undefined;
}
