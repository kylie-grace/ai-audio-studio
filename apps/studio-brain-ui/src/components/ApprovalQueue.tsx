import { useEffect, useMemo, useState } from "react";

import { AlertBanner } from "./AlertBanner";
import { EmptyState } from "./EmptyState";

type ApprovalQueueProps = {
  approvals: any[];
  visibleApprovals: any[];
  loading?: boolean;
  approvedJobIds: string[];
  operatorName: string;
  setOperatorName: (value: string) => void;
  setWorkspaceDraft: (updater: (current: any) => any) => void;
  operatorToken: string;
  setOperatorToken: (value: string) => void;
  rejectReasons: Record<string, string>;
  setRejectReasons: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  pendingJobId: string | null;
  handleApproval: (jobId: string, decision: "approve" | "reject") => void | Promise<void>;
  actionMessage: string | null;
  actionError: string | null;
  summarizeTime: (value: string) => string;
};

function previewSnippet(job: any) {
  if (job.preview?.lead?.draft_reply) return job.preview.lead.draft_reply;
  if (job.preview?.draft?.draft_body) return job.preview.draft.draft_body;
  if (job.preview?.drafts?.[0]?.caption) return job.preview.drafts[0].caption;
  if (job.preview?.revision?.raw_notes) return job.preview.revision.raw_notes;
  return job.action;
}

