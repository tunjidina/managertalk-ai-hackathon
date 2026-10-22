import React from 'react';
import ErrorFallback from './ErrorFallback';

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    // Record only that a failure happened. The error itself is never
    // placed in state, so it can never reach the rendered output.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Developer-facing only: console, never the UI.
    // eslint-disable-next-line no-console
    console.error('[ManagerTalk] Unhandled render error:', error, errorInfo);
  }

  handleRestart = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRestart={this.handleRestart} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;