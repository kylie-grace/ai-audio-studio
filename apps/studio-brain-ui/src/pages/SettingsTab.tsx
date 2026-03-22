import { AlertBanner } from "../components/AlertBanner";

const MODULE_FIELD_LABELS: Record<string, string> = {
  response_sla_hours: "Response SLA (hours)",
  confidence_threshold: "Confidence threshold",
  minimum_fit_score: "Minimum fit score",
  high_priority_types: "High-priority types",
  default_target: "Default target",
  max_rounds: "Maximum rounds",
};

type SettingsTabProps = {
  data: any;
  onboardingRequired: boolean;
  onboardingMissingCount: number;
  editingWorkspaceSetup: boolean;
  setEditingWorkspaceSetup: (value: boolean) => void;
  workspaceSettings: any;
  workspaceDraft: any;
  setWorkspaceDraft: (updater: (current: any) => any) => void;
  settingsSection: string;
  setSettingsSection: (value: any) => void;
  settingsSections: Array<{ id: string; label: string; summary: string }>;
  humanizeMissingField: (field: string) => string;
  connectionCenter: any[];
  settingsPills: string[];
  onboardingStepCount: number;
  refreshData: () => void;
  saveWorkspaceSettings: () => void;
  onboardingSaving: boolean;
  onboardingMessage: string | null;
  onboardingError: string | null;
  frontDoorUrl: string;
  frontDoorMode: string;
  integrationReadinessLabel: string;
  alertEmailCount: number;
  workerPostureLabel: string;
  moduleEnabledCount: number;
  moduleSettings: any;
  styleSourceCount: number;
  integrationFlags: number;
  styleRescanPending: boolean;
  rescanStyleSources: () => void;
  parseDelimitedList: (value: string) => string[];
  setOperatorName: (value: string) => void;
};

function SettingsSectionIntro({ section }: { section?: { label: string; summary: string } }) {
  return (
    <div className="settings-editor-summary">
      <div>
        <p className="section-kicker t-kicker">Editor</p>
        <h3>{section?.label}</h3>
        <p className="panel-note">{section?.summary}</p>
      </div>
    </div>
  );
}

