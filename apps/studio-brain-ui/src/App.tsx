// SPDX-License-Identifier: AGPL-3.0-or-later
import { AlertBanner } from "./components/AlertBanner";
import { ConfirmTaskModal } from "./components/ConfirmTaskModal";
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
    workspaceSettings,
    displayedFrontDoor,
    readyConnectionCount,
    pendingConnections,
    topPendingConnection,
    integrationFlags,
    moduleEnabledCount,
  } = model;

  const launchpadItems = [
    {
      id: "operations" as TabId,
      label: "Run the day",
      detail:
        activeAlertCount || data.approvals.length
          ? `${activeAlertCount} alerts and ${data.approvals.length} approvals need review.`
          : "No live blockers. Review runtime and approvals from one place.",
      badge: activeAlertCount + data.approvals.length,
      tone: activeAlertCount || data.approvals.length ? "warn" : "ok",
    },
    {
      id: "context" as TabId,
      label: "Review projects",
      detail:
        data.projects.length
          ? `${data.projects.length} active projects with context, artifacts, and review state.`
          : "No active projects yet. Use this space for session, delivery, and review context.",
      badge: data.projects.length,
      tone: data.projects.length ? "info" : "muted",
    },
    {
      id: "automation" as TabId,
      label: "Check automations",
      detail:
        `${integrationFlags} integrations enabled, ${readyConnectionCount}/${data.workspace.connection_center.length} connection surfaces ready.`,
      badge: pendingConnections.length,
      tone: pendingConnections.length ? "warn" : "ok",
    },
    {
      id: "settings" as TabId,
      label: "Finish setup",
      detail:
        topPendingConnection
          ? `${topPendingConnection.name} still needs attention.`
          : "Workspace identity, paths, and worker posture are configured.",
      badge: pendingConnections.length,
      tone: topPendingConnection ? "warn" : "ok",
    },
  ];

  return (
    <main className="app-shell">
      <section className="top-rail">
        <div className="top-identity">
          <div className="brand-row">
            <img className="brand-mark" src="/brand-icon.svg" alt="AI Audio Studio" />
            <div>
              <p className="eyebrow">AI Audio Studio</p>
              <p className="brand-subtitle">Studio orchestration control plane</p>
            </div>
          </div>
          <h1>Studio Brain Control Room</h1>
          <p className="lede">
            Operator console for the full Mac-first stack: platform health, orchestration, approvals, context, and the optional worker surface.
          </p>
          <div className="hero-pill-row">
            <span className="tag">front door: {displayedFrontDoor.replace(/^https?:\/\//, "")}</span>
            <span className="tag">mode: {workspaceSettings.deployment_mode === "single_machine" ? "single machine" : "control plane + worker"}</span>
            <span className="tag">{moduleEnabledCount} modules enabled</span>
          </div>
        </div>
        <div className="top-status-grid">
          <article className="metric metric-summary">
            <span className="metric-label">Workspace posture</span>
            <strong>{workspaceSettings.studio_name || "Unconfigured studio"}</strong>
            <span className="metric-subtle">
              {primaryMode(data.workers)} · {readyConnectionCount}/{data.workspace.connection_center.length} connection surfaces ready
            </span>
          </article>
          <article className={`metric ${model.statusTone(data.loadState)}`}>
            <span className="metric-label">Control plane</span>
            <strong>{data.loadState}</strong>
            <span className="metric-subtle">{data.error ?? "Polling every 15 seconds."}</span>
          </article>
          <article className="metric">
            <span className="metric-label">Services</span>
            <strong>{healthyCount}/{data.services.length}</strong>
            <span className="metric-subtle">{secureHint}</span>
          </article>
          <article className={`metric ${activeAlertCount ? "warn" : "ok"}`}>
            <span className="metric-label">Live queue</span>
            <strong>{data.approvals.length + activeTaskCount}</strong>
            <span className="metric-subtle">{data.approvals.length} approvals · {activeTaskCount} live tasks</span>
          </article>
        </div>
      </section>

      <section className="launchpad-grid" aria-label="Primary operator routes">
        {launchpadItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`launch-card launch-${item.tone}${activeTab === item.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(item.id)}
          >
            <div className="launch-card-head">
              <div>
                <span className="metric-label">{item.label}</span>
                <strong>{item.badge}</strong>
              </div>
              <span className={`status-pill ${item.tone === "warn" ? "warn" : item.tone === "ok" ? "ok" : "muted"}`}>
                {item.tone === "warn" ? "attention" : item.tone === "ok" ? "ready" : item.tone}
              </span>
            </div>
            <p className="metric-subtle">{item.detail}</p>
          </button>
        ))}
      </section>

      <PrimaryTabStrip
        tabs={primaryTabs}
        activeTab={activeTab}
        onSelect={(tabId) => setActiveTab(tabId as TabId)}
        badgeCounts={tabBadgeCounts}
      />

      <ConfirmTaskModal
        apiProjectStateBase={model.API.projectState}
        apiStudioWorkerBase={model.API.studioWorker}
        operatorName={model.operatorName}
        operatorToken={model.operatorToken}
        onResolved={() => model.refreshData()}
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
