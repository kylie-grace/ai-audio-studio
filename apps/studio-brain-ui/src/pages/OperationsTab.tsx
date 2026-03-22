import { ApprovalQueue } from "../components/ApprovalQueue";

type OperationsTabProps = {
  [key: string]: any;
};

export function OperationsTab(props: OperationsTabProps) {
  const {
    data,
    visibleApprovals,
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
    activeAlertCount,
    alertActionPending,
    runAlertAction,
    alertActionMessage,
    alertActionError,
    workstationValidationState,
    refreshWorkstationValidation,
    workstationSmoke,
    runWorkstationSmoke,
    workstationSmokePending,
    workstationRuntime,
    updateWorkstationRuntime,
    workstationRuntimePending,
    workstationValidation,
    workstationRuntimeState,
    workstationSmokeMessage,
    workstationSmokeError,
    workstationRuntimeMessage,
    workstationRuntimeError,
    pendingTaskActionId,
    retireWorker,
    handleTaskRecovery,
    taskActionMessage,
    taskActionError,
    auditFilter,
    setAuditFilter,
    filteredAuditLog,
  } = props;

  return (
    <div className="tab-panel">
      <ApprovalQueue
        approvals={data.approvals}
        visibleApprovals={visibleApprovals}
        approvedJobIds={approvedJobIds}
        operatorName={operatorName}
        setOperatorName={setOperatorName}
        setWorkspaceDraft={setWorkspaceDraft}
        operatorToken={operatorToken}
        setOperatorToken={setOperatorToken}
        rejectReasons={rejectReasons}
        setRejectReasons={setRejectReasons}
        pendingJobId={pendingJobId}
        handleApproval={handleApproval}
        actionMessage={actionMessage}
        actionError={actionError}
        summarizeTime={summarizeTime}
      />

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Escalation</p>
              <h2>Live Alerts</h2>
            </div>
            <div className="header-actions">
              <span className="count-pill">{activeAlertCount}</span>
              <button className="action-button" disabled={alertActionPending !== null} onClick={() => runAlertAction("test")}>
                {alertActionPending === "test" ? "testing" : "test alert"}
              </button>
              <button
                className="action-button ok"
                disabled={alertActionPending !== null || !data.runtimeAlerts.active_alerts.length}
                onClick={() => runAlertAction("dispatch")}
              >
                {alertActionPending === "dispatch" ? "dispatching" : "dispatch active"}
              </button>
            </div>
          </div>
          <div className="alert-summary-grid">
            <div className="mini-card">
              <span className="metric-label">Approval backlog</span>
              <strong>{data.runtimeAlerts.approvals_waiting}</strong>
            </div>
            <div className="mini-card">
              <span className="metric-label">Failed tasks</span>
              <strong>{data.runtimeAlerts.failed_worker_tasks}</strong>
            </div>
            <div className="mini-card">
              <span className="metric-label">Claimed tasks</span>
              <strong>{data.runtimeAlerts.claimed_worker_tasks}</strong>
            </div>
            <div className="mini-card">
              <span className="metric-label">Expired leases</span>
              <strong>{data.runtimeAlerts.expired_worker_leases}</strong>
            </div>
            <div className="mini-card">
              <span className="metric-label">Stale workers</span>
              <strong>{data.runtimeAlerts.stale_workers.length}</strong>
            </div>
          </div>
          <div className="workspace-grid nested-grid">
            <div className="panel-span-7 table-stack top-gap">
              {data.runtimeAlerts.active_alerts.length ? (
                data.runtimeAlerts.active_alerts.map((alert: any) => (
                  <div key={alert.slug} className="table-row">
                    <div className="row-main">
                      <strong>{alert.slug}</strong>
                      <div className="muted">{alert.detail}</div>
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${alert.severity === "bad" ? "bad" : "warn"}`}>{alert.severity}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-state">No live alert thresholds are currently tripped.</p>
              )}
            </div>
            <div className="panel-span-5 table-stack top-gap">
              {data.alerts.channels.map((channel: any) => (
                <div key={channel.slug} className="table-row">
                  <div className="row-main">
                    <strong>{channel.name}</strong>
                    <div className="muted">{channel.detail}</div>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${channel.configured ? "ok" : "warn"}`}>
                      {channel.configured ? "configured" : "needs setup"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {alertActionMessage ? <p className="feedback ok">{alertActionMessage}</p> : null}
          {alertActionError ? <p className="feedback bad">{alertActionError}</p> : null}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Workstation</p>
              <h2>Setup Validation</h2>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="action-button"
                onClick={() => void refreshWorkstationValidation()}
                disabled={workstationValidationState === "loading"}
              >
                {workstationValidationState === "loading" ? "Refreshing…" : "Refresh validation"}
              </button>
              <button
                type="button"
                className={`action-button ${workstationSmoke?.result === "pass" ? "ok" : ""}`}
                onClick={() => void runWorkstationSmoke()}
                disabled={workstationSmokePending}
              >
                {workstationSmokePending ? "Running smoke…" : "Run dry-run smoke"}
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => void updateWorkstationRuntime(workstationRuntime?.runtime.drain_requested ? "resume" : "drain")}
                disabled={workstationRuntimePending !== null}
              >
                {workstationRuntimePending === "drain"
                  ? "Draining…"
                  : workstationRuntimePending === "resume"
                    ? "Resuming…"
                    : workstationRuntime?.runtime.drain_requested
                      ? "Resume worker"
                      : "Drain worker"}
              </button>
              <span className={`status-pill ${workstationValidation?.ready ? "ok" : "warn"}`}>
                {workstationValidation ? (workstationValidation.ready ? "ready" : "needs review") : "unavailable"}
              </span>
            </div>
          </div>
          <div className="workspace-grid nested-grid">
            <div className="panel-span-4">
              <div className="mini-card">
                <span className="metric-label">Recommended next step</span>
                <strong>{workstationValidation?.recommended_next_step ?? "Waiting for worker validation."}</strong>
                <p className="panel-note">{workstationValidation?.host ?? "No workstation host reported yet."}</p>
              </div>
              <div className="mini-card top-gap">
                <span className="metric-label">Dry-run smoke</span>
                <strong>
                  {workstationSmoke
                    ? workstationSmoke.result === "pass"
                      ? "pass"
                      : "review"
                    : "not run yet"}
                </strong>
                <p className="panel-note">
                  {workstationSmoke
                    ? `${workstationSmoke.session_manifest.track_count} tracks · ${workstationSmoke.render_plan.profile_count} render profiles · ${workstationSmoke.execution_plan.blockers.length} blockers`
                    : "Runs a safe planning-chain rehearsal against the current workstation without touching a real session."}
                </p>
              </div>
              <div className="mini-card top-gap">
                <span className="metric-label">Worker runtime</span>
                <strong>
                  {workstationRuntime
                    ? workstationRuntime.runtime.drain_requested
                      ? "draining"
                      : workstationRuntime.runtime.last_status
                    : "unavailable"}
                </strong>
                <p className="panel-note">
                  {workstationRuntime
                    ? `${workstationRuntime.worker_slug} · ${workstationRuntime.runtime.current_task_id ? `active task ${workstationRuntime.runtime.current_task_id}` : "no active task"}`
                    : "Runtime status has not been loaded yet."}
                </p>
              </div>
            </div>
            <div className="panel-span-8">
              <div className="readiness-grid">
                {(workstationValidation?.checks ?? []).map((check: any) => (
                  <div key={check.slug} className="mini-card readiness-card">
                    <div className="panel-header compact-header">
                      <div>
                        <span className="metric-label">{check.label}</span>
                        <strong>{check.status.replace("-", " ")}</strong>
                      </div>
                      <span className={`status-pill ${check.status === "ready" ? "ok" : check.status === "needs-attention" ? "bad" : "warn"}`}>
                        {check.status}
                      </span>
                    </div>
                    <p className="panel-note">{check.detail}</p>
                  </div>
                ))}
                {workstationValidationState === "loading" ? <p className="empty-state">Validating workstation setup…</p> : null}
                {workstationValidationState === "error" ? <p className="empty-state">Workstation validation is not available yet.</p> : null}
              </div>
            </div>
          </div>
          {workstationSmoke ? (
            <div className="workspace-grid nested-grid top-gap">
              <div className="panel-span-4">
                <div className="mini-card">
                  <span className="metric-label">Smoke summary</span>
                  <strong>{workstationSmoke.summary.execution_ready_for_review ? "planning chain ready" : "review before live use"}</strong>
                  <p className="panel-note">
                    {workstationSmoke.summary.mix_phase_count} mix phases · {workstationSmoke.summary.warning_count} dependency warnings ·
                    {" "}
                    {workstationSmoke.summary.listening_issue_count} listening issues tracked
                  </p>
                </div>
              </div>
              <div className="panel-span-8">
                <div className="table-stack">
                  <div className="table-row">
                    <div className="row-main">
                      <strong>Session rehearsal</strong>
                      <div className="muted">
                        {workstationSmoke.session_manifest.session_type} · {workstationSmoke.session_manifest.stem_count} stems ·
                        {" "}
                        {workstationSmoke.session_manifest.reference_count} references
                      </div>
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${workstationSmoke.summary.session_ready ? "ok" : "warn"}`}>
                        {workstationSmoke.summary.session_ready ? "ready" : "review"}
                      </span>
                    </div>
                  </div>
                  <div className="table-row">
                    <div className="row-main">
                      <strong>Execution review</strong>
                      <div className="muted">{workstationSmoke.execution_plan.recommended_next_step ?? workstationSmoke.recommended_next_step}</div>
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${workstationSmoke.summary.execution_ready_for_review ? "ok" : "warn"}`}>
                        {workstationSmoke.summary.execution_ready_for_review ? "operator-ready" : "needs review"}
                      </span>
                    </div>
                  </div>
                  <div className="table-row">
                    <div className="row-main">
                      <strong>Next actions</strong>
                      <div className="muted">
                        {(workstationSmoke.listening_report.next_actions ?? []).slice(0, 2).join(" · ") || "No listening follow-up required."}
                      </div>
                    </div>
                    <div className="row-meta">
                      <span className="status-pill warn">{workstationSmoke.execution_plan.blockers.length} blockers</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {workstationSmokeMessage ? <p className="feedback ok">{workstationSmokeMessage}</p> : null}
          {workstationSmokeError ? <p className="feedback bad">{workstationSmokeError}</p> : null}
          {workstationRuntimeState === "error" ? <p className="feedback bad">Worker runtime controls are not available yet.</p> : null}
          {workstationRuntimeMessage ? <p className="feedback ok">{workstationRuntimeMessage}</p> : null}
          {workstationRuntimeError ? <p className="feedback bad">{workstationRuntimeError}</p> : null}
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Recovery</p>
              <h2>Runtime Recovery</h2>
            </div>
            <div className="header-actions">
              <span className="count-pill">{data.runtimeRecovery.summary.failed_task_count} failed</span>
              <span className="status-pill warn">{data.runtimeRecovery.summary.claimed_task_count} claimed</span>
              <span className="status-pill bad">{data.runtimeRecovery.summary.expired_claim_count} expired</span>
            </div>
          </div>
          <div className="recovery-grid">
            <div className="mini-card recovery-card">
              <span className="metric-label">Failed tasks ready to requeue</span>
              <strong>{data.runtimeRecovery.summary.failed_task_count}</strong>
              <p className="panel-note">Failed execution can be requeued directly from the task feed once the cause is understood.</p>
              <div className="table-stack top-gap">
                {data.runtimeRecovery.failed_tasks.slice(0, 3).map((task: any) => (
                  <div key={task.id} className="table-row">
                    <div className="row-main">
                      <strong>{task.task_type}</strong>
                      <div className="muted">{task.error_message ?? "Worker task failed."}</div>
                    </div>
                    <div className="row-meta">
                      <span className="status-pill bad">failed</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mini-card recovery-card">
              <span className="metric-label">Claimed tasks</span>
              <strong>{data.runtimeRecovery.summary.claimed_task_count}</strong>
              <p className="panel-note">Expired leases indicate stranded execution and should be released or requeued.</p>
              <div className="table-stack top-gap">
                {data.runtimeRecovery.claimed_tasks.slice(0, 3).map((task: any) => (
                  <div key={task.id} className="table-row">
                    <div className="row-main">
                      <strong>{task.task_type}</strong>
                      <div className="muted">{task.claimed_by ?? task.worker_slug ?? "unassigned"}</div>
                    </div>
                    <div className="row-meta">
                      <span className={`status-pill ${task.lease_state === "expired" ? "bad" : "warn"}`}>{task.lease_state ?? "claimed"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mini-card recovery-card">
              <span className="metric-label">Stale workers</span>
              <strong>{data.runtimeRecovery.summary.stale_worker_count}</strong>
              <p className="panel-note">Usually points to a stopped local worker loop, dead second Mac, or network issue.</p>
              <div className="table-stack top-gap">
                {data.runtimeRecovery.stale_workers.slice(0, 3).map((worker: any) => (
                  <div key={worker.slug} className="table-row">
                    <div className="row-main">
                      <strong>{worker.display_name}</strong>
                      <div className="muted">{worker.slug}</div>
                    </div>
                    <div className="row-meta">
                      <span className="status-pill warn">stale</span>
                      <button
                        className="action-button destructive"
                        disabled={!operatorName || pendingTaskActionId === worker.slug}
                        onClick={() => {
                          if (!window.confirm(`Retire ${worker.display_name}? This will remove the worker from active routing and clean up pinned queued work.`)) {
                            return;
                          }
                          void retireWorker(worker.slug);
                        }}
                      >
                        {pendingTaskActionId === worker.slug ? "working" : "retire"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
        <article className="panel panel-span-5">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Execution</p>
              <h2>Worker Nodes</h2>
            </div>
            <span className="count-pill">{data.workers.length}</span>
          </div>
          <div className="table-stack">
            {data.workers.length ? (
              data.workers.map((worker: any) => (
                <div key={worker.id} className="table-row">
                  <div className="row-main">
                    <strong>{worker.display_name}</strong>
                    <div className="muted">{worker.slug} · {worker.platform} · {worker.host ?? "no host"}</div>
                    <div className="meta-inline">
                      <span>{Array.isArray(worker.capabilities) ? worker.capabilities.join(", ") : worker.capabilities}</span>
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${worker.status === "healthy" ? "ok" : worker.status === "degraded" ? "warn" : "bad"}`}>{worker.status}</span>
                    <span className="muted">{worker.api_base_url ? "worker api reachable" : "no api url"}</span>
                    <span className="muted">seen {summarizeTime(worker.last_seen_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No worker registrations yet. Single-machine mode remains fully usable.</p>
            )}
          </div>
        </article>
        <article className="panel panel-span-7">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Runtime</p>
              <h2>Task Feed</h2>
            </div>
            <span className="count-pill">{data.tasks.length}</span>
          </div>
          <div className="table-stack">
            {data.tasks.length ? (
              data.tasks.slice(0, 8).map((task: any) => (
                <div key={task.id} className="table-row">
                  <div className="row-main">
                    <strong>{task.task_type}</strong>
                    <div className="muted">{task.worker_slug ?? task.claimed_by ?? "unassigned"} · {task.priority}</div>
                    {task.error_message ? <div className="muted">{task.error_message}</div> : null}
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${task.status === "healthy" ? "ok" : task.status === "queued" || task.status === "claimed" || task.status === "failed" ? "warn" : "bad"}`}>{task.status}</span>
                    <span className="muted">{summarizeTime(task.created_at)}</span>
                    {task.status === "queued" || task.status === "claimed" || task.status === "failed" ? (
                      <div className="action-row">
                        {task.status === "claimed" ? (
                          <button
                            className="action-button"
                            disabled={!operatorName || pendingTaskActionId === task.id}
                            onClick={() => handleTaskRecovery(task.id, "release")}
                          >
                            {pendingTaskActionId === task.id ? "working" : "release"}
                          </button>
                        ) : null}
                        {task.status === "queued" || task.status === "claimed" ? (
                          <button
                            className="action-button bad"
                            disabled={!operatorName || pendingTaskActionId === task.id}
                            onClick={() => handleTaskRecovery(task.id, task.status === "claimed" ? "stop" : "cancel")}
                          >
                            {pendingTaskActionId === task.id ? "working" : task.status === "claimed" ? "stop" : "cancel"}
                          </button>
                        ) : null}
                        {task.status === "failed" ? (
                          <button
                            className="action-button ok"
                            disabled={!operatorName || pendingTaskActionId === task.id}
                            onClick={() => handleTaskRecovery(task.id, "requeue")}
                          >
                            {pendingTaskActionId === task.id ? "working" : "requeue"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No worker tasks have been processed yet.</p>
            )}
          </div>
          {taskActionMessage ? <p className="feedback ok">{taskActionMessage}</p> : null}
          {taskActionError ? <p className="feedback bad">{taskActionError}</p> : null}
          <p className="panel-note">Historical smoke-test failures stay visible until the backing rows are cleared.</p>
        </article>
        <article className="panel panel-span-12">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Audit</p>
              <h2>Recent Activity</h2>
            </div>
            <span className="count-pill">{filteredAuditLog.length}</span>
          </div>
          <div className="inline-filter-row">
            <input
              value={auditFilter}
              onChange={(event) => setAuditFilter(event.target.value)}
              placeholder="filter actor, action, project, or job"
            />
          </div>
          <div className="table-stack">
            {filteredAuditLog.length ? (
              filteredAuditLog.map((entry: any) => (
                <div key={`${entry.id ?? entry.created_at}-${entry.action}`} className="table-row">
                  <div className="row-main">
                    <strong>{entry.action}</strong>
                    <div className="muted">{entry.actor} · tier {entry.tier}</div>
                    <div className="meta-inline">
                      {entry.project_id ? <span>project {entry.project_id}</span> : null}
                      {entry.job_id ? <span>job {entry.job_id}</span> : null}
                      <span>{summarizeTime(entry.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">{data.auditLog.length ? "No audit entries match the current filter." : "No recent audit activity is available yet."}</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
