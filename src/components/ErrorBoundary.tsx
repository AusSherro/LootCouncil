'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    resetKey?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    componentDidUpdate(prevProps: Props) {
        // Reset error state when resetKey changes (e.g. on navigation)
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false, error: null });
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="card text-center py-12">
                    <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h3>
                    <p className="text-neutral mb-4 max-w-md mx-auto">
                        {this.state.error?.message || 'An unexpected error occurred'}
                    </p>
                    <button onClick={this.handleRetry} className="btn btn-primary">
                        <RefreshCw className="w-5 h-5" />
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

// Hook-based error handler for async operations
export function useErrorHandler() {
    const handleError = (error: Error, context?: string) => {
        console.error(`Error${context ? ` in ${context}` : ''}:`, error);
        // Could integrate with error tracking service here
    };

    return { handleError };
}

// Auto-resetting ErrorBoundary that clears errors on route navigation
export function AutoResetErrorBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
    const pathname = usePathname();
    return (
        <ErrorBoundary resetKey={pathname} fallback={fallback}>
            {children}
        </ErrorBoundary>
    );
}

// Simple error display component
export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div className="bg-negative/10 border border-negative/30 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-negative flex-shrink-0" />
            <p className="text-negative flex-1">{message}</p>
            {onRetry && (
                <button onClick={onRetry} className="btn btn-ghost text-negative text-sm">
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </button>
            )}
        </div>
    );
}
