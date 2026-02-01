'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
    
    // Production'da hata loglama servisine gönder
    if (process.env.NODE_ENV === 'production') {
      // Sentry, LogRocket, vs. entegrasyonu
      this.logErrorToService(error, errorInfo);
    }
  }

  logErrorToService = async (error: Error, errorInfo: React.ErrorInfo) => {
    try {
      await fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Sessizce fail et
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              Bir Hata Oluştu
            </h1>
            
            <p className="text-slate-600 mb-6">
              Beklenmeyen bir hata oluştu. Lütfen sayfayı yenileyin veya ana sayfaya dönün.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-slate-100 rounded-lg text-left overflow-auto max-h-40">
                <p className="text-xs font-mono text-red-600">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <pre className="text-xs font-mono text-slate-500 mt-2 whitespace-pre-wrap">
                    {this.state.error.stack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Yenile
              </button>
              
              <Link
                href="/"
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                <Home className="h-4 w-4" />
                Ana Sayfa
              </Link>
            </div>

            <p className="text-xs text-slate-400 mt-6">
              Hata devam ederse lütfen sistem yöneticinize başvurun.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary wrapper
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
