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

type RulePack = {
  slug: string;
  name: string;
  description: string;
  rule_count: number;
};

type Playbook = {
  slug: string;
  name: string;
  summary: string;
  n8n_workflow_slug: string;
  trigger_module: string;
  trigger_action: string;
  target_module: string;
  webhook_path: string;
  required_context: string[];
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

type ApprovalItem = {
  id: string;
  module: string;
  action: string;
  created_at: string;
  requested_by?: string | null;
  project_id?: string | null;
};

type StyleProfile = {
  id: string;
  name: string;
  scope: string;
  source_type: string;
  extracted_guidance?: {
    summary?: string;
    tone_markers?: string[];
  } | null;
};

type DashboardData = {
  refreshedAt: string | null;
  services: ServiceCard[];
  workers: WorkerNode[];
  rules: OrchestrationRule[];
  rulePacks: RulePack[];
  playbooks: Playbook[];
  tasks: WorkerTask[];
  approvals: ApprovalItem[];
  styleProfiles: StyleProfile[];
  loadState: "loading" | "ready" | "error";
  error: string | null;
};

const browserHost = window.location.hostname || "localhost";
const browserProtocol = window.location.protocol || "http:";
const frontDoorUrl = `${browserProtocol}//${window.location.host}`;
const serviceUrl = (port: number) => `http://${browserHost}:${port}`;

function isIpv4Address(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function frontDoorServiceUrl(service: "n8n" | "openclaw") {
  if (browserProtocol === "https:" && browserHost.includes(".") && !isIpv4Address(browserHost)) {
    return `https://${service}.${browserHost}`;
  }
  return service === "n8n" ? serviceUrl(5678) : serviceUrl(8100);
}

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
    note: "Policy-enforced orchestration and prebuilt rule packs",
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

function formatUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      origin: `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`,
      path: parsed.pathname !== "/" ? parsed.pathname : "",
    };
  } catch {
    return { origin: url, path: "" };
  }
}

function summarizeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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

