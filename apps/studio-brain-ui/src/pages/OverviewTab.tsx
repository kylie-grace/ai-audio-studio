import { useEffect, useState } from "react";

import { AlertBanner } from "../components/AlertBanner";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { DawStatusCard } from "../components/DawStatusCard";
import { EmptyState } from "../components/EmptyState";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

type OverviewTabProps = {
  [key: string]: any;
};

export function OverviewTab(props: OverviewTabProps) {
  const {
    activeAlertCount,
    data,
    operatorFocusItems,
    setActiveTab,
    conciergeMode,
    conciergeTurns,
    operatorName,
    conciergePending,
    conciergeInput,
    setConciergeInput,
    submitConciergePrompt,
    runConciergeAction,
    conciergeError,
    workflowPlaybooks,
    workflowTone,
    primaryTabs,
    workspaceSettings,
    displayedFrontDoor,
    frontDoorUrl,
    n8nUrl,
    zoneSummaries,
    readinessSummary,
    frontDoorMode,
    supportHealthCards,
    workerCapabilities,
    workstationReadiness,
    dawCapabilityCards,
    dawReviewSurfaceCards,
    workstationProfile,
    reviewSavePending,
    saveRenderReview,
    saveListeningReview,
    selectedProject,
    serviceZones,
    zoneAccent,
    zoneDescriptions,
    selectedService,
    setSelectedServiceKey,
    serviceLabel,
    statusTone,
    selectedServiceStatusState,
    selectedServiceHighlights,
    moduleSettings,
    serviceSettingsSummary,
    serviceDependencyHints,
    serviceManagedIn,
    servicePrimaryTab,
    serviceRecommendedAction,
    refreshData,
    copyServiceField,
    selectedServiceProxyUrl,
    serviceInspectorMessage,
    serviceInspectorError,
    maintenancePending,
    reseedAutomationDefaults,
    alertActionPending,
    runAlertAction,
    maintenanceMessage,
    maintenanceError,
    alertActionMessage,
    alertActionError,
    supportSurface,
  } = props;
  const [dawStatus, setDawStatus] = useState<Record<string, { connected: boolean; last_seen: string | null }> | null>(null);
  const [dawStatusLoaded, setDawStatusLoaded] = useState(false);
  const runtimeRecoveryCount =
    data.runtimeRecovery.summary.failed_task_count +
    data.runtimeRecovery.summary.expired_claim_count +
    data.runtimeRecovery.summary.stale_worker_count;
  const assistantGuidance =
    runtimeRecoveryCount > 0
      ? {
          tone: "warn" as const,
          title: "Runtime recovery needs attention",
          detail: `There are ${data.runtimeRecovery.summary.failed_task_count} failed tasks, ${data.runtimeRecovery.summary.expired_claim_count} expired claims, and ${data.runtimeRecovery.summary.stale_worker_count} stale workers. Open Operations to release or requeue before starting new work.`,
          actionLabel: "open operations",
          action: () => setActiveTab("operations"),
        }
      : data.workspace.onboarding_required || readinessSummary.needs_attention_count
        ? {
            tone: "info" as const,
            title: "Setup still has a few gaps",
            detail: `Finish the remaining onboarding items in Settings so the assistant can give turn-key guidance. ${data.workspace.missing_fields.length} field(s) still need attention.`,
            actionLabel: "open settings",
            action: () => setActiveTab("settings"),
          }
        : conciergeMode === "fallback"
          ? {
              tone: "warn" as const,
              title: "Assistant is using fallback guidance",
              detail: "The dashboard still works, but answers are coming from deterministic local guidance until the concierge backend is healthy.",
              actionLabel: "refresh",
              action: () => void runConciergeAction("refresh"),
            }
          : {
              tone: "ok" as const,
              title: "Assistant is ready",
              detail: "Ask for the next safe step, a setup gap summary, or a recovery plan.",
              actionLabel: "open automation",
              action: () => setActiveTab("automation"),
            };
  const assistantPromptSuggestions = [
    runtimeRecoveryCount > 0 ? "How do I recover stuck runtime?" : "What should I do first?",
    data.workspace.onboarding_required ? "What setup steps are still missing?" : "Is automation posture ready?",
    conciergeMode === "fallback" ? "How do I use the fallback assistant?" : "What is the safest next action?",
  ].filter((prompt, index, prompts) => Boolean(prompt) && prompts.indexOf(prompt) === index) as string[];

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/studio-worker/daw-status", { headers: { Accept: "application/json" } });
        if (!response.ok || !active) return;
        const payload = await response.json();
        if (!active) return;
        setDawStatus(payload);
        setDawStatusLoaded(true);
      } catch {
        if (!active) return;
        setDawStatusLoaded(true);
      }
    };
    void load();
    timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="tab-panel">
      <section className="overview-lead-grid">
        <article className="panel focus-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Today</p>
              <h2 className="t-h2">Operator focus</h2>
            </div>
            <span className={`status-pill ${activeAlertCount || data.approvals.length ? "warn" : "ok"}`}>
              {activeAlertCount || data.approvals.length ? "action needed" : "steady"}
            </span>
          </div>
          <p className="panel-note">
            Start here. This panel keeps the first screen anchored on what needs attention now instead of every subsystem at once.
          </p>
          <div className="focus-list">
            {operatorFocusItems.map((item: any) => (
              <button
                key={item.title}
                type="button"
                className={`focus-item focus-${item.tone}`}
                onClick={() => setActiveTab(item.tab)}
              >
                <div className="workflow-header">
                  <strong>{item.title}</strong>
                  <span className={`status-pill ${item.tone === "ok" ? "ok" : "warn"}`}>{item.action}</span>
                </div>
                <p className="panel-note">{item.detail}</p>
              </button>
            ))}
          </div>
        </article>
        <article className="panel assistant-panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Assistant</p>
              <h2 className="t-h2">Control Room Assistant</h2>
            </div>
            <div className="header-actions">
              <span className={`status-pill ${conciergeMode === "llm" ? "ok" : "warn"}`}>{conciergeMode === "llm" ? "llm live" : "fallback mode"}</span>
              <span className="count-pill">{conciergeTurns.length} turns</span>
            </div>
          </div>
          <p className="panel-note">
            Ask about setup, missing features, shared storage posture, integrations, approvals, or project state. Replies come from live control-room context and Ollama when available.
          </p>
          <AlertBanner
            tone={assistantGuidance.tone}
            title={assistantGuidance.title}
            detail={assistantGuidance.detail}
            actionLabel={assistantGuidance.actionLabel}
            onAction={assistantGuidance.action}
          />
          <div className="table-stack top-gap">
            {conciergeTurns.length ? (
              <div className="assistant-thread">
                {conciergeTurns.slice(-8).map((turn: any, index: number) => (
                  <div key={`${turn.role}-${index}`} className={`assistant-bubble ${turn.role === "assistant" ? "assistant" : "user"}`}>
                    <span className="assistant-speaker">{turn.role === "assistant" ? "assistant" : operatorName || "operator"}</span>
                    <p>{turn.text}</p>
                    {turn.actions?.length ? (
                      <div className="action-row top-gap">
                        {turn.actions.map((action: any) => (
                          <button
                            key={action.id}
                            type="button"
                            className="action-button btn ghost"
                            onClick={() => void runConciergeAction(action.id)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {conciergePending ? (
                  <div className="assistant-bubble assistant">
                    <span className="assistant-speaker">assistant</span>
                    <div className="assistant-thinking" aria-label="Assistant is thinking">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="Ask the control room assistant"
                detail="Try asking what is missing, what to do first, or how to recover runtime. Use one of the suggested prompts below if you want a starting point."
              />
            )}
          </div>
          <div className="wizard-footer-actions top-gap">
            <input
              value={conciergeInput}
              onChange={(event) => setConciergeInput(event.target.value)}
              placeholder="What should I do first? Ask for setup, recovery, or automation guidance."
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitConciergePrompt(conciergeInput);
                }
              }}
            />
            <button className="action-button btn primary" type="button" disabled={conciergePending} onClick={() => void submitConciergePrompt(conciergeInput)}>
              {conciergePending ? "thinking" : "send"}
            </button>
          </div>
          {assistantPromptSuggestions.length ? (
            <div className="assistant-quick-actions top-gap">
              {assistantPromptSuggestions.map((prompt) => (
                <button
                  key={prompt}
                  className="action-button btn ghost"
                  type="button"
                  onClick={() => void submitConciergePrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <div className="assistant-quick-actions">
            <button className="action-button btn ghost" type="button" onClick={() => void runConciergeAction("run-worker-smoke")}>worker smoke</button>
            <button className="action-button btn ghost" type="button" onClick={() => void runConciergeAction("goto-automation")}>automation</button>
            <button className="action-button btn ghost" type="button" onClick={() => void runConciergeAction("goto-settings")}>setup</button>
            <button className="action-button btn ghost" type="button" onClick={() => void runConciergeAction("goto-operations")}>operations</button>
            <button className="action-button btn ghost" type="button" onClick={() => void runConciergeAction("test-alerts")}>test alerts</button>
          </div>
          {conciergeError ? <p className="feedback bad">{conciergeError}</p> : null}
        </article>
      </section>

      <section className="overview-support-grid">
        <CollapsibleSection title="Automation Status" defaultOpen={false} badge={workflowPlaybooks.length}>
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Guided actions</p>
              <h2 className="t-h2">Primary operator workflows</h2>
            </div>
            <span className="count-pill">{workflowPlaybooks.length} lanes</span>
          </div>
          {conciergeMode === "fallback" ? (
            <AlertBanner
              tone="warn"
              title="Assistant is running in fallback mode"
              detail="The UI is still usable, but answers are coming from deterministic local guidance because the concierge backend is unavailable."
            />
          ) : null}
          <div className="workflow-strip" aria-label="Guided operator workflows">
            {workflowPlaybooks.map((workflow: any) => (
              <button
                key={workflow.id}
                type="button"
                className={`workflow-card workflow-${workflow.tab}`}
                onClick={() => setActiveTab(workflow.tab)}
              >
                <div className="workflow-header">
                  <span className="metric-label">{workflow.label}</span>
                  <span className={`status-pill ${workflowTone(workflow.state)}`}>{workflow.state}</span>
                </div>
                <strong>{workflow.count}</strong>
                <span className="workflow-unit">{workflow.unit}</span>
                <p className="panel-note">{workflow.summary}</p>
                <div className="workflow-footer">
                  <span>{workflow.detail}</span>
                  <span>open {primaryTabs.find((tab: any) => tab.id === workflow.tab)?.label.toLowerCase()}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
        </CollapsibleSection>
      </section>

      <section className="command-grid">
        <CollapsibleSection title="Concierge Status" defaultOpen={false}>
        <article className="panel command-card accent-gold">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Front Door</p>
              <h2 className="t-h2">Operator Access</h2>
            </div>
            <span className="count-pill">{workspaceSettings.https_mode === "https_enabled" ? "https preferred" : "lan by ip"}</span>
          </div>
          <div className="surface-grid">
            <div className="surface-card emphasis-card">
              <span className="metric-label">Primary operator URL</span>
              <strong>{displayedFrontDoor}</strong>
              <p>Keep operators on one entrypoint and avoid raw service ports for normal use.</p>
            </div>
            <div className="surface-card">
              <span className="metric-label">LAN fallback</span>
              <strong>{frontDoorUrl}</strong>
              <p>Immediate full-network access while local hostname and certificate trust are still being finalized.</p>
            </div>
            <div className="surface-card">
              <span className="metric-label">Automation admin</span>
              <strong>{n8nUrl}</strong>
              <p>Reserved for engineering and workflow administration, not novice daily use.</p>
            </div>
          </div>
        </article>
        </CollapsibleSection>

        <CollapsibleSection title="Service Inspector" defaultOpen={false} badge={zoneSummaries.length}>
        <article className="panel command-card accent-blue">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Zones</p>
              <h2 className="t-h2">Service Coverage</h2>
            </div>
            <span className="status-pill ok">{zoneSummaries.length} zones mapped</span>
          </div>
          <div className="zone-summary-grid">
            {zoneSummaries.map((summary: any) => (
              <div key={summary.zone} className={`mini-card zone-summary-card ${summary.accent}`}>
                <span className="metric-label">{summary.zone}</span>
                <strong>{summary.healthyCount}/{summary.services.length}</strong>
                <p className="panel-note">{summary.managedIn}</p>
              </div>
            ))}
          </div>
        </article>
        </CollapsibleSection>

        <CollapsibleSection title="Recent Activity" defaultOpen={false} badge={readinessSummary.partial_count}>
        <article className="panel command-card accent-green">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Fabric</p>
              <h2 className="t-h2">Platform Readiness</h2>
            </div>
            <span className={`status-pill ${readinessSummary.needs_attention_count ? "bad" : "ok"}`}>{frontDoorMode}</span>
          </div>
          <div className="support-health-grid">
            {supportHealthCards.map((item: any) => (
              <div key={item.name} className={`mini-card support-health-card ${item.tone}`}>
                <span className="metric-label">{item.name}</span>
                <strong>{item.tone === "ok" ? "ready" : item.tone === "warn" ? "watch" : "attention"}</strong>
                <p className="panel-note">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>
        </CollapsibleSection>
      </section>

      <section className="workspace-grid">
        <CollapsibleSection title="Worker Queue" defaultOpen={false} badge={workerCapabilities.length}>
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">DAW Foundation</p>
              <h2 className="t-h2">Workstation Capability</h2>
            </div>
            <span className="count-pill">{workerCapabilities.length} capabilities</span>
          </div>
          <div className="module-grid top-gap">
            {!dawStatusLoaded ? (
              <>
                <div className="skeleton skeleton--row" />
                <div className="skeleton skeleton--row" />
                <div className="skeleton skeleton--row" />
              </>
            ) : (
              ["reaper", "protools", "wavelab"].map((daw) => (
                <DawStatusCard
                  key={daw}
                  daw={daw as "reaper" | "protools" | "wavelab"}
                  connected={Boolean(dawStatus?.[daw]?.connected)}
                  lastSeen={dawStatus?.[daw]?.last_seen ?? null}
                />
              ))
            )}
          </div>
          <div className="foundation-grid">
            <div className="foundation-column">
              <div className="panel-header compact-header">
                <div>
                  <span className="metric-label">Readiness</span>
                  <strong>Workstation posture</strong>
                </div>
              </div>
              <div className="readiness-mini-grid">
                {workstationReadiness.map((item: any) => (
                  <div key={item.label} className={`mini-card foundation-card ${item.state}`}>
                    <div className="workflow-header">
                      <span className="metric-label">{item.label}</span>
                      <span className={`status-pill ${item.state === "ready" ? "ok" : "warn"}`}>
                        {item.state === "ready" ? "ready" : "watch"}
                      </span>
                    </div>
                    <strong>{item.label}</strong>
                    <p className="panel-note">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="foundation-column">
              <div className="panel-header compact-header">
                <div>
                  <span className="metric-label">Capabilities</span>
                  <strong>DAW execution surfaces</strong>
                </div>
              </div>
              <div className="daw-status-strip">
                {(workstationProfile?.daws ?? [
                  { slug: "reaper", automation_ready: false, notes: "No workstation profile yet.", last_seen: null },
                  { slug: "protools", automation_ready: false, notes: "No workstation profile yet.", last_seen: null },
                  { slug: "wavelab", automation_ready: false, notes: "Mastering surface not reported yet.", last_seen: null },
                ]).slice(0, 3).map((daw: any) => (
                  <DawStatusCard
                    key={daw.slug}
                    daw={daw.slug}
                    connected={Boolean(daw.automation_ready)}
                    lastSeen={daw.last_seen ?? null}
                    detail={daw.notes}
                  />
                ))}
              </div>
              <div className="module-grid">
                {dawCapabilityCards.map((item: any) => (
                  <div key={item.name} className={`mini-card module-card foundation-capability-card ${item.state}`}>
                    <span className="metric-label">daw capability</span>
                    <strong>{item.name}</strong>
                    <p className="panel-note">{item.detail}</p>
                    <span className={`status-pill ${item.state === "ready" ? "ok" : "warn"}`}>
                      {item.state === "ready" ? "available" : "needs worker"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="foundation-column">
              <div className="panel-header compact-header">
                <div>
                  <span className="metric-label">Production Coverage</span>
                  <strong>Review surfaces</strong>
                </div>
              </div>
              <div className="status-grid">
                {dawReviewSurfaceCards.map((item: any) => (
                  <div key={item.title} className={`mini-card status-card ${item.state}`}>
                    <div className="workflow-header">
                      <span className="metric-label">{item.title}</span>
                      <span className={`status-pill ${item.state === "ready" ? "ok" : "warn"}`}>
                        {item.state === "ready" ? "live" : "watch"}
                      </span>
                    </div>
                    <strong>{item.title}</strong>
                    <p className="panel-note">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
        </CollapsibleSection>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <CollapsibleSection title="Workspace Readiness" defaultOpen={false} badge={readinessSummary.needs_attention_count}>
            <div className="panel-header">
              <div>
                <p className="section-kicker t-kicker">Readiness</p>
                <h2 className="t-h2">Workspace Readiness</h2>
              </div>
              <div className="header-actions">
                <span className="count-pill">{readinessSummary.ready_count} ready</span>
                <span className="status-pill warn">{readinessSummary.partial_count} partial</span>
                <span className="status-pill bad">{readinessSummary.needs_attention_count} attention</span>
              </div>
            </div>
            <div className="readiness-grid">
              {data.workspace.readiness_checks.map((check: any) => (
                <div key={check.slug} className="mini-card readiness-card">
                  <div className="panel-header compact-header">
                    <div>
                      <span className="metric-label">{check.name}</span>
                      <strong>{check.status.replace("-", " ")}</strong>
                    </div>
                    <span className={`status-pill ${check.status === "ready" ? "ok" : check.status === "partial" || check.status === "optional" ? "warn" : "bad"}`}>
                      {check.status}
                    </span>
                  </div>
                  <p className="panel-note">{check.detail}</p>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <CollapsibleSection title="DAW Live Preview" defaultOpen={false} badge={data.executionPlanPreview?.blockers.length ?? 0}>
            <div className="panel-header">
              <div>
                <p className="section-kicker t-kicker">Execution Preview</p>
                <h2 className="t-h2">DAW Live Preview</h2>
              </div>
              <span className={`status-pill ${workstationProfile?.ready ? "ok" : "warn"}`}>
                {workstationProfile ? (workstationProfile.ready ? "ready to stage" : "needs setup") : "worker offline"}
              </span>
            </div>
          <div className="workspace-grid nested-grid">
            <div className="panel-span-4">
              <div className="mini-card">
                <span className="metric-label">Workstation posture</span>
                <strong>{workstationProfile?.deployment_mode ?? "unavailable"}</strong>
                <p className="panel-note">{workstationProfile?.host ?? "No studio-worker profile is reachable yet."}</p>
                <div className="summary-pill-row">
                  <span className="summary-pill">{workstationProfile?.platform ?? "macos"}</span>
                  <span className="summary-pill">{workstationProfile?.dry_run_daw ? "dry run" : "live execution"}</span>
                </div>
              </div>
            </div>
            <div className="panel-span-4">
              <div className="mini-card">
                <span className="metric-label">Session manifest preview</span>
                <strong>
                  {data.sessionManifestPreview ? `${data.sessionManifestPreview.stem_count} stems · ${data.sessionManifestPreview.reference_count} refs` : "preview unavailable"}
                </strong>
                <p className="panel-note">{data.sessionManifestPreview?.project_root ?? workspaceSettings.shared_paths.projects}</p>
                <div className="summary-pill-row">
                  <span className="summary-pill">
                    {data.sessionManifestPreview?.readiness.ready_for_planning ? "ready for planning" : "waiting for session data"}
                  </span>
                  {data.sessionManifestPreview ? <span className="summary-pill">{Math.round(data.sessionManifestPreview.readiness.confidence_score * 100)}% confidence</span> : null}
                </div>
              </div>
            </div>
            <div className="panel-span-4">
              <div className="mini-card">
                <span className="metric-label">Mix and listening previews</span>
                <strong>
                  {data.mixPlanPreview ? `${data.mixPlanPreview.phases.length} plan phases` : "plan unavailable"}
                </strong>
                <p className="panel-note">
                  {data.renderPlanPreview ? `${data.renderPlanPreview.profile_count} render profiles staged.` : "Render preview unavailable."}
                </p>
                <div className="summary-pill-row">
                  {(data.mixPlanPreview?.priorities ?? []).slice(0, 3).map((item: string) => (
                    <span key={item} className="summary-pill">
                      {item}
                    </span>
                  ))}
                  {data.executionPlanPreview ? <span className="summary-pill">{data.executionPlanPreview.ready_for_operator_review ? "operator review ready" : "blocked"}</span> : null}
                </div>
              </div>
            </div>
          </div>
          <div className="workspace-grid nested-grid top-gap">
            <div className="panel-span-4 table-stack">
              {(workstationProfile?.daws ?? []).length ? (
                workstationProfile.daws.map((daw: any) => (
                  <div key={daw.slug} className="table-row">
                    <div className="row-main">
                      <strong>{daw.slug}</strong>
                      <div className="muted">{daw.notes}</div>
                      {daw.binary_path ? <div className="muted">{daw.binary_path}</div> : null}
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${daw.automation_ready ? "ok" : daw.installed ? "warn" : "bad"}`}>
                        {daw.automation_ready ? "automation ready" : daw.installed ? "installed" : "missing"}
                      </span>
                      <span className="muted">{daw.execution_mode}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No workstation profile yet" detail="The control plane can still build plans before a real DAW node is attached." />
              )}
            </div>
            <div className="panel-span-4 table-stack">
              {data.sessionManifestPreview ? (
                <>
                  <div className="table-row">
                    <div className="row-main">
                      <strong>{data.sessionManifestPreview.session_details.session_type}</strong>
                      <div className="muted">
                        {data.sessionManifestPreview.session_details.track_count} tracks · {data.sessionManifestPreview.session_details.marker_count} markers
                      </div>
                      <div className="muted">{data.sessionManifestPreview.session_details.primary_session_file ?? "No primary session file yet."}</div>
                    </div>
                  </div>
                  {data.sessionManifestPreview.session_details.track_names.slice(0, 4).map((name: string) => (
                    <div key={name} className="table-row">
                      <div className="row-main">
                        <strong>{name}</strong>
                        <div className="muted">Session track</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <EmptyState title="Session preview unavailable" detail="Session introspection will appear here once a DAW session file is reachable." />
              )}
            </div>
            <div className="panel-span-4 table-stack">
              {data.mixPlanPreview ? (
                <>
                  {data.mixPlanPreview.phases.map((phase: any) => (
                    <div key={phase.slug} className="table-row">
                      <div className="row-main">
                        <strong>{phase.title}</strong>
                        <div className="muted">{phase.actions.join(" · ")}</div>
                      </div>
                    </div>
                  ))}
                  {(data.mixPlanPreview.dependency_warnings ?? []).map((warning: any) => (
                    <div key={warning.slug} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{warning.slug}</strong>
                        <div className="muted">{warning.detail}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${warning.severity === "warn" ? "warn" : "muted"}`}>{warning.severity}</span>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <EmptyState title="Mix-plan preview unavailable" detail="Mix-plan previews will appear here once the worker preview endpoint is reachable." />
              )}
            </div>
            <div className="panel-span-4 table-stack">
              {data.renderPlanPreview ? (
                <>
                  {data.renderPlanPreview.profiles.map((profile: any) => (
                    <div key={profile.slug} className="table-row">
                      <div className="row-main">
                        <strong>{profile.label}</strong>
                        <div className="muted">{profile.filename}</div>
                        <div className="muted">{profile.sample_rate} Hz · {profile.bit_depth}-bit · {profile.target}</div>
                        <div className="muted">{profile.review_gate ?? "internal-review"} · {profile.qc_required ? "qc required" : "qc optional"} · {profile.listening_required ? "listening required" : "listening optional"}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${profile.slug === data.renderPlanPreview?.review_candidate_slug ? "ok" : "muted"}`}>
                          {profile.slug === data.renderPlanPreview?.review_candidate_slug ? "candidate" : "supporting"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {selectedProject?.id ? (
                    <div className="action-row">
                      <button className="action-button btn" type="button" disabled={reviewSavePending === "render"} onClick={saveRenderReview}>
                        {reviewSavePending === "render" ? "saving" : "save render review"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState title="Render preview unavailable" detail="Render profiles will appear here once preview generation is available." />
              )}
            </div>
            <div className="panel-span-4 table-stack">
              {data.listeningReportPreview ? (
                <>
                  <div className="table-row">
                    <div className="row-main">
                      <strong>Listening summary</strong>
                      <div className="muted">
                        {data.listeningReportPreview.summary.qc_hard_fail_count} hard fails · {data.listeningReportPreview.summary.qc_warning_count} warnings
                      </div>
                      <div className="muted">Reference alignment: {data.listeningReportPreview.summary.reference_alignment}</div>
                      {(data.listeningReportPreview.summary.focus_flags ?? []).length ? (
                        <div className="summary-pill-row top-gap">
                          {(data.listeningReportPreview.summary.focus_flags ?? []).map((flag: string) => <span key={flag} className="summary-pill">{flag}</span>)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {data.listeningReportPreview.checks.map((check: any) => (
                    <div key={check.slug} className="table-row">
                      <div className="row-main">
                        <strong>{check.slug}</strong>
                        <div className="muted">{check.detail}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${check.status === "attention" ? "bad" : "warn"}`}>{check.status}</span>
                      </div>
                    </div>
                  ))}
                  {selectedProject?.id ? (
                    <div className="action-row">
                      <button className="action-button btn" type="button" disabled={reviewSavePending === "listening"} onClick={saveListeningReview}>
                        {reviewSavePending === "listening" ? "saving" : "save listening review"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState title="Listening preview unavailable" detail="Listening heuristics will appear here once preview generation is available." />
              )}
            </div>
            <div className="panel-span-4 table-stack">
              {data.executionPlanPreview ? (
                <>
                  <div className="table-row">
                    <div className="row-main">
                      <strong>Execution plan</strong>
                      <div className="muted">{data.executionPlanPreview.recommended_next_step}</div>
                      <div className="muted">
                        {data.executionPlanPreview.blockers.length ? data.executionPlanPreview.blockers.join(" · ") : "No blocking conditions in preview mode."}
                      </div>
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${data.executionPlanPreview.ready_for_operator_review ? "ok" : "warn"}`}>
                        {data.executionPlanPreview.ready_for_operator_review ? "review ready" : "blocked"}
                      </span>
                    </div>
                  </div>
                  {data.executionPlanPreview.phases.map((phase: any) => (
                    <div key={phase.slug} className="table-row">
                      <div className="row-main">
                        <strong>{phase.title}</strong>
                        <div className="muted">{phase.summary}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${phase.status === "ready" ? "ok" : phase.status === "watch" ? "warn" : "bad"}`}>{phase.status}</span>
                      </div>
                    </div>
                  ))}
                  {(data.executionPlanPreview.dependency_warnings ?? []).map((warning: any) => (
                    <div key={warning.slug} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{warning.slug}</strong>
                        <div className="muted">{warning.detail}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${warning.severity === "warn" ? "warn" : "muted"}`}>{warning.severity}</span>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <EmptyState title="Execution preview unavailable" detail="Execution-loop posture will appear here once all DAW preview surfaces are reachable." />
              )}
            </div>
          </div>
          </CollapsibleSection>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-8">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Topology</p>
              <h2 className="t-h2">Service Ownership Map</h2>
            </div>
            <span className="count-pill">{data.services.length} services</span>
          </div>
          <div className="zone-stack">
            {serviceZones.map(([zone, services]: [string, any[]]) => (
              <section key={zone} className={`zone-card zone-${zoneAccent(zone)}`}>
                <div className="zone-header">
                  <div>
                    <h3>{zone}</h3>
                    <p>{zoneDescriptions[zone]}</p>
                  </div>
                  <span className="count-pill">{services.filter((service) => service.state === "healthy").length}/{services.length}</span>
                </div>
                <div className="table-stack">
                  {services.map((service) => (
                    <button
                      key={service.key}
                      type="button"
                      className={`table-row service-row service-button ${selectedService?.key === service.key ? "is-selected" : ""}`}
                      onClick={() => setSelectedServiceKey(service.key)}
                    >
                      <div className="row-main">
                        <strong>{service.name}</strong>
                        <div className="muted">{service.role}</div>
                        <div className="meta-inline">
                          <span>{service.note}</span>
                          <span>{service.optional ? "optional execution surface" : "proxied through the control room"}</span>
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${service.optional && service.state === "offline" ? "warn" : statusTone(service.state)}`}>
                          {serviceLabel(service)}
                        </span>
                        <span className="muted">{service.detail}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>

        <aside className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker t-kicker">Inspector</p>
              <h2 className="t-h2">Service Drilldown</h2>
            </div>
            <span className={`status-pill ${selectedService ? statusTone(selectedService.state) : "warn"}`}>
              {selectedService ? serviceLabel(selectedService) : "none"}
            </span>
          </div>
          {selectedService ? (
            <div className="service-inspector">
              <div className={`mini-card service-identity-card module-${zoneAccent(selectedService.zone)}`}>
                <span className="metric-label">{selectedService.zone}</span>
                <strong>{selectedService.name}</strong>
                <p className="panel-note">{selectedService.role}</p>
                <div className="meta-inline">
                  <span>{selectedService.note}</span>
                  <span>managed in {serviceManagedIn(selectedService)}</span>
                </div>
              </div>
              <div className="mini-card">
                <span className="metric-label">Recommended next move</span>
                <strong>{servicePrimaryTab(selectedService)}</strong>
                <p className="panel-note">{serviceRecommendedAction(selectedService)}</p>
              </div>
              <div className="mini-card">
                <span className="metric-label">Dependencies</span>
                <div className="summary-pill-row">
                  {serviceDependencyHints(selectedService).map((item: string) => (
                    <span key={item} className="summary-pill">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mini-card">
                <div className="panel-header compact-header">
                  <div>
                    <span className="metric-label">Live status</span>
                    <strong>{selectedServiceStatusState === "loading" ? "loading" : "service snapshot"}</strong>
                  </div>
                  <span className={`status-pill ${selectedServiceStatusState === "error" ? "bad" : selectedServiceStatusState === "ready" ? "ok" : "warn"}`}>
                    {selectedServiceStatusState}
                  </span>
                </div>
                {selectedServiceHighlights.length ? (
                  <div className="status-key-grid">
                    {selectedServiceHighlights.map((item: any) => (
                      <div key={item.label} className="status-key-card">
                        <span className="metric-label">{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : selectedServiceStatusState === "loading" ? (
                  <LoadingSkeleton rows={3} />
                ) : (
                  <p className="panel-note">No detailed service payload is available for this module yet.</p>
                )}
              </div>
              {serviceSettingsSummary(selectedService, moduleSettings).length ? (
                <div className="mini-card">
                  <span className="metric-label">Saved tuning</span>
                  <div className="summary-pill-row">
                    {serviceSettingsSummary(selectedService, moduleSettings).map((item: string) => (
                      <span key={item} className="summary-pill">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="action-deck">
                <button
                  className="action-button btn ok"
                  type="button"
                  onClick={() => setActiveTab(servicePrimaryTab(selectedService))}
                >
                  open {primaryTabs.find((tab: any) => tab.id === servicePrimaryTab(selectedService))?.label.toLowerCase()}
                </button>
                <button className="action-button btn" type="button" onClick={() => refreshData()}>
                  refresh state
                </button>
                <button className="action-button btn" type="button" onClick={() => copyServiceField(selectedServiceProxyUrl, `${selectedService.name} URL`)}>
                  copy url
                </button>
                <button
                  className="action-button btn"
                  type="button"
                  onClick={() => copyServiceField(selectedService.healthUrl, `${selectedService.name} health path`)}
                >
                  copy health path
                </button>
              </div>
              {serviceInspectorMessage ? <p className="feedback ok">{serviceInspectorMessage}</p> : null}
              {serviceInspectorError ? <p className="feedback bad">{serviceInspectorError}</p> : null}
            </div>
          ) : null}
          <div className="divider" />
          <div className="panel-header compact-header">
            <div>
              <p className="section-kicker t-kicker">Platform Actions</p>
              <h2 className="t-h2">Safe Operator Controls</h2>
            </div>
          </div>
          <div className="table-stack">
            <div className="table-row">
              <div className="row-main">
                <strong>Refresh control room</strong>
                <div className="muted">Re-poll the full stack and re-evaluate service health and readiness.</div>
              </div>
              <div className="row-meta">
                <button className="action-button btn" type="button" onClick={() => refreshData()}>
                  refresh
                </button>
              </div>
            </div>
            <div className="table-row">
              <div className="row-main">
                <strong>Test alert routing</strong>
                <div className="muted">Verify email and webhook alert delivery without waiting for a real incident.</div>
              </div>
              <div className="row-meta">
                <button className="action-button btn" type="button" disabled={alertActionPending !== null} onClick={() => runAlertAction("test")}>
                  {alertActionPending === "test" ? "testing" : "test alert"}
                </button>
              </div>
            </div>
            <div className="table-row">
              <div className="row-main">
                <strong>Reseed defaults</strong>
                <div className="muted">Reapply starter rules, starter packs, and shipped playbooks.</div>
              </div>
              <div className="row-meta">
                <button className="action-button btn" type="button" disabled={maintenancePending !== null} onClick={reseedAutomationDefaults}>
                  {maintenancePending === "reseed" ? "reseeding" : "reseed"}
                </button>
              </div>
            </div>
            <div className="table-row">
              <div className="row-main">
                <strong>Edit workspace</strong>
                <div className="muted">Jump to Settings to update onboarding, deployment posture, context, and worker config.</div>
              </div>
              <div className="row-meta">
                <button className="action-button btn ok" type="button" onClick={() => setActiveTab("settings")}>
                  settings
                </button>
              </div>
            </div>
          </div>
          {maintenanceMessage ? <p className="feedback ok">{maintenanceMessage}</p> : null}
          {maintenanceError ? <p className="feedback bad">{maintenanceError}</p> : null}
          {alertActionMessage ? <p className="feedback ok">{alertActionMessage}</p> : null}
          {alertActionError ? <p className="feedback bad">{alertActionError}</p> : null}
          <div className="divider" />
          <div className="panel-header compact-header">
            <div>
              <p className="section-kicker t-kicker">Support Surface</p>
              <h2 className="t-h2">Stack Fabric</h2>
            </div>
          </div>
          <div className="support-stack">
            {supportSurface.map((item: any) => (
              <div key={item.name} className="support-card">
                <strong>{item.name}</strong>
                <div className="muted">{item.detail}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
