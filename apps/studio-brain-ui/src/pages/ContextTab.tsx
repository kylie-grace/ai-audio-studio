import { useMemo, useState } from "react";

import { EmptyState } from "../components/EmptyState";

type ContextTabProps = {
  data: any;
  contextCards: Array<{ label: string; value: string; detail: string }>;
  latestStyleProfile: any;
  voicePreview: string;
  workspaceSettings: any;
  styleSourceCount: number;
  styleRescanPending: boolean;
  rescanStyleSources: () => void;
  workstationPlugins: any;
  workstationPluginsState: string;
  workstationProfile: any;
  selectedWorker: any;
  setSelectedWorkerSlug: (slug: string) => void;
  selectedProject: any;
  setSelectedProjectId: (id: string) => void;
  projectDetail: any;
  projectDetailState: string;
  artifactPreview: any;
  artifactPreviewState: string;
  artifactActionMessage: string | null;
  artifactActionError: string | null;
  previewArtifact: (projectId: string, artifactId: number) => void;
  copyArtifactValue: (value: string, label: string) => void;
  deliveryHistory: Array<any>;
  reviewSaveMessage: string | null;
  reviewSaveError: string | null;
  summarizeTime: (value: string) => string;
  fileLabel: (value?: string | null) => string;
  apiProjectStateBase: string;
  lufsTarget: number;
};

type ContextSectionId = "projects" | "voice" | "workstation";

function qcTone(value: number | null | undefined, kind: "truePeak" | "lufs", lufsTarget: number) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "muted";
  if (kind === "truePeak") {
    if (value > -1) return "bad";
    if (value > -3) return "warn";
    return "ok";
  }
  const distance = Math.abs(value - lufsTarget);
  if (distance > 2) return "bad";
  if (distance > 1) return "warn";
  return "ok";
}

function leadFitTone(score: number | null | undefined) {
  if (score === null || score === undefined) return "muted";
  if (score >= 75) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}

