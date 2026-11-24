import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  private handleReload = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      let friendlyDetail = 'Please refresh to reconnect to the live Kuala Lumpur sightings stream.';
      if (this.state.errorMessage.includes('Missing or insufficient permissions')) {
        friendlyDetail = 'Your session lacks permission for this action. Please sign in with a verified Google account and try again.';
      } else if (this.state.errorMessage.includes('Quota exceeded')) {
        friendlyDetail = 'Daily database quota has been reached. Quota resets tomorrow.';
      }

      return (
        <div className="min-h-screen bg-[#F8F9F7] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#DCE3DA] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#141E1A]">
              Unable to load live field stream
            </h2>
            <p className="text-sm text-[#4A5A52] leading-relaxed">{friendlyDetail}</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-medium bg-[#0D6E59] text-white rounded-lg hover:bg-[#095444] transition-colors"
            >
              Reload KLOtters
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