function primaryMode(workers: WorkerNode[]) {
  return workers.length ? "control plane + worker" : "single-machine";
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
    rulePacks: [],
    playbooks: [],
    tasks: [],
    approvals: [],
    styleProfiles: [],
    loadState: "loading",
    error: null,
  });

  const healthyCount = data.services.filter((service) => service.state === "healthy").length;
  const workerCount = data.workers.length;
  const activeTaskCount = data.tasks.filter((task) => task.status === "queued" || task.status === "claimed").length;
  const enabledRuleCount = data.rules.filter((rule) => rule.enabled).length;
  const playbookCount = data.playbooks.length;
  const primaryDashboardUrl = frontDoorUrl;
  const n8nUrl = frontDoorServiceUrl("n8n");
  const openclawUrl = frontDoorServiceUrl("openclaw");
  const secureHint = browserProtocol === "https:" ? "TLS active" : "HTTP only";

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const [projectState, crm, openclaw, n8n, workers, rules, rulePacks, playbooks, tasks, approvals, styleProfiles] =
          await Promise.all([
            fetchServiceState(`${API.projectState}/health`),
            fetchServiceState(`${API.crm}/health`),
            fetchServiceState(`${API.openclaw}/health`),
            fetchServiceState(`${API.n8n}/healthz`),
            fetchJson<WorkerNode[]>(`${API.projectState}/workers/`),
            fetchJson<OrchestrationRule[]>(`${API.openclaw}/rules`),
            fetchJson<RulePack[]>(`${API.openclaw}/rule-packs`),
            fetchJson<Playbook[]>(`${API.openclaw}/playbooks`),
            fetchJson<WorkerTask[]>(`${API.projectState}/workers/tasks/list`),
            fetchJson<ApprovalItem[]>(`${API.projectState}/approval-queue/`),
            fetchJson<StyleProfile[]>(`${API.crm}/style-profiles?scope=studio`),
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
          rulePacks,
          playbooks,
          tasks,
          approvals,
          styleProfiles,
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
          <h1>Studio Brain</h1>
          <p className="lede">
            Operator console for a single production Mac or a Mac mini control plane with an
            optional studio worker. Rules, approvals, style context, and worker execution stay
            visible in one place.
          </p>
          <div className="hero-tags">
            <span className="tag">{primaryMode(data.workers)}</span>
            <span className="tag">{secureHint}</span>
            <span className="tag">approval gated</span>
            <span className="tag">prebuilt rule packs</span>
          </div>
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
          <div className="metric metric-grid">
            <div>
              <span className="metric-label">Services</span>
              <strong>{healthyCount}/{data.services.length}</strong>
            </div>
            <div>
              <span className="metric-label">Workers</span>
              <strong>{workerCount}</strong>
            </div>
            <div>
              <span className="metric-label">Rules</span>
              <strong>{enabledRuleCount}</strong>
            </div>
            <div>
              <span className="metric-label">Playbooks</span>
              <strong>{playbookCount}</strong>
            </div>
            <div>
              <span className="metric-label">Approvals</span>
              <strong>{data.approvals.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="content-grid top-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Access Surface</h2>
            <span className="count-pill">{browserProtocol === "https:" ? "secure" : "live"}</span>
          </div>
          <div className="link-list">
            <a className="link-chip" href={primaryDashboardUrl}>
              <span>Dashboard</span>
              <code>{primaryDashboardUrl}</code>
            </a>
            <a className="link-chip" href={n8nUrl}>
              <span>n8n Editor</span>
              <code>{n8nUrl}</code>
            </a>
            <a className="link-chip" href={serviceUrl(8080)}>
              <span>Project State API</span>
              <code>{serviceUrl(8080)}</code>
            </a>
            <a className="link-chip" href={openclawUrl}>
              <span>OpenClaw API</span>
              <code>{openclawUrl}</code>
            </a>
          </div>
          <p className="panel-note">
            Use the dashboard as the operator front door. Direct service ports remain available for
            engineering, automation, and worker registration.
          </p>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Operating Mode</h2>
            <span className={`status-pill ${workerCount ? "warn" : "ok"}`}>{primaryMode(data.workers)}</span>
          </div>
          <div className="mini-grid">
            <div className="mini-card">
              <span className="metric-label">Recommended</span>
              <strong>One powerful Mac first</strong>
              <span className="metric-subtle">
                Keep the worker optional unless you need filesystem isolation or a dedicated studio workstation.
              </span>
            </div>
            <div className="mini-card">
              <span className="metric-label">Current</span>
              <strong>{workerCount ? "Remote execution enabled" : "All local execution"}</strong>
              <span className="metric-subtle">
                {workerCount
                  ? "A registered worker can claim bounded DAW and packaging tasks."
                  : "The control plane can operate alone until a second Mac is available."}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="card-grid">
        {data.services.map((service) => {
          const formatted = formatUrl(service.url);
          return (
            <article key={service.name} className={`panel service-card ${statusTone(service.state)}`}>
              <div className="panel-header">
                <h2>{service.name}</h2>
                <span className={`status-pill ${statusTone(service.state)}`}>{service.state}</span>
              </div>
              <p>{service.note}</p>
              <div className="endpoint">
                <span className="endpoint-origin">{formatted.origin}</span>
                {formatted.path ? <span className="endpoint-path">{formatted.path}</span> : null}
              </div>
              <span className="metric-subtle">{service.detail}</span>
            </article>
          );
        })}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Approval Queue</h2>
            <span className="count-pill">{data.approvals.length}</span>
          </div>
          <div className="table-stack">
            {data.approvals.length ? (
              data.approvals.slice(0, 5).map((job) => (
                <div key={job.id} className="table-row">
                  <div>
                    <strong>{job.module}</strong>
                    <div className="muted">{job.action}</div>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill warn">awaiting approval</span>
                    <span className="muted">{job.requested_by ?? "system"}</span>
                    <span className="muted">{summarizeTime(job.created_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No items are waiting for approval.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Style Profiles</h2>
            <span className="count-pill">{data.styleProfiles.length}</span>
          </div>
          <div className="table-stack">
            {data.styleProfiles.length ? (
              data.styleProfiles.slice(0, 4).map((profile) => (
                <div key={profile.id} className="table-row">
                  <div>
                    <strong>{profile.name}</strong>
                    <div className="muted">
                      {profile.scope} · {profile.source_type}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill ok">active context</span>
                    <span className="muted">
                      {profile.extracted_guidance?.summary ?? "No guidance summary extracted yet."}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No style profiles have been ingested yet.</p>
            )}
          </div>
        </article>
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
                    <span className="muted">
                      {worker.api_base_url ? formatUrl(worker.api_base_url).origin : "no api url"}
                    </span>
                    <span className="muted">seen {summarizeTime(worker.last_seen_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No worker registrations yet. Single-machine mode is still fully usable.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Prebuilt Rule Packs</h2>
            <span className="count-pill">{data.rulePacks.length}</span>
          </div>
          <div className="table-stack">
            {data.rulePacks.length ? (
              data.rulePacks.map((pack) => (
                <div key={pack.slug} className="table-row">
                  <div>
                    <strong>{pack.name}</strong>
                    <div className="muted">{pack.description}</div>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill ok">seeded</span>
                    <span className="muted">{pack.rule_count} rules</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No default rule packs available.</p>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Starter Automations</h2>
          <span className="count-pill">{data.playbooks.length}</span>
        </div>
        <div className="table-stack">
          {data.playbooks.length ? (
            data.playbooks.map((playbook) => (
              <div key={playbook.slug} className="table-row">
                <div>
                  <strong>{playbook.name}</strong>
                  <div className="muted">
                    {playbook.trigger_module}.{playbook.trigger_action} &rarr; {playbook.target_module}
                  </div>
                  <div className="muted">{playbook.summary}</div>
                </div>
                <div className="row-meta">
                  <span className="status-pill ok">prebuilt</span>
                  <span className="muted">{playbook.n8n_workflow_slug}</span>
                  <span className="muted">{playbook.webhook_path}</span>
                  <span className="muted">needs {playbook.required_context.join(", ")}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">No starter automations are available yet.</p>
          )}
        </div>
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
                  <span className="muted">{summarizeTime(task.created_at)}</span>
                  {task.error_message ? <span className="muted">{task.error_message}</span> : null}
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">No worker tasks have been processed yet.</p>
          )}
        </div>
        <p className="panel-note">
          Historical smoke-test failures remain visible until the backing rows are cleared. Treat this panel as runtime history, not just current failures.
        </p>
      </section>
    </main>
  );
}
