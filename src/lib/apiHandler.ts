import { NextRequest, NextResponse } from 'next/server';

type RouteHandler = (req: NextRequest) => Promise<NextResponse>;
type RouteHandlerNoReq = () => Promise<NextResponse>;

/**
 * Wraps an API route handler with standardized error handling.
 * Catches errors, logs them server-side, and returns a generic error response.
 */
export function withErrorHandler(
    handler: RouteHandler | RouteHandlerNoReq,
    label: string
): RouteHandler {
    return async (req: NextRequest) => {
        try {
            return await (handler as RouteHandler)(req);
        } catch (error) {
            console.error(`[API] ${label}:`, error);
            return NextResponse.json(
                { error: `Failed to ${label.toLowerCase()}` },
                { status: 500 }
            );
        }
    };
}
