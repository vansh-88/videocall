import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // You can log the error to an error reporting service here
    console.error('ErrorBoundary caught an error', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  }

  handleGoHome = () => {
    window.location.href = '/';
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container">
          <div className="card">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="small-muted mb-4">An unexpected error occurred while loading this page.</p>
            <div className="mb-4">
              <details className="text-sm p-2 bg-slate-50 rounded">
                <summary className="cursor-pointer">Error details (expand)</summary>
                <pre className="text-xs mt-2 overflow-auto max-h-40">{String(this.state.error)}{this.state.info ? '\n' + (this.state.info.componentStack || '') : ''}</pre>
              </details>
            </div>

            <div className="flex gap-2">
              <button className="primary-btn bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" onClick={this.handleReload}>Reload</button>
              <button className="secondary-btn bg-white border border-indigo-200 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-100" onClick={this.handleGoHome}>Go to Lobby</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
