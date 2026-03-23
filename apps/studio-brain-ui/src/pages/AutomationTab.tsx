import { useState } from "react";

import { AlertBanner } from "../components/AlertBanner";
import { EmptyState } from "../components/EmptyState";

type AutomationTabProps = {
  [key: string]: any;
};

export function AutomationTab(props: AutomationTabProps) {
  const {
    data,
    bootstrapStatusLabel,
    enabledRuleCount,
    configuredAlertCount,
    setActiveTab,
    maintenancePending,
    reseedAutomationDefaults,
    activeStarterPack,
    starterPackPending,
    applyStarterPack,
    maintenanceMessage,
    maintenanceError,
    starterPackMessage,
    starterPackError,
    expandedStarterPackSlug,
    setExpandedStarterPackSlug,
    showAllRules,
    setShowAllRules,
    visibleRules,
    n8nWorkflowUrl,
    n8nUrl,
    credentialWarnings,
  } = props;
  const [dismissCredentialBanner, setDismissCredentialBanner] = useState(false);
  const hasCredentialWarnings = Boolean(credentialWarnings?.length);
  const postureLabel = activeStarterPack?.name ?? "No live automation posture selected";
  const postureDetail = activeStarterPack
    ? hasCredentialWarnings
      ? "The live starter pack is active, but outbound email or social credentials are still incomplete. Internal automations can run; credential-gated flows stay operator-reviewed."
      : "The live starter pack is active. Reapply it if rules drift, or open Operations to recover runtime issues."
    : "Apply the operator-baseline starter pack or reseed defaults to restore the shipped rule set before handing the system to a novice.";
  const postureAction = activeStarterPack
    ? hasCredentialWarnings
      ? { label: "review settings", handler: () => setActiveTab?.("settings") }
      : { label: "open operations", handler: () => setActiveTab?.("operations") }
    : { label: "open settings", handler: () => setActiveTab?.("settings") };

  return (
    <div className="tab-panel">
      <AlertBanner
        tone={activeStarterPack ? (hasCredentialWarnings ? "warn" : "ok") : "warn"}
        title={postureLabel}
        detail={postureDetail}
        actionLabel={postureAction.label}
        onAction={postureAction.handler}
      />
      {!dismissCredentialBanner && credentialWarnings?.length ? (
        <div className="banner-stack">
          {credentialWarnings.map((warning: any) => (
            <AlertBanner
              key={warning.id}
              tone="warn"
              title={warning.title}
              detail={warning.detail}
              onDismiss={() => setDismissCredentialBanner(true)}
            />
          ))}
        </div>
      ) : null}
      <section className="workspace-grid">
        <article className="panel panel-span-12 automation-panel automation-cyan">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Automation</p>
              <h2 className="t-h2">Bootstrap + Maintenance</h2>
            </div>
            <span className={`status-pill ${data.bootstrapStatus.status === "imported" || data.bootstrapStatus.status === "skipped" ? "ok" : "warn"}`}>
              {bootstrapStatusLabel(data.bootstrapStatus.status)}
            </span>
          </div>
          <div className="stat-strip">
            <div>
              <span className="metric-label">Starter workflows</span>
              <strong>{data.bootstrapStatus.workflow_count}</strong>
            </div>
            <div>
              <span className="metric-label">Rules active</span>
              <strong>{enabledRuleCount}</strong>
            </div>
            <div>
              <span className="metric-label">Alert channels</span>
              <strong>{configuredAlertCount}/{data.alerts.channels.length}</strong>
            </div>
          </div>
          <div className="header-actions top-gap">
            <button
              className="action-button btn secondary"
              disabled={maintenancePending !== null}
              onClick={() => {
                if (!window.confirm("Reseed automation defaults? This will overwrite all custom rule configurations with the default set.")) return;
                reseedAutomationDefaults();
              }}
            >
              {maintenancePending === "reseed" ? "reseeding" : "reseed defaults"}
            </button>
            <button
              className="action-button btn primary"
              disabled={starterPackPending !== null || !activeStarterPack}
              onClick={() => activeStarterPack && applyStarterPack(activeStarterPack.slug)}
            >
              {starterPackPending && activeStarterPack ? "applying" : "reapply live posture"}
            </button>
          </div>
          <p className="panel-note">{data.bootstrapStatus.detail}</p>
          <p className="panel-note">{activeStarterPack ? `Active posture: ${activeStarterPack.name}` : "Active posture: custom or mixed rule state"}</p>
          {maintenanceMessage ? <p className="feedback ok">{maintenanceMessage}</p> : null}
          {maintenanceError ? <p className="feedback bad">{maintenanceError}</p> : null}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Automations</p>
              <h2 className="t-h2">Starter Packs</h2>
            </div>
            <span className="count-pill">{data.starterPacks.length}</span>
          </div>
          <div className="table-stack">
            {data.starterPacks.length ? (
              data.starterPacks.map((pack: any) => (
                <div key={pack.slug} className="table-row approval-card is-expanded">
                  <div className="row-main">
                    <strong>{pack.name}</strong>
                    <div className="muted">{pack.description}</div>
                    <div className="muted">{pack.rules.length} rule(s) · alerts via {pack.alert_channels.join(", ")}</div>
                    {expandedStarterPackSlug === pack.slug ? (
                      <div className="summary-pill-row top-gap">
                        {pack.rules.map((rule: any) => (
                          <span key={rule.slug} className="summary-pill">
                            {rule.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${activeStarterPack?.slug === pack.slug ? "ok" : "warn"}`}>
                      {activeStarterPack?.slug === pack.slug ? "active posture" : "available"}
                    </span>
                    <button className="action-button btn ghost" type="button" onClick={() => setExpandedStarterPackSlug((current: string | null) => (current === pack.slug ? null : pack.slug))}>
                      {expandedStarterPackSlug === pack.slug ? "hide rules" : "show rules"}
                    </button>
                    <button className="action-button btn secondary" disabled={starterPackPending !== null} onClick={() => applyStarterPack(pack.slug)}>
                      {starterPackPending === pack.slug ? "applying" : "apply"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No starter packs yet"
                detail="Starter packs will appear here after automation defaults are seeded."
                actionLabel="reseed defaults"
                onAction={reseedAutomationDefaults}
              />
            )}
          </div>
          {starterPackMessage ? <p className="feedback ok">{starterPackMessage}</p> : null}
          {starterPackError ? <p className="feedback bad">{starterPackError}</p> : null}
        </article>

        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Rules</p>
              <h2 className="t-h2">Rule Inventory</h2>
            </div>
            <div className="header-actions">
              <span className="count-pill">showing {visibleRules.length} of {data.rules.length}</span>
              {data.rules.length > 10 ? (
                <button className="action-button btn subtle" type="button" onClick={() => setShowAllRules((current: boolean) => !current)}>
                  {showAllRules ? "show less" : "show all"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="table-stack">
            {visibleRules.length ? (
              visibleRules.map((rule: any) => (
                <div key={rule.id} className="table-row">
                  <div className="row-main">
                    <strong>{rule.name}</strong>
                    <div className="muted">{rule.trigger_module}.{rule.trigger_action} → {rule.target_module}</div>
                    <div className="meta-inline">
                      <span>tier {rule.required_tier}</span>
                      <span>{rule.approval_required ? "approval required" : "auto-allowed"}</span>
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${rule.enabled ? "ok" : "warn"}`}>{rule.enabled ? "enabled" : "disabled"}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No rules returned"
                detail="Rule inventory is empty right now. Re-seed defaults or verify OpenClaw health."
                actionLabel="reseed defaults"
                onAction={reseedAutomationDefaults}
              />
            )}
          </div>
        </article>

        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Playbooks</p>
              <h2 className="t-h2">Starter Automations</h2>
            </div>
            <span className="count-pill">{data.playbooks.length}</span>
          </div>
          <div className="table-stack">
            {data.playbooks.length ? (
              data.playbooks.map((playbook: any) => (
                <div key={playbook.slug} className="table-row">
                  <div className="row-main">
                    <strong>{playbook.name}</strong>
                    <div className="muted">{playbook.trigger_module}.{playbook.trigger_action} → {playbook.target_module}</div>
                    <div className="muted">{playbook.summary}</div>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill ok">prebuilt</span>
                    <span className="muted">{playbook.n8n_workflow_slug}</span>
                    <div className="action-row">
                      <a className="action-button btn ghost" href={n8nWorkflowUrl(n8nUrl, playbook.n8n_workflow_slug)} target="_blank" rel="noreferrer">
                        view workflow
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title="No workflow history yet"
                detail="Starter automations will appear here after the bootstrap pack is active."
                actionLabel="reapply live posture"
                onAction={() => activeStarterPack && applyStarterPack(activeStarterPack.slug)}
              />
            )}
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Rule Packs</p>
              <h2 className="t-h2">Seeded Automation Surfaces</h2>
            </div>
            <span className="count-pill">{data.rulePacks.length}</span>
          </div>
          <div className="module-grid">
            {data.rulePacks.length ? (
              data.rulePacks.map((pack: any) => (
                <div key={pack.slug} className="mini-card module-card module-cyan">
                  <span className="metric-label">rule pack</span>
                  <strong>{pack.name}</strong>
                  <p className="panel-note">{pack.description}</p>
                  <span className="status-pill ok">{pack.rule_count} rules</span>
                </div>
              ))
            ) : (
              <EmptyState
                title="No rule packs available"
                detail="Seeded rule packs are not available yet. Verify bootstrap and OpenClaw health."
                actionLabel="reseed defaults"
                onAction={reseedAutomationDefaults}
              />
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
