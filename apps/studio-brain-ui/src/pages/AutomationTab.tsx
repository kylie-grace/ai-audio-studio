type AutomationTabProps = {
  [key: string]: any;
};

export function AutomationTab(props: AutomationTabProps) {
  const {
    data,
    bootstrapStatusLabel,
    enabledRuleCount,
    configuredAlertCount,
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
  } = props;

  return (
    <div className="tab-panel">
      <section className="workspace-grid">
        <article className="panel panel-span-12 automation-panel automation-cyan">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Automation</p>
              <h2>Bootstrap + Maintenance</h2>
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
            <button className="action-button secondary" disabled={maintenancePending !== null} onClick={reseedAutomationDefaults}>
              {maintenancePending === "reseed" ? "reseeding" : "reseed defaults"}
            </button>
            <button
              className="action-button primary"
              disabled={starterPackPending !== null || !activeStarterPack}
              onClick={() => activeStarterPack && applyStarterPack(activeStarterPack.slug)}
            >
              {starterPackPending && activeStarterPack ? "applying" : "reapply live posture"}
            </button>
          </div>
          <p className="panel-note">{data.bootstrapStatus.detail}</p>
          <p className="panel-note">Active posture: {activeStarterPack?.name ?? "custom or mixed rule state"}</p>
          {maintenanceMessage ? <p className="feedback ok">{maintenanceMessage}</p> : null}
          {maintenanceError ? <p className="feedback bad">{maintenanceError}</p> : null}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Automations</p>
              <h2>Starter Packs</h2>
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
                    <button className="action-button ghost" type="button" onClick={() => setExpandedStarterPackSlug((current: string | null) => (current === pack.slug ? null : pack.slug))}>
                      {expandedStarterPackSlug === pack.slug ? "hide rules" : "show rules"}
                    </button>
                    <button className="action-button secondary" disabled={starterPackPending !== null} onClick={() => applyStarterPack(pack.slug)}>
                      {starterPackPending === pack.slug ? "applying" : "apply"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No starter packs available yet.</p>
            )}
          </div>
          {starterPackMessage ? <p className="feedback ok">{starterPackMessage}</p> : null}
          {starterPackError ? <p className="feedback bad">{starterPackError}</p> : null}
        </article>

        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Rules</p>
              <h2>Rule Inventory</h2>
            </div>
            <div className="header-actions">
              <span className="count-pill">showing {visibleRules.length} of {data.rules.length}</span>
              {data.rules.length > 10 ? (
                <button className="action-button subtle" type="button" onClick={() => setShowAllRules((current: boolean) => !current)}>
                  {showAllRules ? "show less" : "show all"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="table-stack">
            {visibleRules.map((rule: any) => (
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
            ))}
          </div>
        </article>

        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Playbooks</p>
              <h2>Starter Automations</h2>
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
                      <a className="action-button ghost" href={n8nWorkflowUrl(n8nUrl, playbook.n8n_workflow_slug)} target="_blank" rel="noreferrer">
                        view workflow
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No starter automations are available yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Rule Packs</p>
              <h2>Seeded Automation Surfaces</h2>
            </div>
            <span className="count-pill">{data.rulePacks.length}</span>
          </div>
          <div className="module-grid">
            {data.rulePacks.map((pack: any) => (
              <div key={pack.slug} className="mini-card module-card module-cyan">
                <span className="metric-label">rule pack</span>
                <strong>{pack.name}</strong>
                <p className="panel-note">{pack.description}</p>
                <span className="status-pill ok">{pack.rule_count} rules</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