function humanizeModule(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function approvalRouteLabel(job: any) {
  if (job.module === "lead-intake") return "Lead intake → project review";
  if (job.module === "inbox-triage") return "Inbox triage → draft review";
  if (job.module === "content-pipeline") return "Brief → draft → approval";
  if (job.module === "revision-parser") return "Revision note → DAW change plan";
  if (job.module === "delivery-packager") return "QC gate → package → handoff";
  if (job.module === "session-prep") return "Stems → session prep → worker task";
  if (job.module === "audio-qc") return "Render → QC review";
  if (job.module === "mix-planner") return "Project notes → mix plan";
  return job.preview?.kind ? humanizeModule(String(job.preview.kind)) : humanizeModule(String(job.module));
}

export function ApprovalQueue(props: ApprovalQueueProps) {
  const {
    approvals,
    visibleApprovals,
    loading,
    approvedJobIds,
    operatorName,
    setOperatorName,
    setWorkspaceDraft,
    operatorToken,
    setOperatorToken,
    rejectReasons,
    setRejectReasons,
    pendingJobId,
    handleApproval,
    actionMessage,
    actionError,
    summarizeTime,
  } = props;
  const [expandedApprovalId, setExpandedApprovalId] = useState<string | null>(visibleApprovals[0]?.id ?? null);
  const [showOperatorInputs, setShowOperatorInputs] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const visibleModuleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleApprovals.forEach((job) => {
      const key = job.module || job.preview?.kind || "other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]).slice(0, 6);
  }, [visibleApprovals]);

  useEffect(() => {
    if (!visibleApprovals.length) {
      if (expandedApprovalId !== null) setExpandedApprovalId(null);
      return;
    }
    if (expandedApprovalId && visibleApprovals.some((job) => job.id === expandedApprovalId)) return;
    setExpandedApprovalId(visibleApprovals[0].id);
  }, [expandedApprovalId, visibleApprovals]);

  return (
    <section className="workspace-grid">
      <article className="panel panel-span-8">
        <div className="panel-header">
          <div>
            <p className="section-kicker t-kicker">Action Queue</p>
            <h2 className="t-h2">Approvals</h2>
            <p className="panel-note">Review requests first. Expand only the cards you need to inspect or act on.</p>
          </div>
          <span className="count-pill">showing {visibleApprovals.length} of {approvals.length}</span>
        </div>
        <div className="summary-pill-row top-gap">
          {visibleModuleCounts.length ? (
            visibleModuleCounts.map(([module, count]) => (
              <span key={module} className="summary-pill">
                {humanizeModule(module)} · {count}
              </span>
            ))
          ) : (
            <span className="summary-pill">No pending approval modules</span>
          )}
        </div>
        {actionMessage ? <AlertBanner tone="ok" title="Approval updated" detail={actionMessage} /> : null}
        {actionError ? <AlertBanner tone="bad" title="Approval action failed" detail={actionError} /> : null}
        <div className="table-stack top-gap">
          {loading ? (
            <>
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
              <div className="skeleton skeleton--row" />
            </>
          ) : approvals.length ? (
            visibleApprovals.map((job) => {
              const expanded = expandedApprovalId === job.id;
              const approved = approvedJobIds.includes(job.id);
              const confidenceTone = (value: unknown) => {
                const confidence = Number(value ?? 0);
                if (confidence >= 0.8) return "ok";
                if (confidence >= 0.6) return "warn";
                return "bad";
              };
              return (
                <div key={job.id} className={`table-row approval-card ${expanded ? "is-expanded" : ""} ${approved ? "is-approved" : ""}`}>
                  <button
                    type="button"
                    className="approval-card-toggle"
                    onClick={() => setExpandedApprovalId(expanded ? null : job.id)}
                  >
                    <div className="row-main">
                      <strong>{job.module}</strong>
                      <div className="muted">{job.action}</div>
                      <div className="meta-inline">
                        <span>{job.requested_by ?? "system"}</span>
                        <span>{summarizeTime(job.created_at)}</span>
                        {job.preview?.project?.client_name ? <span>{job.preview.project.client_name}</span> : null}
                      </div>
                      <p className="muted">{previewSnippet(job)}</p>
                      <div className="meta-inline">
                        <span>{approvalRouteLabel(job)}</span>
                        {job.preview?.kind ? <span>{humanizeModule(String(job.preview.kind))}</span> : null}
                        {job.preview?.project?.service_type ? <span>{job.preview.project.service_type}</span> : null}
                      </div>
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${approved ? "ok" : "warn"}`}>{approved ? "queued" : "awaiting approval"}</span>
                      <span className="status-pill info">{expanded ? "collapse" : "expand"}</span>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="approval-card-body">
                      {job.preview?.blocking_issue ? (
                        <AlertBanner tone="warn" title="Execution is not fully routed yet" detail={job.preview.blocking_issue} />
                      ) : null}
                      {job.preview?.title ? <div className="approval-preview-title">{job.preview.title}</div> : null}
                      {job.preview?.lead ? (
                        <div className="approval-preview-block">
                          <strong>Draft reply</strong>
                          <p>{job.preview.lead.draft_reply}</p>
                          <div className="meta-inline">
                            <span>fit {job.preview.lead.fit_score ?? "n/a"}</span>
                            <span>urgency {job.preview.lead.urgency_score ?? "n/a"}</span>
                          </div>
                          <p className="muted">{job.preview.lead.raw_input}</p>
                        </div>
                      ) : null}
                      {job.preview?.draft ? (
                        <div className="approval-preview-block">
                          <strong>{job.preview.draft.draft_subject}</strong>
                          <p>{job.preview.draft.draft_body}</p>
                          <div className="meta-inline">
                            <span>{job.preview.draft.message_type}</span>
                            <span>{job.preview.draft.urgency}</span>
                          </div>
                        </div>
                      ) : null}
                      {job.preview?.drafts?.length ? (
                        <div className="approval-preview-block">
                          <strong>Draft variants</strong>
                          <div className="table-stack compact-stack">
                            {job.preview.drafts.map((draft: any) => (
                              <div key={`${job.id}-${draft.platform}`} className="table-row compact-row">
                                <div className="row-main">
                                  <strong>{draft.platform}</strong>
                                  <p className="muted">{draft.caption}</p>
                                </div>
                                <div className="row-meta">
                                  <span className="status-pill warn">{draft.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {job.preview?.revision ? (
                        <div className="approval-preview-block">
                          <strong>Revision plan</strong>
                          <p className="muted">{job.preview.revision.raw_notes}</p>
                          {job.preview.revision.parsed_changes?.length ? (
                            <div className="table-stack compact-stack">
                              {(job.preview.revision.parsed_changes as Array<Record<string, unknown>>).slice(0, 8).map((change, idx) => (
                                <div key={idx} className="table-row compact-row">
                                  <div className="row-main">
                                    <strong>{String(change.element ?? "mix")}</strong>
                                    <span className="muted">{String(change.parameter ?? "")} · {String(change.direction ?? "")}</span>
                                  </div>
                                  <div className="row-meta">
                                    <span className={`status-pill ${confidenceTone(change.confidence)}`}>
                                      {Math.round(Number(change.confidence ?? 0) * 100)}%
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="summary-pill-row">
                        <span className="summary-pill">{approvalRouteLabel(job)}</span>
                        {job.preview?.kind ? <span className="summary-pill">{humanizeModule(String(job.preview.kind))}</span> : null}
                        {job.preview?.project?.client_name ? <span className="summary-pill">{job.preview.project.client_name}</span> : null}
                      </div>
                      <div className="approval-card-footer">
                        {rejectingId === job.id ? (
                          <label className="field compact-field approval-reject-field">
                            <span className="metric-label">Reject reason</span>
                            <input
                              value={rejectReasons[job.id] ?? ""}
                              placeholder="Required rejection note"
                              onChange={(event) => setRejectReasons((current) => ({ ...current, [job.id]: event.target.value }))}
                            />
                          </label>
                        ) : (
                          <div className="approval-action-note">
                            <span className="metric-label">Execution handoff</span>
                            <p className="panel-note">{approved ? "Approved and queued for execution. The card will clear after the next refresh." : "Approving will queue execution or routing immediately after this review."}</p>
                          </div>
                        )}
                        <div className="action-row">
                          <button
                            className="action-button btn primary"
                            disabled={!operatorName || pendingJobId === job.id || approved}
                            onClick={() => handleApproval(job.id, "approve")}
                          >
                            {pendingJobId === job.id ? "working" : approved ? "queued" : "approve"}
                          </button>
                          {rejectingId === job.id ? (
                            <>
                              <button
                                className="action-button btn destructive"
                                disabled={!operatorName || pendingJobId === job.id || !(rejectReasons[job.id] ?? "").trim()}
                                onClick={async () => {
                                  await handleApproval(job.id, "reject");
                                  setRejectingId(null);
                                }}
                              >
                                {pendingJobId === job.id ? "working" : "confirm rejection"}
                              </button>
                              <button className="action-button btn ghost" disabled={pendingJobId === job.id} onClick={() => setRejectingId(null)}>
                                cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="action-button btn destructive"
                              disabled={!operatorName || pendingJobId === job.id || approved}
                              onClick={() => setRejectingId(job.id)}
                            >
                              reject
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <EmptyState title="Queue is clear" detail="No items are waiting for review right now." />
          )}
        </div>
      </article>

      <aside className="panel panel-span-4">
        <div className="panel-header">
          <div>
            <p className="section-kicker t-kicker">Operator</p>
            <h2 className="t-h2">Acting as {operatorName || "owner"}</h2>
          </div>
          <button className="action-button btn" type="button" onClick={() => setShowOperatorInputs((current) => !current)}>
            {showOperatorInputs ? "hide" : "edit"}
          </button>
        </div>
        <p className="panel-note">Approval actions send `X-Actor` and `X-Operator-Token`. Keep these accurate before operating the queue.</p>
        {showOperatorInputs ? (
          <div className="operator-grid top-gap">
            <label className="field">
              <span className="metric-label">Approval actor</span>
              <input
                value={operatorName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setOperatorName(nextName);
                  setWorkspaceDraft((current) => ({ ...current, operator_name: nextName }));
                }}
              />
            </label>
            <label className="field">
              <span className="metric-label">Operator token</span>
              <input
                type="password"
                value={operatorToken}
                placeholder="Required when OPERATOR_API_TOKEN is set"
                onChange={(event) => setOperatorToken(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="summary-pill-row top-gap">
            <span className="summary-pill">{operatorName || "owner"}</span>
            <span className="summary-pill">{operatorToken ? "token loaded" : "token not set"}</span>
          </div>
        )}
      </aside>
    </section>
  );
}
