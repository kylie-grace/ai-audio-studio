// SPDX-License-Identifier: AGPL-3.0-or-later
import { AlertBanner } from "./components/AlertBanner";
import { PrimaryTabStrip } from "./components/PrimaryTabStrip";
import { TabErrorBoundary } from "./components/TabErrorBoundary";
import { useDashboardModel } from "./hooks/useDashboardModel";
import { primaryMode } from "./appCore";
import { AutomationTab } from "./pages/AutomationTab";
import { ContextTab } from "./pages/ContextTab";
import { OperationsTab } from "./pages/OperationsTab";
import { OverviewTab } from "./pages/OverviewTab";
import { SettingsTab } from "./pages/SettingsTab";
import type { TabId } from "./types";

export function App() {
  const model = useDashboardModel();
  const {
    data,
    activeTab,
    setActiveTab,
    activeAlertCount,
    isInitialLoad,
    approvalArrivalMessage,
    setApprovalArrivalMessage,
    healthyCount,
    secureHint,
    activeTaskCount,
    primaryTabs,
    tabBadgeCounts,
  } = model;

  return (
    <main className="app-shell">
      <section className="top-rail">
        <div className="top-identity">
          <p className="eyebrow">AI Audio Studio</p>
          <h1>Studio Brain Control Room</h1>
          <p className="lede">
            Operator console for the full Mac-first stack: platform health, orchestration, approvals, context, and the optional worker surface.
          </p>
        </div>
        <div className="top-status-grid">
          <article className={`metric ${model.statusTone(data.loadState)}`}>
            <span className="metric-label">Control plane</span>
            <strong>{data.loadState}</strong>
            <span className="metric-subtle">{data.error ?? "Polling every 15 seconds."}</span>
          </article>
          <article className="metric">
            <span className="metric-label">Refreshed</span>
            <strong>{data.refreshedAt ?? "waiting"}</strong>
            <span className="metric-subtle">{primaryMode(data.workers)}</span>
          </article>
          <article className="metric">
            <span className="metric-label">Services</span>
            <strong>{healthyCount}/{data.services.length}</strong>
            <span className="metric-subtle">{secureHint}</span>
          </article>
          <article className={`metric ${activeAlertCount ? "warn" : "ok"}`}>
            <span className="metric-label">Active alerts</span>
            <strong>{activeAlertCount}</strong>
            <span className="metric-subtle">{data.approvals.length} approvals · {activeTaskCount} live tasks</span>
          </article>
        </div>
      </section>

      <PrimaryTabStrip
        tabs={primaryTabs}
        activeTab={activeTab}
        onSelect={(tabId) => setActiveTab(tabId as TabId)}
        badgeCounts={tabBadgeCounts}
      />

      {approvalArrivalMessage && activeTab !== "operations" ? (
        <section className="top-gap">
          <AlertBanner
            tone="info"
            title="New item awaiting approval"
            detail={approvalArrivalMessage}
            actionLabel="open operations"
            onAction={() => {
              setActiveTab("operations");
              setApprovalArrivalMessage(null);
            }}
            onDismiss={() => setApprovalArrivalMessage(null)}
          />
        </section>
      ) : null}

      {isInitialLoad ? (
        <section className="loading-shell" aria-label="Loading control room">
          <div className="loading-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <article key={index} className="panel loading-card">
                <div className="loading-bar loading-bar-short" />
                <div className="loading-bar loading-bar-medium" />
                <div className="loading-bar" />
                <div className="loading-bar loading-bar-medium" />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!isInitialLoad && activeTab === "overview" ? (
        <TabErrorBoundary tabName="Overview">
          <OverviewTab {...model} />
        </TabErrorBoundary>
      ) : null}

      {!isInitialLoad && activeTab === "operations" ? (
        <TabErrorBoundary tabName="Operations">
          <OperationsTab {...model} />
        </TabErrorBoundary>
      ) : null}

      {!isInitialLoad && activeTab === "automation" ? (
        <TabErrorBoundary tabName="Automation">
          <AutomationTab {...model} />
        </TabErrorBoundary>
      ) : null}

      {!isInitialLoad && activeTab === "context" ? (
        <TabErrorBoundary tabName="Context">
          <ContextTab {...model} apiProjectStateBase={model.API.projectState} lufsTarget={model.configuredLufsTarget} />
        </TabErrorBoundary>
      ) : null}

      {!isInitialLoad && activeTab === "settings" ? (
        <TabErrorBoundary tabName="Settings">
          <SettingsTab {...model} />
        </TabErrorBoundary>
      ) : null}
    </main>
  );
}
