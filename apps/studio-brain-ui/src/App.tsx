import { useEffect, useState } from "react";

type ServiceState = "healthy" | "degraded" | "offline";

type ServiceCard = {
  name: string;
  note: string;
  url: string;
  healthUrl: string;
  state: ServiceState;
  detail: string;
};

type WorkerNode = {
  id: string;
  slug: string;
  display_name: string;
  platform: string;
  host?: string | null;
  api_base_url?: string | null;
  status: string;
  capabilities: string[] | string;
  watched_paths?: Record<string, string> | string;
  last_seen_at: string;
};

type OrchestrationRule = {
  id: string;
  slug: string;
  name: string;
  trigger_module: string;
  trigger_action: string;
  target_module: string;
  required_tier: number;
  approval_required: boolean;
  enabled: boolean;
  style_profile_name?: string | null;
  conditions?: Record<string, unknown> | string;
};

type WorkerTask = {
  id: string;
  worker_slug?: string | null;
  task_type: string;
  status: string;
  priority: string;
  claimed_by?: string | null;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
  payload?: Record<string, unknown> | string;
  result?: Record<string, unknown> | string;
};

type DashboardData = {
  refreshedAt: string | null;
  services: ServiceCard[];
  workers: WorkerNode[];
  rules: OrchestrationRule[];
  tasks: WorkerTask[];
  loadState: "loading" | "ready" | "error";
  error: string | null;
};

const browserHost = window.location.hostname || "localhost";
const serviceUrl = (port: number) => `http://${browserHost}:${port}`;

const API = {
  projectState: "/api/project-state",
  crm: "/api/crm",
  openclaw: "/api/openclaw",
  n8n: "/api/n8n",
};

