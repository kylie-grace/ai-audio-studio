import { useEffect, useState } from "react";

import { EmptyState } from "./EmptyState";
import type { WorkerTask } from "../types";

type ConfirmTaskModalProps = {
  apiProjectStateBase: string;
  apiStudioWorkerBase: string;
  operatorName: string;
  operatorToken: string;
  onResolved: () => void | Promise<void>;
};

const CONFIRMABLE_TASK_TYPES = new Set(["execute-soundflow", "execute-reascript", "execute-wavelab"]);

export function ConfirmTaskModal({
  apiProjectStateBase,
  apiStudioWorkerBase,
  operatorName,
  operatorToken,
  onResolved,
}: ConfirmTaskModalProps) {
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    async function load() {
      try {
        const response = await fetch(`${apiProjectStateBase}/workers/tasks/list?status=awaiting-approval`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Task confirmation load failed with ${response.status}`);
        }
        const payload = (await response.json()) as WorkerTask[];
        if (!active) return;
        setTasks(payload.filter((task) => CONFIRMABLE_TASK_TYPES.has(task.task_type)));
        setError(null);
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : "Unable to load confirmation tasks.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    timer = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [apiProjectStateBase]);

  async function runAction(taskId: string, action: "approve" | "reject") {
    setPendingTaskId(taskId);
    setError(null);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Actor": operatorName,
      };
      if (operatorToken) headers["X-Operator-Token"] = operatorToken;
      const response =
        action === "approve"
          ? await fetch(`${apiStudioWorkerBase}/runtime/confirm-task`, {
              method: "POST",
              headers,
              body: JSON.stringify({ task_id: taskId }),
            })
          : await fetch(`${apiProjectStateBase}/workers/tasks/${taskId}/cancel`, {
              method: "POST",
              headers,
            });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `${action} failed with ${response.status}`);
      }
      setTasks((current) => current.filter((task) => task.id !== taskId));
      await onResolved();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : `Unable to ${action} task.`);
    } finally {
      setPendingTaskId(null);
    }
  }

  if (!loading && !tasks.length) return null;

  return (
    <div className="confirm-task-modal-backdrop">
      <section className="confirm-task-modal">
        <div className="panel-header">
          <div>
            <p className="section-kicker t-kicker">Execution Gate</p>
            <h2 className="t-h2">Operator confirmation required</h2>
          </div>
          <span className="count-badge urgent">{tasks.length}</span>
        </div>
        <p className="panel-note">
          DAW execution is paused until an operator explicitly approves each queued workstation action.
        </p>
        {loading ? (
          <div className="top-gap">
            <div className="skeleton skeleton--row" />
            <div className="skeleton skeleton--row" />
            <div className="skeleton skeleton--row" />
          </div>
        ) : tasks.length ? (
          <div className="table-stack top-gap">
            {tasks.map((task) => {
              const payload = typeof task.payload === "object" && task.payload ? task.payload : {};
              return (
                <div key={task.id} className="table-row">
                  <div className="row-main">
                    <strong>{task.task_type}</strong>
                    <div className="muted">
                      {(payload.project_slug as string | undefined) ?? (payload.project_id as string | undefined) ?? task.id}
                    </div>
                    <div className="panel-note">
                      {task.worker_slug ?? "unassigned worker"} · queued {new Date(task.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="header-actions">
                    <button
                      className="action-button btn ok"
                      type="button"
                      disabled={!operatorName || pendingTaskId === task.id}
                      onClick={() => void runAction(task.id, "approve")}
                    >
                      {pendingTaskId === task.id ? "working" : "approve"}
                    </button>
                    <button
                      className="action-button btn bad"
                      type="button"
                      disabled={!operatorName || pendingTaskId === task.id}
                      onClick={() => void runAction(task.id, "reject")}
                    >
                      reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Waiting for execution-gate tasks" detail="No DAW tasks are paused for operator confirmation." />
        )}
        {error ? <p className="feedback bad">{error}</p> : null}
      </section>
    </div>
  );
}
