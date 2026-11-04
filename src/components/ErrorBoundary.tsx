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

class ErrorBoundary extends Component<Props, State> {
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

// Auto-resetting ErrorBoundary that clears errors on route navigation
export function AutoResetErrorBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
    const pathname = usePathname();
    return (
        <ErrorBoundary resetKey={pathname} fallback={fallback}>
            {children}
        </ErrorBoundary>
    );
}