export function SettingsTab(props: SettingsTabProps) {
  const {
    data,
    onboardingRequired,
    onboardingMissingCount,
    editingWorkspaceSetup,
    setEditingWorkspaceSetup,
    workspaceSettings,
    workspaceDraft,
    setWorkspaceDraft,
    settingsSection,
    setSettingsSection,
    settingsSections,
    humanizeMissingField,
    connectionCenter,
    settingsPills,
    onboardingStepCount,
    refreshData,
    saveWorkspaceSettings,
    onboardingSaving,
    onboardingMessage,
    onboardingError,
    frontDoorUrl,
    frontDoorMode,
    integrationReadinessLabel,
    alertEmailCount,
    workerPostureLabel,
    moduleEnabledCount,
    moduleSettings,
    styleSourceCount,
    integrationFlags,
    styleRescanPending,
    rescanStyleSources,
    parseDelimitedList,
    setOperatorName,
  } = props;

  const activeSection = settingsSections.find((section) => section.id === settingsSection);

  return (
    <div className="tab-panel">
      <section className={`panel onboarding-panel ${onboardingRequired ? "needs-setup" : "is-complete"}`}>
        <div className="panel-header onboarding-header">
          <div>
            <p className="section-kicker t-kicker">Bootstrap</p>
            <h2 className="t-h2">Workspace settings</h2>
            <p className="panel-note">Keep onboarding, integrations, storage, and worker posture visible. Edit them in a dedicated setup sheet instead of inline.</p>
          </div>
          <div className="onboarding-header-actions">
            <span className={`status-pill ${onboardingRequired ? "warn" : "ok"}`}>{onboardingRequired ? `${onboardingMissingCount} items missing` : "configured"}</span>
            <button
              className="action-button btn ok"
              type="button"
              onClick={() => {
                setEditingWorkspaceSetup(true);
                setWorkspaceDraft(() => workspaceSettings);
                setSettingsSection("identity");
              }}
            >
              {onboardingRequired ? "continue setup" : "edit setup"}
            </button>
          </div>
        </div>

        <div className="settings-snapshot-grid">
          <article className="snapshot-card">
            <span className="metric-label">Saved workspace</span>
            <strong>{workspaceSettings.studio_name || "Unnamed studio"}</strong>
            <p>{workspaceSettings.operator_name || "owner"} · {workspaceSettings.host_machine_type} · {workspaceSettings.deployment_mode === "control_plane_plus_worker" ? "control plane + worker" : "single machine"}</p>
          </article>
          <article className="snapshot-card">
            <span className="metric-label">LAN front door</span>
            <strong>{frontDoorUrl}</strong>
            <p>{frontDoorMode}</p>
          </article>
          <article className="snapshot-card">
            <span className="metric-label">Operator front door</span>
            <strong>{workspaceSettings.public_base_url || frontDoorUrl}</strong>
            <p>{workspaceSettings.https_mode.replace(/_/g, " ")}</p>
          </article>
          <article className="snapshot-card">
            <span className="metric-label">Readiness</span>
            <strong>{integrationReadinessLabel}</strong>
            <p>{data.workspace.style_profile_count} style profile(s) · {styleSourceCount} reference file(s)</p>
          </article>
          <article className="snapshot-card">
            <span className="metric-label">Integrations</span>
            <strong>{alertEmailCount} alert destination(s)</strong>
            <p>{workerPostureLabel}</p>
          </article>
          <article className="snapshot-card">
            <span className="metric-label">Module posture</span>
            <strong>{moduleEnabledCount}/{Object.keys(moduleSettings).length} enabled</strong>
            <p>Persisted tuning now drives live service behavior and automation access.</p>
          </article>
        </div>

        <div className="settings-snapshot-grid top-gap">
          {connectionCenter.map((connection) => (
            <article key={connection.slug} className="snapshot-card">
              <div className="panel-header compact-header">
                <div>
                  <span className="metric-label">{connection.name}</span>
                  <strong>{connection.kind.replace(/-/g, " ")}</strong>
                </div>
                <span className={`status-pill ${connection.status === "ready" ? "ok" : connection.status === "needs-attention" ? "bad" : "warn"}`}>{connection.status}</span>
              </div>
              <p className="panel-note">{connection.detail}</p>
              {connection.target ? <p className="muted">{connection.target}</p> : null}
              <div className="summary-pill-row top-gap">
                {connection.required_fields.slice(0, 3).map((field: string) => (
                  <span key={field} className="summary-pill">{humanizeMissingField(field)}</span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="onboarding-actions-bar">
          <div className="summary-pill-row onboarding-steps-row">
            {settingsPills.map((pill) => (
              <span key={pill} className="summary-pill">{pill}</span>
            ))}
            <span className="summary-pill">{onboardingStepCount} steps</span>
          </div>
          <div className="onboarding-actions">
            <button className="action-button btn subtle" type="button" onClick={refreshData}>refresh workspace</button>
          </div>
        </div>

        <div className="settings-summary-layout">
          <article className="mini-card settings-summary-card">
            <span className="metric-label">Saved deployment posture</span>
            <strong>{workspaceSettings.deployment_mode === "control_plane_plus_worker" ? "control plane + worker" : "single machine"}</strong>
            <p className="panel-note">{workspaceSettings.public_base_url || frontDoorUrl}</p>
            <div className="summary-pill-row">
              <span className="summary-pill">{workspaceSettings.https_mode.replace(/_/g, " ")}</span>
              <span className="summary-pill">{workspaceSettings.operator_name || "owner"}</span>
              <span className="summary-pill">{workerPostureLabel}</span>
            </div>
          </article>
          <article className="mini-card settings-summary-card">
            <span className="metric-label">Shared paths</span>
            <strong>{workspaceSettings.shared_paths.projects}</strong>
            <p className="panel-note">Drafts: {workspaceSettings.shared_paths.draft_queue}</p>
            <p className="panel-note">Approvals: {workspaceSettings.shared_paths.approval_queue}</p>
          </article>
          <article className="mini-card settings-summary-card">
            <span className="metric-label">Style and alert posture</span>
            <strong>{workspaceSettings.style_seed.name || "Default Studio Tone"}</strong>
            <p className="panel-note">{alertEmailCount} email destination(s) · {integrationFlags} integrations enabled</p>
            <div className="action-row">
              <button className="action-button btn subtle" type="button" disabled={styleRescanPending} onClick={rescanStyleSources}>
                {styleRescanPending ? "rescanning" : "rescan style sources"}
              </button>
            </div>
          </article>
        </div>

        {onboardingMessage ? <AlertBanner tone="ok" title="Workspace saved" detail={onboardingMessage} /> : null}
        {onboardingError ? <AlertBanner tone="bad" title="Unable to save settings" detail={onboardingError} /> : null}
      </section>

      {editingWorkspaceSetup || onboardingRequired ? (
        <div className="settings-modal-backdrop" onClick={() => !onboardingRequired && setEditingWorkspaceSetup(false)}>
          <section className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-modal-header">
              <div>
                <p className="section-kicker t-kicker">Setup editor</p>
                <h2 className="t-h2">{onboardingRequired ? "Finish onboarding" : "Edit saved setup"}</h2>
                <p className="panel-note">Work through identity, storage, voice, integrations, worker posture, and module tuning in a dedicated sheet.</p>
              </div>
              <div className="settings-modal-actions">
                {!onboardingRequired ? (
                  <button className="action-button btn subtle" type="button" onClick={() => setEditingWorkspaceSetup(false)}>
                    close
                  </button>
                ) : null}
                <button className="action-button btn ok" type="button" disabled={onboardingSaving} onClick={saveWorkspaceSettings}>
                  {onboardingSaving ? "saving" : "save settings"}
                </button>
              </div>
            </div>

            <div className="settings-modal-body">
              <aside className="settings-sheet-sidebar">
                <div className="settings-section-nav" role="tablist" aria-label="Settings sections">
                  {settingsSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`settings-section-button ${settingsSection === section.id ? "is-active" : ""}`}
                      onClick={() => setSettingsSection(section.id)}
                    >
                      <span className="tab-label">{section.label}</span>
                      <span className="tab-summary">{section.summary}</span>
                    </button>
                  ))}
                </div>
                <div className="summary-pill-row top-gap">
                  {data.workspace.missing_fields.slice(0, 6).map((field: string) => (
                    <span key={field} className="summary-pill">{humanizeMissingField(field)}</span>
                  ))}
                  {!data.workspace.missing_fields.length ? <span className="summary-pill">no required gaps</span> : null}
                </div>
              </aside>

              <div className="settings-sheet-content">
                <SettingsSectionIntro section={activeSection} />

                {settingsSection === "identity" ? (
                  <div className="onboarding-grid">
                    <article className="mini-card">
                      <span className="metric-label">Studio identity</span>
                      <label className="field">
                        <span className="metric-label">Studio name</span>
                        <input value={workspaceDraft.studio_name} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, studio_name: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span className="metric-label">Deployment mode</span>
                        <select
                          value={workspaceDraft.deployment_mode}
                          onChange={(event) =>
                            setWorkspaceDraft((current: any) => ({
                              ...current,
                              deployment_mode: event.target.value,
                              worker: { ...current.worker, enabled: event.target.value === "control_plane_plus_worker" },
                            }))}
                        >
                          <option value="single_machine">Single machine</option>
                          <option value="control_plane_plus_worker">Control plane + worker</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="metric-label">Host machine</span>
                        <select value={workspaceDraft.host_machine_type} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, host_machine_type: event.target.value }))}>
                          <option value="mac-mini">Mac mini</option>
                          <option value="mac-studio">Mac Studio</option>
                          <option value="macbook-pro">MacBook Pro</option>
                          <option value="windows-pc">Windows PC</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="metric-label">Primary operator</span>
                        <input
                          value={workspaceDraft.operator_name}
                          onChange={(event) => {
                            const nextName = event.target.value;
                            setWorkspaceDraft((current: any) => ({ ...current, operator_name: nextName }));
                            setOperatorName(nextName);
                          }}
                        />
                      </label>
                    </article>

                    <article className="mini-card">
                      <span className="metric-label">Front door</span>
                      <label className="field">
                        <span className="metric-label">Public front door</span>
                        <input value={workspaceDraft.public_base_url} placeholder={frontDoorUrl} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, public_base_url: event.target.value }))} />
                      </label>
                      <label className="field">
                        <span className="metric-label">HTTPS mode</span>
                        <select value={workspaceDraft.https_mode} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, https_mode: event.target.value }))}>
                          <option value="local_http">LAN HTTP</option>
                          <option value="https_enabled">HTTPS on this stack</option>
                          <option value="https_terminated_elsewhere">HTTPS terminated upstream</option>
                        </select>
                      </label>
                      <div className="mini-inline-note">
                        <span>Live LAN view</span>
                        <strong>{frontDoorUrl}</strong>
                      </div>
                    </article>
                  </div>
                ) : null}

                {settingsSection === "storage" ? (
                  <article className="mini-card">
                    <span className="metric-label">Shared paths</span>
                    {(["projects", "deliveries", "draft_queue", "approval_queue", "incoming_stems"] as const).map((pathKey) => (
                      <label key={pathKey} className="field">
                        <span className="metric-label">{pathKey.replace(/_/g, " ")}</span>
                        <input
                          value={workspaceDraft.shared_paths[pathKey]}
                          onChange={(event) =>
                            setWorkspaceDraft((current: any) => ({
                              ...current,
                              shared_paths: { ...current.shared_paths, [pathKey]: event.target.value },
                            }))}
                        />
                      </label>
                    ))}
                  </article>
                ) : null}

                {settingsSection === "voice" ? (
                  <article className="mini-card">
                    <span className="metric-label">Style and tone</span>
                    <label className="field">
                      <span className="metric-label">Style profile name</span>
                      <input value={workspaceDraft.style_seed.name} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, style_seed: { ...current.style_seed, name: event.target.value } }))} />
                    </label>
                    <label className="field">
                      <span className="metric-label">Tone and voice seed</span>
                      <textarea
                        value={workspaceDraft.style_seed.raw_text}
                        placeholder="How should this studio sound in email, content, and client-facing drafts?"
                        onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, style_seed: { ...current.style_seed, raw_text: event.target.value } }))}
                      />
                    </label>
                    <label className="field">
                      <span className="metric-label">Reference files</span>
                      <textarea
                        value={workspaceDraft.style_seed.source_paths.join("\n")}
                        placeholder="/path/to/brand-guide.txt"
                        onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, style_seed: { ...current.style_seed, source_paths: parseDelimitedList(event.target.value) } }))}
                      />
                    </label>
                    <button className="action-button btn subtle" type="button" disabled={styleRescanPending} onClick={rescanStyleSources}>
                      {styleRescanPending ? "rescanning" : "rescan saved sources"}
                    </button>
                  </article>
                ) : null}

                {settingsSection === "integrations" ? (
                  <article className="mini-card">
                    <span className="metric-label">Alerts and integrations</span>
                    <label className="field">
                      <span className="metric-label">Alert emails</span>
                      <textarea value={workspaceDraft.alert_destinations.email_to.join("\n")} placeholder="ops@studio.com" onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, alert_destinations: { ...current.alert_destinations, email_to: parseDelimitedList(event.target.value) } }))} />
                    </label>
                    <label className="field">
                      <span className="metric-label">Alert webhook</span>
                      <input value={workspaceDraft.alert_destinations.webhook_url} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, alert_destinations: { ...current.alert_destinations, webhook_url: event.target.value } }))} />
                    </label>
                    <div className="integration-guidance-list">
                      {([
                        ["n8n", "n8n", "Keep this on when the workflow editor should receive starter packs and webhook traffic."],
                        ["gmail_readonly", "Gmail read-only", "Turn this on only after Gmail intake credentials are connected in the connection center."],
                        ["gmail_send", "Gmail send", "Turn this on only after Gmail send OAuth is configured for approval routing."],
                        ["instagram", "Instagram", "Enable after Meta credentials are connected for social publishing."],
                        ["facebook", "Facebook", "Enable after Meta credentials are connected for page publishing."],
                      ] as const).map(([key, label, detail]) => (
                        <label key={key} className="toggle-card">
                          <div>
                            <strong>{label}</strong>
                            <p className="panel-note">{detail}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={workspaceDraft.integrations[key]}
                            onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, integrations: { ...current.integrations, [key]: event.target.checked } }))}
                          />
                        </label>
                      ))}
                    </div>
                  </article>
                ) : null}

                {settingsSection === "worker" ? (
                  <article className="mini-card">
                    <span className="metric-label">Optional worker</span>
                    <label className="toggle-card">
                      <div>
                        <strong>Enable worker configuration</strong>
                        <p className="panel-note">Turn this on when the control plane should route DAW work to a local or remote worker node.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={workspaceDraft.worker.enabled}
                        onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, enabled: event.target.checked }, deployment_mode: event.target.checked ? "control_plane_plus_worker" : "single_machine" }))}
                      />
                    </label>

                    {workspaceDraft.worker.enabled ? (
                      <div className="onboarding-grid top-gap">
                        <label className="field">
                          <span className="metric-label">Worker slug</span>
                          <input value={workspaceDraft.worker.worker_slug} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, worker_slug: event.target.value } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Worker API URL</span>
                          <input value={workspaceDraft.worker.worker_api_base_url} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, worker_api_base_url: event.target.value } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Display name</span>
                          <input value={workspaceDraft.worker.display_name} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, display_name: event.target.value } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Default DAW</span>
                          <select value={workspaceDraft.worker.default_daw} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, default_daw: event.target.value } }))}>
                            <option value="reaper">Reaper</option>
                            <option value="protools">Pro Tools</option>
                            <option value="wavelab">WaveLab</option>
                          </select>
                        </label>
                        <label className="toggle-card">
                          <div>
                            <strong>Dry-run DAW execution</strong>
                            <p className="panel-note">Keep this enabled until the worker has passed validation on the real workstation.</p>
                          </div>
                          <input type="checkbox" checked={workspaceDraft.worker.dry_run_daw} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, dry_run_daw: event.target.checked } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Supported DAWs</span>
                          <input value={workspaceDraft.worker.supported_daws.join(", ")} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, supported_daws: parseDelimitedList(event.target.value) } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Adapter capabilities</span>
                          <input value={workspaceDraft.worker.adapter_capabilities.join(", ")} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, adapter_capabilities: parseDelimitedList(event.target.value) } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Reaper binary path</span>
                          <input value={workspaceDraft.worker.reaper_binary_path} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, reaper_binary_path: event.target.value } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Pro Tools app path</span>
                          <input value={workspaceDraft.worker.protools_app_path} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, protools_app_path: event.target.value } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">SoundFlow CLI path</span>
                          <input value={workspaceDraft.worker.soundflow_cli_path} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, soundflow_cli_path: event.target.value } }))} />
                        </label>
                        <label className="field">
                          <span className="metric-label">Operator notes</span>
                          <textarea value={workspaceDraft.worker.notes} rows={4} onChange={(event) => setWorkspaceDraft((current: any) => ({ ...current, worker: { ...current.worker, notes: event.target.value } }))} />
                        </label>
                      </div>
                    ) : (
                      <div className="mini-inline-note top-gap">
                        <span>Worker disabled</span>
                        <strong>The control plane will run as a single machine until a worker node is enabled.</strong>
                      </div>
                    )}
                  </article>
                ) : null}

                {settingsSection === "modules" ? (
                  <article className="mini-card module-settings-card">
                    <span className="metric-label">Module tuning</span>
                    <div className="module-settings-grid">
                      {([
                        { moduleKey: "lead_intake", label: "Lead intake", primaryField: "minimum_fit_score", secondaryField: "response_sla_hours" },
                        { moduleKey: "inbox_triage", label: "Inbox triage", primaryField: "high_priority_types" },
                        { moduleKey: "content_pipeline", label: "Content pipeline", primaryField: "default_platforms" },
                        { moduleKey: "audio_qc", label: "Audio QC", primaryField: "default_target" },
                        { moduleKey: "revision_parser", label: "Revision parser", primaryField: "default_daw", secondaryField: "confidence_threshold" },
                        { moduleKey: "mix_planner", label: "Mix planner", primaryField: "default_focus" },
                      ] as Array<{ moduleKey: string; label: string; primaryField: string; secondaryField?: string }>).map(({ moduleKey, label, primaryField, secondaryField }) => {
                        const moduleValue = workspaceDraft.module_settings[moduleKey];
                        return (
                          <div key={moduleKey} className="module-setting-block">
                            <div className="module-setting-head">
                              <strong>{label}</strong>
                              <label className="toggle-chip">
                                <input
                                  type="checkbox"
                                  checked={moduleValue.enabled}
                                  onChange={(event) =>
                                    setWorkspaceDraft((current: any) => ({
                                      ...current,
                                      module_settings: {
                                        ...current.module_settings,
                                        [moduleKey]: { ...current.module_settings[moduleKey], enabled: event.target.checked },
                                      },
                                    }))}
                                />
                                <span>enabled</span>
                              </label>
                            </div>
                            <div className="summary-pill-row">
                              <span className="summary-pill">{moduleValue.enabled ? "live" : "blocked"}</span>
                              <span className="summary-pill">{label}</span>
                            </div>
                            {moduleValue.enabled ? (
                              <>
                                {primaryField ? (
                                  <label className="field top-gap">
                                    <span className="metric-label">{MODULE_FIELD_LABELS[primaryField] ?? primaryField.replace(/_/g, " ")}</span>
                                    <input
                                      value={Array.isArray(moduleValue[primaryField]) ? moduleValue[primaryField].join(", ") : moduleValue[primaryField]}
                                      onChange={(event) =>
                                        setWorkspaceDraft((current: any) => ({
                                          ...current,
                                          module_settings: {
                                            ...current.module_settings,
                                            [moduleKey]: {
                                              ...current.module_settings[moduleKey],
                                              [primaryField]: Array.isArray(moduleValue[primaryField]) ? parseDelimitedList(event.target.value) : event.target.value,
                                            },
                                          },
                                        }))}
                                    />
                                  </label>
                                ) : null}
                                {secondaryField ? (
                                  <label className="field">
                                    <span className="metric-label">{MODULE_FIELD_LABELS[secondaryField] ?? secondaryField.replace(/_/g, " ")}</span>
                                    <input
                                      value={moduleValue[secondaryField]}
                                      onChange={(event) =>
                                        setWorkspaceDraft((current: any) => ({
                                          ...current,
                                          module_settings: {
                                            ...current.module_settings,
                                            [moduleKey]: {
                                              ...current.module_settings[moduleKey],
                                              [secondaryField]: Number.isFinite(Number(moduleValue[secondaryField])) ? Number(event.target.value) || 0 : event.target.value,
                                            },
                                          },
                                        }))}
                                    />
                                  </label>
                                ) : null}
                              </>
                            ) : (
                              <p className="panel-note">Enable this module to configure its tuning fields.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ) : null}
              </div>
            </div>

            <div className="onboarding-footer">
              <div className="missing-list">
                <span className="metric-label">Still missing</span>
                <strong>
                  {data.workspace.missing_fields.length ? data.workspace.missing_fields.map((field: string) => humanizeMissingField(field)).join(", ") : "Nothing required is missing."}
                </strong>
              </div>
              <div className="wizard-footer-actions">
                <button className="action-button btn subtle" disabled={onboardingSaving} onClick={refreshData}>refresh now</button>
                <button className="action-button btn ok" disabled={onboardingSaving} onClick={saveWorkspaceSettings}>
                  {onboardingSaving ? "saving" : "save settings"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
