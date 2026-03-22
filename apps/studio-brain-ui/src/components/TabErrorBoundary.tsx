import { Component, type ErrorInfo, type ReactNode } from "react";

type TabErrorBoundaryProps = {
  children: ReactNode;
  tabName: string;
};

type TabErrorBoundaryState = {
  hasError: boolean;
};

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`TabErrorBoundary(${this.props.tabName})`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel tab-error-boundary">
          <p className="section-kicker t-kicker">Tab error</p>
          <h2 className="t-h2">Tab failed to render</h2>
          <p className="panel-note">{this.props.tabName}</p>
          <p className="panel-note">Reload this tab view to retry. The rest of the control room should remain usable.</p>
          <div className="action-row">
            <button className="action-button btn primary" type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