const serviceConfig = [
  {
    name: "Project State",
    note: "Canonical job state, approval queue, worker registry",
    url: serviceUrl(8080),
    healthUrl: `${API.projectState}/health`,
  },
  {
    name: "CRM API",
    note: "Projects, leads, and style profiles",
    url: serviceUrl(8090),
    healthUrl: `${API.crm}/health`,
  },
  {
    name: "OpenClaw",
    note: "Policy-enforced orchestration rules",
    url: serviceUrl(8100),
    healthUrl: `${API.openclaw}/health`,
  },
  {
    name: "n8n",
    note: "Workflow editor and webhook layer",
    url: serviceUrl(5678),
    healthUrl: `${API.n8n}/healthz`,
  },
];

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      return [value];
    }
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function statusTone(state: ServiceState | string) {
  if (state === "healthy" || state === "idle" || state === "ready" || state === "complete") return "ok";
  if (state === "degraded" || state === "busy" || state === "queued" || state === "claimed") return "warn";
  return "bad";
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchServiceState(path: string): Promise<{ state: ServiceState; detail: string }> {
  try {
    const data = await fetchJson<{ status?: string }>(path);
    return {
      state: data.status === "ok" ? "healthy" : "degraded",
      detail: data.status === "ok" ? "reachable" : JSON.stringify(data),
    };
  } catch (error) {
    return {
      state: "offline",
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export function App() {
  const [data, setData] = useState<DashboardData>({
    refreshedAt: null,
    services: serviceConfig.map((service) => ({
      ...service,
      state: "offline",
      detail: "pending",
    })),
    workers: [],
    rules: [],
    tasks: [],
    loadState: "loading",
    error: null,
  });

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const [projectState, crm, openclaw, n8n, workers, rules, tasks] = await Promise.all([
          fetchServiceState(`${API.projectState}/health`),
          fetchServiceState(`${API.crm}/health`),
          fetchServiceState(`${API.openclaw}/health`),
          fetchServiceState(`${API.n8n}/healthz`),
          fetchJson<WorkerNode[]>(`${API.projectState}/workers/`),
          fetchJson<OrchestrationRule[]>(`${API.openclaw}/rules`),
          fetchJson<WorkerTask[]>(`${API.projectState}/workers/tasks/list`),
        ]);

        if (!active) return;

        setData({
          refreshedAt: new Date().toLocaleTimeString(),
          services: [projectState, crm, openclaw, n8n].map((entry, index) => ({
            ...serviceConfig[index],
            state: entry.state,
            detail: entry.detail,
          })),
          workers,
          rules,
          tasks,
          loadState: "ready",
          error: null,
        });
      } catch (error) {
        if (!active) return;
        setData((current) => ({
          ...current,
          loadState: "error",
          error: error instanceof Error ? error.message : "Unknown dashboard error",
        }));
      }
    };

    load();
    timer = window.setInterval(load, 15000);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AI Audio Studio</p>
          <h1>Studio Brain UI</h1>
          <p className="lede">
            Mac mini control plane, studio Mac worker, and live orchestration state in
            one dashboard. This view polls the running APIs through the container proxy
            so it works on the LAN without CORS plumbing.
          </p>
        </div>
        <div className="hero-meta">
          <div className="metric">
            <span className="metric-label">Refresh</span>
            <strong>{data.refreshedAt ?? "waiting"}</strong>
          </div>
          <div className={`metric ${statusTone(data.loadState)}`}>
            <span className="metric-label">Dashboard</span>
            <strong>{data.loadState}</strong>
            {data.error ? <span className="metric-subtle">{data.error}</span> : null}
          </div>
        </div>
      </section>

      <section className="card-grid">
        {data.services.map((service) => (
          <article key={service.name} className={`panel service-card ${statusTone(service.state)}`}>
            <div className="panel-header">
              <h2>{service.name}</h2>
              <span className={`status-pill ${statusTone(service.state)}`}>{service.state}</span>
            </div>
            <p>{service.note}</p>
            <a href={service.url} target="_blank" rel="noreferrer">
              {service.url}
            </a>
            <span className="metric-subtle">{service.detail}</span>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Worker Nodes</h2>
            <span className="count-pill">{data.workers.length}</span>
          </div>
          <div className="table-stack">
            {data.workers.length ? (
              data.workers.map((worker) => (
                <div key={worker.id} className="table-row">
                  <div>
                    <strong>{worker.display_name}</strong>
                    <div className="muted">
                      {worker.slug} · {worker.platform} · {worker.host ?? "no host"}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${statusTone(worker.status)}`}>{worker.status}</span>
                    <span className="muted">{asArray(worker.capabilities).join(", ")}</span>
                    <span className="muted">{worker.api_base_url ?? "no api url"}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No worker registrations yet.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Orchestration Rules</h2>
            <span className="count-pill">{data.rules.length}</span>
          </div>
          <div className="table-stack">
            {data.rules.length ? (
              data.rules.slice(0, 6).map((rule) => (
                <div key={rule.id} className="table-row">
                  <div>
                    <strong>{rule.name}</strong>
                    <div className="muted">
                      {rule.trigger_module}.{rule.trigger_action} &rarr; {rule.target_module}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${rule.enabled ? "ok" : "bad"}`}>
                      tier {rule.required_tier}
                    </span>
                    <span className="muted">{rule.style_profile_name ?? "no style profile"}</span>
                    <span className="muted">
                      {rule.approval_required ? "approval required" : "no approval"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No orchestration rules configured yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent Worker Tasks</h2>
          <span className="count-pill">{data.tasks.length}</span>
        </div>
        <div className="table-stack">
          {data.tasks.length ? (
            data.tasks.slice(0, 8).map((task) => (
              <div key={task.id} className="table-row">
                <div>
                  <strong>{task.task_type}</strong>
                  <div className="muted">
                    {task.worker_slug ?? task.claimed_by ?? "unassigned"} · {task.priority}
                  </div>
                </div>
                <div className="row-meta">
                  <span className={`status-pill ${statusTone(task.status)}`}>{task.status}</span>
                  <span className="muted">{task.created_at}</span>
                  {task.error_message ? <span className="muted">{task.error_message}</span> : null}
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">No worker tasks have been processed yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