export function ContextTab(props: ContextTabProps) {
  const {
    data,
    contextCards,
    latestStyleProfile,
    voicePreview,
    workspaceSettings,
    styleSourceCount,
    styleRescanPending,
    rescanStyleSources,
    workstationPlugins,
    workstationPluginsState,
    workstationProfile,
    selectedWorker,
    setSelectedWorkerSlug,
    selectedProject,
    setSelectedProjectId,
    projectDetail,
    projectDetailState,
    artifactPreview,
    artifactPreviewState,
    artifactActionMessage,
    artifactActionError,
    previewArtifact,
    copyArtifactValue,
    deliveryHistory,
    reviewSaveMessage,
    reviewSaveError,
    summarizeTime,
    fileLabel,
    apiProjectStateBase,
    lufsTarget,
  } = props;

  const [section, setSection] = useState<ContextSectionId>("projects");

  const visibleProjects = useMemo(() => data.projects.slice(0, 10), [data.projects]);

  return (
    <div className="tab-panel">
      <section className="panel panel-span-12 context-shell">
        <div className="panel-header">
          <div>
            <p className="section-kicker">Context</p>
            <h2>Studio Knowledge</h2>
            <p className="panel-note">Switch between project review, studio voice, and workstation context instead of scrolling one mixed page.</p>
          </div>
        </div>
        <div className="context-subnav" role="tablist" aria-label="Context sections">
          {[
            { id: "projects", label: "Projects", detail: `${data.projects.length} active records` },
            { id: "voice", label: "Studio voice", detail: `${data.styleProfiles.length} profiles` },
            { id: "workstation", label: "Workstation", detail: `${data.workers.length} nodes` },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`context-subnav-button ${section === item.id ? "is-active" : ""}`}
              onClick={() => setSection(item.id as ContextSectionId)}
            >
              <span className="tab-label">{item.label}</span>
              <span className="tab-summary">{item.detail}</span>
            </button>
          ))}
        </div>
      </section>

      {section === "voice" ? (
        <>
          <section className="workspace-grid">
            <article className="panel panel-span-5">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Context</p>
                  <h2>Studio Context Board</h2>
                </div>
                <span className="count-pill">{data.styleProfiles.length} profiles</span>
              </div>
              <div className="context-card-grid">
                {contextCards.map((card) => (
                  <div key={card.label} className="snapshot-card">
                    <span className="metric-label">{card.label}</span>
                    <strong>{card.value}</strong>
                    <p>{card.detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel panel-span-7">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Voice</p>
                  <h2>Style Profiles</h2>
                </div>
                <div className="header-actions">
                  <span className="count-pill">{data.styleProfiles.length}</span>
                  <button className="action-button" type="button" disabled={styleRescanPending} onClick={rescanStyleSources}>
                    {styleRescanPending ? "rescanning" : "rescan style sources"}
                  </button>
                </div>
              </div>
              <div className="table-stack">
                {data.styleProfiles.length ? (
                  data.styleProfiles.slice(0, 8).map((profile: any) => (
                    <div key={profile.id} className="table-row">
                      <div className="row-main">
                        <strong>{profile.name}</strong>
                        <div className="muted">{profile.scope} · {profile.source_type}</div>
                        <div className="muted">
                          {profile.extracted_guidance?.summary ?? "No guidance summary extracted yet. Add seed text or rescan saved source files."}
                        </div>
                        <div className="meta-inline">
                          <span>updated {profile.updated_at ? summarizeTime(profile.updated_at) : "n/a"}</span>
                          {profile.extracted_guidance?.tone_markers?.slice(0, 3).map((marker: string) => (
                            <span key={`${profile.id}-${marker}`}>{marker}</span>
                          ))}
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className="status-pill ok">active context</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No style profiles yet" detail="Add a tone seed or rescan source files to build studio voice context." />
                )}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-7">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Knowledge</p>
                  <h2>Active Voice Preview</h2>
                </div>
                <span className="count-pill">{latestStyleProfile?.name ?? "seed only"}</span>
              </div>
              <div className="context-preview-card">
                <span className="metric-label">How the system will sound</span>
                <p className="context-preview-copy">{voicePreview}</p>
                <div className="summary-pill-row">
                  {(latestStyleProfile?.extracted_guidance?.preferred_phrases ?? workspaceSettings.style_seed.source_paths).slice(0, 6).map((item: string) => (
                    <span key={item} className="summary-pill">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            <article className="panel panel-span-5">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Source Feed</p>
                  <h2>Reference Inputs</h2>
                </div>
                <span className="count-pill">{styleSourceCount}</span>
              </div>
              <div className="table-stack">
                {workspaceSettings.style_seed.source_paths.length ? (
                  workspaceSettings.style_seed.source_paths.slice(0, 8).map((sourcePath: string) => (
                    <div key={sourcePath} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{sourcePath.split("/").pop() || sourcePath}</strong>
                        <div className="muted">{sourcePath}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No reference inputs saved" detail="Add style source files in Settings so the assistant can ground its drafts." />
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {section === "workstation" ? (
        <section className="workspace-grid">
          <article className="panel panel-span-4">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Execution</p>
                <h2>Worker Nodes</h2>
              </div>
              <span className="count-pill">{data.workers.length}</span>
            </div>
            <div className="segmented-list">
              {data.workers.map((worker: any) => (
                <button
                  key={worker.slug}
                  type="button"
                  className={`segment-button ${selectedWorker?.slug === worker.slug ? "is-active" : ""}`}
                  onClick={() => setSelectedWorkerSlug(worker.slug)}
                >
                  <span>{worker.display_name}</span>
                  <span className={`status-pill ${worker.status === "idle" ? "ok" : worker.status === "busy" ? "warn" : "muted"}`}>{worker.status}</span>
                </button>
              ))}
            </div>
            <div className="table-stack top-gap">
              <div className="table-row compact-row">
                <div className="row-main">
                  <strong>{workstationProfile?.platform ?? "worker unavailable"}</strong>
                  <div className="muted">{workstationProfile?.host ?? "No workstation profile loaded"}</div>
                </div>
              </div>
              <div className="summary-pill-row">
                {(workstationProfile?.blockers ?? []).slice(0, 4).map((blocker: string) => (
                  <span key={blocker} className="summary-pill warn">{blocker}</span>
                ))}
              </div>
            </div>
          </article>

          <article className="panel panel-span-8">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Inventory</p>
                <h2>Plugin Inventory</h2>
              </div>
              <span className="count-pill">{workstationPlugins?.plugin_count ?? workstationProfile?.plugins?.summary?.count ?? 0} plugins</span>
            </div>
            <div className="table-stack">
              {workstationPluginsState === "loading" ? <p className="empty-state">Loading plugin inventory…</p> : null}
              {workstationPlugins ? (
                <>
                  <div className="summary-pill-row">
                    {Object.entries(workstationPlugins.counts_by_format).map(([pluginFormat, count]) => (
                      <span key={pluginFormat} className="summary-pill">
                        {pluginFormat}: {count as number}
                      </span>
                    ))}
                  </div>
                  {workstationPlugins.plugins.slice(0, 14).map((plugin: any) => (
                    <div key={`${plugin.plugin_format}-${plugin.path}`} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{plugin.name}</strong>
                        <div className="muted">{plugin.vendor ?? "unknown vendor"} · {plugin.plugin_format}</div>
                        <div className="muted">{plugin.path}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${plugin.installed ? "ok" : "warn"}`}>{plugin.installed ? "installed" : "missing"}</span>
                      </div>
                    </div>
                  ))}
                  {!workstationPlugins.plugins.length ? <EmptyState title="No plugins discovered" detail="The selected workstation has no indexed plugins yet." /> : null}
                </>
              ) : null}
              {workstationPluginsState === "error" ? <EmptyState title="Plugin inventory unavailable" detail="The control plane could not load plugin data for the selected workstation." /> : null}
            </div>
          </article>
        </section>
      ) : null}

      {section === "projects" ? (
        <>
          <section className="workspace-grid">
            <article className="panel panel-span-4">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Projects</p>
                  <h2>Project List</h2>
                </div>
                <span className="count-pill">{data.projects.length}</span>
              </div>
              <div className="table-stack">
                {visibleProjects.length ? (
                  visibleProjects.map((project: any) => (
                    <button
                      key={project.id}
                      type="button"
                      className={`table-row service-button project-row ${selectedProject?.id === project.id ? "is-selected" : ""}`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <div className="row-main">
                        <strong>{project.client_name}</strong>
                        <div className="muted">{project.service_type}</div>
                        <div className="meta-inline">
                          <span>{project.status}</span>
                          {project.budget_signal && project.budget_signal !== "unknown" ? <span>budget: {project.budget_signal}</span> : null}
                          {project.timeline ? <span>{project.timeline}</span> : null}
                          {project.updated_at ? <span>updated {summarizeTime(project.updated_at)}</span> : null}
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${project.status === "active" ? "ok" : project.status === "complete" ? "muted" : "warn"}`}>{project.status}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState title="No projects yet" detail="Lead intake auto-creates projects after the first qualified inquiry." />
                )}
              </div>
            </article>

            <article className="panel panel-span-8">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Review</p>
                  <h2>Project Detail</h2>
                </div>
                <span className="count-pill">{projectDetail?.review_summary.artifact_count ?? projectDetail?.artifact_inventory.length ?? 0} artifacts</span>
              </div>
              <div className="workspace-grid nested-grid">
                <div className="panel-span-4">
                  <div className="mini-card">
                    <span className="metric-label">Selected project</span>
                    <strong>{selectedProject?.client_name ?? "No project selected"}</strong>
                    <p className="panel-note">{selectedProject?.service_type ?? "Select a project to review approvals, artifacts, QC, and delivery history."}</p>
                  </div>
                </div>
                <div className="panel-span-4">
                  <div className="mini-card">
                    <span className="metric-label">Pipeline evidence</span>
                    <strong>{projectDetail ? `${projectDetail.jobs.length} jobs · ${projectDetail.worker_tasks.length} worker tasks` : "Loading project detail"}</strong>
                    <p className="panel-note">
                      {projectDetail ? `${projectDetail.revisions.length} revisions · ${projectDetail.qc_reports.length} QC reports · ${projectDetail.mix_plans.length} mix plans` : "Project detail is loading."}
                    </p>
                  </div>
                </div>
                <div className="panel-span-4">
                  <div className="mini-card">
                    <span className="metric-label">Review candidate</span>
                    <strong>{fileLabel(projectDetail?.review_packet.latest_candidate_path)}</strong>
                    <p className="panel-note">{projectDetail?.review_packet.recommended_operator_action ?? "Review packets will appear here after worker execution or packaging."}</p>
                  </div>
                </div>
              </div>
              <div className="table-stack top-gap">
                {projectDetailState === "loading" ? <p className="empty-state">Loading project timeline…</p> : null}
                {projectDetail?.artifact_inventory.slice(0, 10).map((entry: any, index: number) => {
                  const artifact = entry.artifact ?? {};
                  const artifactPath = entry.artifact_path ?? artifact.path ?? artifact.manifest_path;
                  return (
                    <div key={`${entry.source}-${entry.job_id ?? entry.task_id ?? index}`} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{fileLabel(artifactPath)}</strong>
                        <div className="muted">{String(artifact.kind ?? artifact.type ?? "artifact")} · {entry.source}</div>
                        <div className="muted">{artifactPath ?? JSON.stringify(artifact)}</div>
                      </div>
                      <div className="row-meta">
                        <span className="muted">{entry.created_at ? summarizeTime(entry.created_at) : "n/a"}</span>
                        {selectedProject?.id ? (
                          <>
                            <button className="action-button" type="button" onClick={() => previewArtifact(selectedProject.id, entry.artifact_id)}>
                              preview
                            </button>
                            {artifactPath ? (
                              <a
                                className="action-button subtle"
                                href={`${apiProjectStateBase}/projects/${selectedProject.id}/artifacts/${entry.artifact_id}/download`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                download
                              </a>
                            ) : null}
                          </>
                        ) : null}
                        {artifactPath ? (
                          <button className="action-button subtle" type="button" onClick={() => copyArtifactValue(artifactPath, "Artifact path")}>
                            copy path
                          </button>
                        ) : (
                          <button className="action-button subtle" type="button" onClick={() => copyArtifactValue(JSON.stringify(artifact, null, 2), "Artifact payload")}>
                            copy payload
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {projectDetailState === "error" ? <EmptyState title="Project detail unavailable" detail="The control plane could not load the selected project detail yet." /> : null}
                {projectDetail && !projectDetail.artifact_inventory.length ? <EmptyState title="No artifact history yet" detail="Approvals and worker executions will start populating this record." /> : null}
                {artifactPreview ? (
                  <div className="approval-preview-block top-gap">
                    <strong>{artifactPreview.file_name}</strong>
                    <div className="muted">{artifactPreview.path}</div>
                    <pre className="code-preview">{artifactPreview.content}</pre>
                  </div>
                ) : null}
                {artifactPreviewState === "loading" ? <p className="empty-state">Loading artifact preview…</p> : null}
                {artifactActionMessage ? <p className="feedback ok">{artifactActionMessage}</p> : null}
                {artifactActionError ? <p className="feedback bad">{artifactActionError}</p> : null}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-8">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Review Surface</p>
                  <h2>Project Review Stack</h2>
                </div>
                <span className="count-pill">
                  {projectDetail ? `${projectDetail.review_summary.passing_qc_count}/${projectDetail.review_summary.qc_report_count} qc pass · ${projectDetail.review_summary.artifact_count} artifacts` : "loading"}
                </span>
              </div>
              <div className="workspace-grid nested-grid">
                <div className="panel-span-6 table-stack">
                  <div className="table-row">
                    <div className="row-main">
                      <strong>QC reports</strong>
                      <div className="muted">Candidate-level loudness, peak, low-end, stereo, and spectral checks.</div>
                    </div>
                  </div>
                  {projectDetail?.qc_reports.slice(0, 4).map((report: any, index: number) => (
                    <div key={`${report.id ?? index}`} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{String(report.file_path ?? "qc report")}</strong>
                        <div className="meta-inline">
                          <span className={`metric-chip ${qcTone(Number(report.lufs_integrated), "lufs", lufsTarget)}`}>{String(report.lufs_integrated ?? "n/a")} LUFS</span>
                          <span className={`metric-chip ${qcTone(Number(report.true_peak_dbfs), "truePeak", lufsTarget)}`}>TP {String(report.true_peak_dbfs ?? "n/a")}</span>
                        </div>
                        <div className="muted">
                          Low-end {String(report.low_end_ratio ?? "n/a")} · Stereo {String(report.stereo_width ?? "n/a")} · Spectral {String(report.spectral_tilt_db ?? "n/a")} dB
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${report.overall_pass ? "ok" : "bad"}`}>{report.overall_pass ? "pass" : "review"}</span>
                      </div>
                    </div>
                  ))}
                  {projectDetail && !projectDetail.qc_reports.length ? <EmptyState title="No QC reports yet" detail="Render and review passes will create QC records here." /> : null}
                </div>
                <div className="panel-span-6 table-stack">
                  <div className="table-row">
                    <div className="row-main">
                      <strong>Delivery history</strong>
                      <div className="muted">Review bounces, manifests, and delivery-facing artifacts.</div>
                    </div>
                  </div>
                  {deliveryHistory.map((entry) => (
                    <div key={`${entry.artifactId}-${entry.summary}`} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{entry.summary}</strong>
                        <div className="muted">{entry.kind} · {entry.source}{entry.workerSlug ? ` · ${entry.workerSlug}` : ""}</div>
                      </div>
                      <div className="row-meta">
                        <span className="muted">{entry.createdAt ? summarizeTime(entry.createdAt) : "n/a"}</span>
                        {selectedProject?.id ? (
                          <button className="action-button subtle" type="button" onClick={() => previewArtifact(selectedProject.id, entry.artifactId)}>
                            preview
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {projectDetail && !deliveryHistory.length ? <EmptyState title="No delivery history yet" detail="Delivery-facing renders and packages will appear here once generated." /> : null}
                </div>
              </div>
              {reviewSaveMessage ? <p className="feedback ok">{reviewSaveMessage}</p> : null}
              {reviewSaveError ? <p className="feedback bad">{reviewSaveError}</p> : null}
            </article>

            <article className="panel panel-span-4">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Recent Intake</p>
                  <h2>Lead Signals</h2>
                </div>
                <span className="count-pill">{data.leads.length}</span>
              </div>
              <div className="table-stack">
                {data.leads.length ? (
                  data.leads.slice(0, 8).map((lead: any) => {
                    const normalized = lead.normalized as { artist_name?: string; service_requested?: string; budget_signal?: string; urgency?: string } | null;
                    return (
                      <div key={lead.id} className="table-row compact-row">
                        <div className="row-main">
                          <strong>{normalized?.artist_name ?? lead.source}</strong>
                          <div className="muted">{normalized?.service_requested ?? lead.source}</div>
                          <div className="meta-inline">
                            {normalized?.budget_signal && normalized.budget_signal !== "unknown" ? <span>budget: {normalized.budget_signal}</span> : null}
                            {normalized?.urgency ? <span>{normalized.urgency}</span> : null}
                            <span className={`metric-chip ${leadFitTone(lead.fit_score)}`}>fit {lead.fit_score ?? "n/a"}</span>
                            {lead.created_at ? <span>{summarizeTime(lead.created_at)}</span> : null}
                          </div>
                          {typeof lead.fit_score === "number" ? (
                            <div className="fit-score-bar" aria-label={`fit score ${lead.fit_score}`}>
                              <div className={`fit-score-fill ${leadFitTone(lead.fit_score)}`} style={{ width: `${Math.max(0, Math.min(100, Number(lead.fit_score)))}%` }} />
                            </div>
                          ) : null}
                          {lead.draft_reply ? <div className="muted notes-preview">{lead.draft_reply.slice(0, 120)}{lead.draft_reply.length > 120 ? "…" : ""}</div> : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState title="No lead signals yet" detail="Qualified inquiries will appear here after intake or inbox triage." />
                )}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
