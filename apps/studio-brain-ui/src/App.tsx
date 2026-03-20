import { useEffect, useState } from "react";

type ServiceState = "healthy" | "degraded" | "offline";

type ServiceRecord = {
  key: string;
  name: string;
  zone: string;
  note: string;
  role: string;
  url: string;
  healthUrl: string;
  optional?: boolean;
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

type AlertChannel = {
  slug: string;
  name: string;
  configured: boolean;
  detail: string;
};

type AlertThreshold = {
  slug: string;
  name: string;
  condition: string;
  severity: string;
};

type AlertConfig = {
  configured_channel_count: number;
  channels: AlertChannel[];
  thresholds: AlertThreshold[];
};

type RuntimeAlert = {
  slug: string;
  severity: string;
  detail: string;
};

type RuntimeAlertSummary = {
  approvals_waiting: number;
  failed_worker_tasks: number;
  stale_workers: Array<{
    slug: string;
    display_name: string;
    status: string;
    last_seen_at: string | null;
  }>;
  active_alerts: RuntimeAlert[];
};

type BootstrapStatus = {
  status: string;
  workflow_count: number;
  detail: string;
  updated_at?: string;
};

type WorkspaceSettings = {
  studio_name: string;
  deployment_mode: "single_machine" | "control_plane_plus_worker";
  public_base_url: string;
  https_mode: "local_http" | "https_enabled" | "https_terminated_elsewhere";
  operator_name: string;
  shared_paths: {
    projects: string;
    deliveries: string;
    draft_queue: string;
    approval_queue: string;
    incoming_stems: string;
  };
  style_seed: {
    name: string;
    raw_text: string;
    source_paths: string[];
  };
  alert_destinations: {
    email_to: string[];
    webhook_url: string;
  };
  integrations: {
    n8n: boolean;
    gmail_readonly: boolean;
    gmail_send: boolean;
    instagram: boolean;
    facebook: boolean;
  };
  worker: {
    enabled: boolean;
    worker_slug: string;
    worker_api_base_url: string;
  };
  onboarding_complete: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type WorkspaceStatus = {
  settings: WorkspaceSettings;
  onboarding_required: boolean;
  onboarding_complete: boolean;
  missing_fields: string[];
  style_profile_count: number;
};

type DashboardData = {
  refreshedAt: string | null;
  services: ServiceRecord[];
  workers: WorkerNode[];
  rules: OrchestrationRule[];
  rulePacks: RulePack[];
  playbooks: Playbook[];
  tasks: WorkerTask[];
  approvals: ApprovalItem[];
  styleProfiles: StyleProfile[];
  alerts: AlertConfig;
  runtimeAlerts: RuntimeAlertSummary;
  bootstrapStatus: BootstrapStatus;
  workspace: WorkspaceStatus;
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
  ollama: "/api/ollama",
  contentPipeline: "/api/content-pipeline",
  audioQc: "/api/audio-qc",
  leadIntake: "/api/lead-intake",
  inboxTriage: "/api/inbox-triage",
  sessionPrep: "/api/session-prep",
  revisionParser: "/api/revision-parser",
  deliveryPackager: "/api/delivery-packager",
  mixPlanner: "/api/mix-planner",
  studioWorker: "/api/studio-worker",
};

const OPERATOR_NAME_KEY = "studioBrain.operatorName";
const OPERATOR_TOKEN_KEY = "studioBrain.operatorToken";

const serviceCatalog: Array<Omit<ServiceRecord, "state" | "detail">> = [
  {
    key: "project-state",
    name: "Project State",
    zone: "Control Plane",
    note: "Canonical state, approvals, queueing",
    role: "Audit backbone for jobs, worker registry, and approvals.",
    url: serviceUrl(8080),
    healthUrl: `${API.projectState}/health`,
  },
  {
    key: "crm-api",
    name: "CRM API",
    zone: "Control Plane",
    note: "Projects, leads, style profiles",
    role: "Holds artist context and customer-facing records.",
    url: serviceUrl(8090),
    healthUrl: `${API.crm}/health`,
  },
  {
    key: "openclaw",
    name: "OpenClaw",
    zone: "Control Plane",
    note: "Policy, rule packs, bootstrap status",
    role: "Decides what can run, when it must stop, and what needs approval.",
    url: serviceUrl(8100),
    healthUrl: `${API.openclaw}/health`,
  },
  {
    key: "n8n",
    name: "n8n",
    zone: "Control Plane",
    note: "Workflow editor and webhook layer",
    role: "Hosts starter automations and operator-facing webhook flows.",
    url: serviceUrl(5678),
    healthUrl: `${API.n8n}/healthz`,
  },
  {
    key: "ollama",
    name: "Ollama",
    zone: "AI Runtime",
    note: "Local model serving",
    role: "Runs local inference for planning, triage, and drafting.",
    url: serviceUrl(11434),
    healthUrl: `${API.ollama}/api/tags`,
  },
  {
    key: "lead-intake",
    name: "Lead Intake",
    zone: "Automation Modules",
    note: "Inbound lead analysis",
    role: "Scores and drafts replies for new leads before approval.",
    url: serviceUrl(8130),
    healthUrl: `${API.leadIntake}/health`,
  },
  {
    key: "inbox-triage",
    name: "Inbox Triage",
    zone: "Automation Modules",
    note: "Email classification and reply drafting",
    role: "Classifies inbox items and prepares draft responses.",
    url: serviceUrl(8140),
    healthUrl: `${API.inboxTriage}/health`,
  },
  {
    key: "content-pipeline",
    name: "Content Pipeline",
    zone: "Automation Modules",
    note: "Social and marketing drafting",
    role: "Builds captions, content drafts, and packaging-ready assets.",
    url: serviceUrl(8110),
    healthUrl: `${API.contentPipeline}/health`,
  },
  {
    key: "audio-qc",
    name: "Audio QC",
    zone: "Production Services",
    note: "Quality control and artifact checks",
    role: "Validates audio outputs before packaging or delivery.",
    url: serviceUrl(8120),
    healthUrl: `${API.audioQc}/health`,
  },
  {
    key: "session-prep",
    name: "Session Prep",
    zone: "Production Services",
    note: "Stem/session intake",
    role: "Prepares project folders and session inputs for production.",
    url: serviceUrl(8150),
    healthUrl: `${API.sessionPrep}/health`,
  },
  {
    key: "revision-parser",
    name: "Revision Parser",
    zone: "Production Services",
    note: "Revision note interpretation",
    role: "Turns client revision notes into bounded task plans.",
    url: serviceUrl(8160),
    healthUrl: `${API.revisionParser}/health`,
  },
  {
    key: "delivery-packager",
    name: "Delivery Packager",
    zone: "Production Services",
    note: "Export packaging and handoff",
    role: "Bundles approved deliverables with QC context and logs.",
    url: serviceUrl(8170),
    healthUrl: `${API.deliveryPackager}/health`,
  },
  {
    key: "mix-planner",
    name: "Mix Planner",
    zone: "Production Services",
    note: "Project planning and work breakdown",
    role: "Plans mix execution and downstream production sequencing.",
    url: serviceUrl(8180),
    healthUrl: `${API.mixPlanner}/health`,
  },
  {
    key: "studio-worker",
    name: "Studio Worker",
    zone: "Execution Node",
    note: "Optional DAW execution node",
    role: "Claims bounded SoundFlow and ReaScript jobs when enabled.",
    url: serviceUrl(8190),
    healthUrl: `${API.studioWorker}/health`,
    optional: true,
  },
];

const supportSurface = [
  {
    name: "Caddy Edge",
    detail: "TLS and LAN front door for dashboard, n8n, and OpenClaw.",
  },
  {
    name: "Postgres",
    detail: "Shared state, audit history, style records, and workflow persistence.",
  },
  {
    name: "Shared Volumes",
    detail: "Projects, approvals, drafts, and delivery artifacts across services.",
  },
];

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    studio_name: "",
    deployment_mode: "single_machine",
    public_base_url: browserProtocol === "https:" ? frontDoorUrl : "https://localhost",
    https_mode: browserProtocol === "https:" ? "https_enabled" : "local_http",
    operator_name: "owner",
    shared_paths: {
      projects: "/Volumes/StudioShare/projects",
      deliveries: "/Volumes/StudioShare/deliveries",
      draft_queue: "/Volumes/StudioShare/draft-queue",
      approval_queue: "/Volumes/StudioShare/approval-queue",
      incoming_stems: "/Volumes/StudioShare/incoming-stems",
    },
    style_seed: {
      name: "Default Studio Tone",
      raw_text: "",
      source_paths: [],
    },
    alert_destinations: {
      email_to: [],
      webhook_url: "",
    },
    integrations: {
      n8n: true,
      gmail_readonly: false,
      gmail_send: false,
      instagram: false,
      facebook: false,
    },
    worker: {
      enabled: false,
      worker_slug: "studio-mac",
      worker_api_base_url: "",
    },
    onboarding_complete: false,
    created_at: null,
    updated_at: null,
  };
}

const zoneDescriptions: Record<string, string> = {
  "Control Plane": "Always-on brain services exposed to operators and automation.",
  "AI Runtime": "Local inference used by drafting, planning, and orchestration modules.",
  "Automation Modules": "Inbound and content flows that prepare drafts for approval.",
  "Production Services": "Execution-adjacent services for planning, QC, packaging, and revisions.",
  "Execution Node": "Optional worker surface for DAW-side actions on the same Mac or another Mac.",
};

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

function summarizeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseDelimitedList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusTone(state: ServiceState | string) {
  if (state === "healthy" || state === "idle" || state === "ready" || state === "complete") return "ok";
  if (state === "degraded" || state === "busy" || state === "queued" || state === "claimed") return "warn";
  return "bad";
}

function primaryMode(workers: WorkerNode[]) {
  return workers.length ? "Mac mini + worker ready" : "single-machine default";
}

function serviceLabel(service: ServiceRecord) {
  if (service.optional && service.state === "offline") return "optional";
  return service.state;
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
    const data = await fetchJson<Record<string, unknown>>(path);
    const statusValue = typeof data.status === "string" ? data.status : undefined;
    return {
      state: statusValue === undefined || statusValue === "ok" ? "healthy" : "degraded",
      detail: statusValue === "ok" || statusValue === undefined ? "reachable" : JSON.stringify(data),
    };
  } catch (error) {
    return {
      state: "offline",
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

function groupByZone(services: ServiceRecord[]) {
  return Object.entries(
    services.reduce<Record<string, ServiceRecord[]>>((accumulator, service) => {
      accumulator[service.zone] ||= [];
      accumulator[service.zone].push(service);
      return accumulator;
    }, {}),
  );
}

async function loadDashboardData(): Promise<DashboardData> {
  const [services, workers, rules, rulePacks, playbooks, tasks, approvals, styleProfiles, alerts, runtimeAlerts, bootstrapStatus, workspace] =
    await Promise.all([
      Promise.all(
        serviceCatalog.map(async (service) => ({
          ...service,
          ...(await fetchServiceState(service.healthUrl)),
        })),
      ),
      fetchJson<WorkerNode[]>(`${API.projectState}/workers/`),
      fetchJson<OrchestrationRule[]>(`${API.openclaw}/rules`),
      fetchJson<RulePack[]>(`${API.openclaw}/rule-packs`),
      fetchJson<Playbook[]>(`${API.openclaw}/playbooks`),
      fetchJson<WorkerTask[]>(`${API.projectState}/workers/tasks/list`),
      fetchJson<ApprovalItem[]>(`${API.projectState}/approval-queue/`),
      fetchJson<StyleProfile[]>(`${API.crm}/style-profiles?scope=studio`),
      fetchJson<AlertConfig>(`${API.openclaw}/alerts/config`),
      fetchJson<RuntimeAlertSummary>(`${API.projectState}/alerts/summary`),
      fetchJson<BootstrapStatus>(`${API.openclaw}/bootstrap/status`),
      fetchJson<WorkspaceStatus>(`${API.crm}/workspace-settings/status`),
    ]);

  return {
    refreshedAt: new Date().toLocaleTimeString(),
    services,
    workers,
    rules,
    rulePacks,
    playbooks,
    tasks,
    approvals,
    styleProfiles,
    alerts,
    runtimeAlerts,
    bootstrapStatus,
    workspace,
    loadState: "ready",
    error: null,
  };
}

export function App() {
  const [data, setData] = useState<DashboardData>({
    refreshedAt: null,
    services: serviceCatalog.map((service) => ({
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
    alerts: {
      configured_channel_count: 0,
      channels: [],
      thresholds: [],
    },
    runtimeAlerts: {
      approvals_waiting: 0,
      failed_worker_tasks: 0,
      stale_workers: [],
      active_alerts: [],
    },
    bootstrapStatus: {
      status: "pending",
      workflow_count: 0,
      detail: "Waiting for bootstrap status.",
    },
    workspace: {
      settings: defaultWorkspaceSettings(),
      onboarding_required: true,
      onboarding_complete: false,
      missing_fields: ["studio_name", "shared_paths.projects", "style_seed.raw_text"],
      style_profile_count: 0,
    },
    loadState: "loading",
    error: null,
  });
  const [operatorName, setOperatorName] = useState("owner");
  const [operatorToken, setOperatorToken] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceSettings>(defaultWorkspaceSettings());
  const [workspaceDraftHydrated, setWorkspaceDraftHydrated] = useState(false);
  const [operatorNameHydrated, setOperatorNameHydrated] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [editingWorkspaceSetup, setEditingWorkspaceSetup] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const healthyCount = data.services.filter((service) => service.state === "healthy").length;
  const optionalOfflineCount = data.services.filter((service) => service.optional && service.state === "offline").length;
  const activeTaskCount = data.tasks.filter((task) => task.status === "queued" || task.status === "claimed").length;
  const failedTaskCount = data.tasks.filter((task) => task.status === "failed").length;
  const enabledRuleCount = data.rules.filter((rule) => rule.enabled).length;
  const primaryDashboardUrl = frontDoorUrl;
  const n8nUrl = frontDoorServiceUrl("n8n");
  const openclawUrl = frontDoorServiceUrl("openclaw");
  const secureHint = browserProtocol === "https:" ? "TLS active" : "HTTP only";
  const configuredAlertCount = data.alerts.configured_channel_count;
  const activeAlertCount = data.runtimeAlerts.active_alerts.length;
  const serviceZones = groupByZone(data.services);

  useEffect(() => {
    const storedName = window.localStorage.getItem(OPERATOR_NAME_KEY);
    const storedToken = window.localStorage.getItem(OPERATOR_TOKEN_KEY);
    if (storedName) {
      setOperatorName(storedName);
      setOperatorNameHydrated(true);
    }
    if (storedToken) setOperatorToken(storedToken);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(OPERATOR_NAME_KEY, operatorName);
  }, [operatorName]);

  useEffect(() => {
    if (operatorToken) {
      window.localStorage.setItem(OPERATOR_TOKEN_KEY, operatorToken);
    } else {
      window.localStorage.removeItem(OPERATOR_TOKEN_KEY);
    }
  }, [operatorToken]);

  useEffect(() => {
    if (!workspaceDraftHydrated) {
      setWorkspaceDraft(data.workspace.settings);
      setWorkspaceDraftHydrated(true);
    }
  }, [data.workspace.settings, workspaceDraftHydrated]);

  useEffect(() => {
    if (!operatorNameHydrated && data.workspace.settings.operator_name) {
      setOperatorName(data.workspace.settings.operator_name);
      setOperatorNameHydrated(true);
    }
  }, [data.workspace.settings.operator_name, operatorNameHydrated]);

  useEffect(() => {
    if (data.workspace.onboarding_required) {
      setEditingWorkspaceSetup(true);
    }
  }, [data.workspace.onboarding_required]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const nextData = await loadDashboardData();
        if (!active) return;
        setData(nextData);
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

  async function refreshData() {
    const nextData = await loadDashboardData();
    setData(nextData);
  }

  async function handleApproval(jobId: string, decision: "approve" | "reject") {
    setPendingJobId(jobId);
    setActionError(null);
    setActionMessage(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Actor": operatorName,
      };
      if (operatorToken) headers["X-Operator-Token"] = operatorToken;
      const response = await fetch(`${API.projectState}/approval-queue/${jobId}/${decision}`, {
        method: "POST",
        headers,
        body:
          decision === "reject"
            ? JSON.stringify({ reason: rejectReasons[jobId]?.trim() || "Rejected from Studio Brain UI" })
            : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `${decision} failed with ${response.status}`);
      }
      setActionMessage(decision === "approve" ? `Approved ${jobId}` : `Rejected ${jobId}`);
      if (decision === "reject") {
        setRejectReasons((current) => ({ ...current, [jobId]: "" }));
      }
      await refreshData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Unable to ${decision} job`);
    } finally {
      setPendingJobId(null);
    }
  }

  async function saveWorkspaceSettings() {
    setOnboardingSaving(true);
    setOnboardingError(null);
    setOnboardingMessage(null);
    try {
      const payload = {
        ...workspaceDraft,
        studio_name: workspaceDraft.studio_name.trim(),
        deployment_mode: workspaceDraft.deployment_mode,
        public_base_url: workspaceDraft.public_base_url.trim(),
        https_mode: workspaceDraft.https_mode,
        operator_name: workspaceDraft.operator_name.trim() || operatorName,
        shared_paths: {
          ...workspaceDraft.shared_paths,
          projects: workspaceDraft.shared_paths.projects.trim(),
          deliveries: workspaceDraft.shared_paths.deliveries.trim(),
          draft_queue: workspaceDraft.shared_paths.draft_queue.trim(),
          approval_queue: workspaceDraft.shared_paths.approval_queue.trim(),
          incoming_stems: workspaceDraft.shared_paths.incoming_stems.trim(),
        },
        alert_destinations: {
          ...workspaceDraft.alert_destinations,
          webhook_url: workspaceDraft.alert_destinations.webhook_url.trim(),
          email_to: workspaceDraft.alert_destinations.email_to.map((email) => email.trim()).filter(Boolean),
        },
        style_seed: {
          ...workspaceDraft.style_seed,
          name: workspaceDraft.style_seed.name.trim(),
          raw_text: workspaceDraft.style_seed.raw_text.trim(),
          source_paths: workspaceDraft.style_seed.source_paths.map((path) => path.trim()).filter(Boolean),
        },
        worker: {
          ...workspaceDraft.worker,
          worker_slug: workspaceDraft.worker.worker_slug.trim(),
          worker_api_base_url: workspaceDraft.worker.worker_api_base_url.trim(),
        },
      };
      const response = await fetch(`${API.crm}/workspace-settings/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        throw new Error(problem?.detail ?? `Workspace bootstrap failed with ${response.status}`);
      }
      setOnboardingMessage("Workspace onboarding saved.");
      setOperatorName(payload.operator_name);
      setWorkspaceDraft((current) => ({
        ...current,
        ...payload,
      }));
      setEditingWorkspaceSetup(false);
      setOnboardingStep(0);
      await refreshData();
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Unable to save workspace settings");
    } finally {
      setOnboardingSaving(false);
    }
  }

  const onboardingRequired = data.workspace.onboarding_required;
  const onboardingMissingCount = data.workspace.missing_fields.length;
  const onboardingStepLabels = ["Studio", "Paths", "Style", "Alerts", "Integrations"];
  const onboardingStepCount = onboardingStepLabels.length;

  return (
    <main className="app-shell">
      <section className={`panel onboarding-panel ${onboardingRequired ? "needs-setup" : "is-complete"}`}>
        <div className="panel-header onboarding-header">
          <div>
            <p className="section-kicker">Bootstrap</p>
            <h2>{editingWorkspaceSetup || onboardingRequired ? "First-run onboarding" : "Workspace ready"}</h2>
          </div>
          <div className="onboarding-header-actions">
            <span className={`status-pill ${onboardingRequired ? "warn" : "ok"}`}>
              {onboardingRequired ? `${onboardingMissingCount} items missing` : "configured"}
            </span>
            <button
              className="action-button"
              type="button"
              onClick={() => {
                setEditingWorkspaceSetup(true);
                setOnboardingStep(0);
                setWorkspaceDraft(data.workspace.settings);
              }}
            >
              {onboardingRequired ? "continue setup" : "edit setup"}
            </button>
          </div>
        </div>
        <p className="panel-note">
          This is the missing novice layer: tell the system who the studio is, how this machine is being used,
          where files live, what tone to write in, how operators should be alerted, and whether a worker Mac is optional.
        </p>
        <div className="summary-pill-row onboarding-steps-row">
          {onboardingStepLabels.map((label) => (
            <span key={label} className="summary-pill">
              {label}
            </span>
          ))}
          <span className="summary-pill">{onboardingStepCount} steps</span>
        </div>
        <div className="onboarding-grid">
          <article className="mini-card">
            <span className="metric-label">1. Identity</span>
            <label className="field">
              <span className="metric-label">Studio name</span>
              <input
                value={workspaceDraft.studio_name}
                onChange={(event) => setWorkspaceDraft((current) => ({ ...current, studio_name: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="metric-label">Deployment mode</span>
              <select
                value={workspaceDraft.deployment_mode}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    deployment_mode: event.target.value as WorkspaceSettings["deployment_mode"],
                    worker: {
                      ...current.worker,
                      enabled: event.target.value === "control_plane_plus_worker",
                    },
                  }))}
              >
                <option value="single_machine">Single machine</option>
                <option value="control_plane_plus_worker">Control plane + worker</option>
              </select>
            </label>
            <label className="field">
              <span className="metric-label">Primary operator</span>
              <input
                value={workspaceDraft.operator_name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setWorkspaceDraft((current) => ({ ...current, operator_name: nextName }));
                  setOperatorName(nextName);
                }}
              />
            </label>
          </article>

          <article className="mini-card">
            <span className="metric-label">2. Front Door</span>
            <label className="field">
              <span className="metric-label">Public base URL</span>
              <input
                value={workspaceDraft.public_base_url}
                placeholder="https://localhost"
                onChange={(event) => setWorkspaceDraft((current) => ({ ...current, public_base_url: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="metric-label">HTTPS mode</span>
              <select
                value={workspaceDraft.https_mode}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    https_mode: event.target.value as WorkspaceSettings["https_mode"],
                  }))}
              >
                <option value="local_http">HTTP only for now</option>
                <option value="https_enabled">Caddy HTTPS enabled</option>
                <option value="https_terminated_elsewhere">HTTPS terminated elsewhere</option>
              </select>
            </label>
            <div className="mini-inline-note">
              <span>Current browser</span>
              <strong>{frontDoorUrl}</strong>
            </div>
          </article>

          <article className="mini-card">
            <span className="metric-label">3. Shared Paths</span>
            {(["projects", "deliveries", "draft_queue", "approval_queue", "incoming_stems"] as const).map((pathKey) => (
              <label key={pathKey} className="field">
                <span className="metric-label">{pathKey.replace(/_/g, " ")}</span>
                <input
                  value={workspaceDraft.shared_paths[pathKey]}
                  onChange={(event) =>
                    setWorkspaceDraft((current) => ({
                      ...current,
                      shared_paths: {
                        ...current.shared_paths,
                        [pathKey]: event.target.value,
                      },
                    }))}
                />
              </label>
            ))}
          </article>

          <article className="mini-card">
            <span className="metric-label">4. Studio Voice</span>
            <label className="field">
              <span className="metric-label">Style profile name</span>
              <input
                value={workspaceDraft.style_seed.name}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    style_seed: { ...current.style_seed, name: event.target.value },
                  }))}
              />
            </label>
            <label className="field">
              <span className="metric-label">Tone and voice seed</span>
              <textarea
                value={workspaceDraft.style_seed.raw_text}
                placeholder="How should this studio sound in email, content, and client-facing drafts?"
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    style_seed: { ...current.style_seed, raw_text: event.target.value },
                  }))}
              />
            </label>
            <label className="field">
              <span className="metric-label">Reference files</span>
              <textarea
                value={workspaceDraft.style_seed.source_paths.join("\n")}
                placeholder="/path/to/brand-guide.txt"
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    style_seed: { ...current.style_seed, source_paths: parseDelimitedList(event.target.value) },
                  }))}
              />
            </label>
          </article>

          <article className="mini-card">
            <span className="metric-label">5. Alerts And Integrations</span>
            <label className="field">
              <span className="metric-label">Alert emails</span>
              <textarea
                value={workspaceDraft.alert_destinations.email_to.join("\n")}
                placeholder="ops@studio.com"
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    alert_destinations: {
                      ...current.alert_destinations,
                      email_to: parseDelimitedList(event.target.value),
                    },
                  }))}
              />
            </label>
            <label className="field">
              <span className="metric-label">Alert webhook</span>
              <input
                value={workspaceDraft.alert_destinations.webhook_url}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    alert_destinations: {
                      ...current.alert_destinations,
                      webhook_url: event.target.value,
                    },
                  }))}
              />
            </label>
            <div className="toggle-grid">
              {([
                ["n8n", "n8n"],
                ["gmail_readonly", "Gmail read-only"],
                ["gmail_send", "Gmail send"],
                ["instagram", "Instagram"],
                ["facebook", "Facebook"],
              ] as const).map(([key, label]) => (
                <label key={key} className="toggle-chip">
                  <input
                    type="checkbox"
                    checked={workspaceDraft.integrations[key]}
                    onChange={(event) =>
                      setWorkspaceDraft((current) => ({
                        ...current,
                        integrations: {
                          ...current.integrations,
                          [key]: event.target.checked,
                        },
                      }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </article>

          <article className="mini-card">
            <span className="metric-label">6. Optional Worker</span>
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={workspaceDraft.worker.enabled}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    worker: { ...current.worker, enabled: event.target.checked },
                    deployment_mode: event.target.checked ? "control_plane_plus_worker" : "single_machine",
                  }))}
              />
              <span>Enable worker configuration</span>
            </label>
            <label className="field">
              <span className="metric-label">Worker slug</span>
              <input
                value={workspaceDraft.worker.worker_slug}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    worker: { ...current.worker, worker_slug: event.target.value },
                  }))}
                disabled={!workspaceDraft.worker.enabled}
              />
            </label>
            <label className="field">
              <span className="metric-label">Worker API URL</span>
              <input
                value={workspaceDraft.worker.worker_api_base_url}
                onChange={(event) =>
                  setWorkspaceDraft((current) => ({
                    ...current,
                    worker: { ...current.worker, worker_api_base_url: event.target.value },
                  }))}
                disabled={!workspaceDraft.worker.enabled}
              />
            </label>
          </article>
        </div>
        <div className="onboarding-footer">
          <div className="missing-list">
            <span className="metric-label">Still missing</span>
            <strong>{data.workspace.missing_fields.length ? data.workspace.missing_fields.join(", ") : "Nothing required is missing."}</strong>
          </div>
          <button className="action-button ok" disabled={onboardingSaving} onClick={saveWorkspaceSettings}>
            {onboardingSaving ? "saving" : "save onboarding"}
          </button>
        </div>
        {onboardingMessage ? <p className="feedback ok">{onboardingMessage}</p> : null}
        {onboardingError ? <p className="feedback bad">{onboardingError}</p> : null}
      </section>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AI Audio Studio</p>
          <h1>Studio Brain Control Room</h1>
          <p className="lede">
            Live operator surface for the full Mac-first stack: orchestration, approvals, style context,
            automation, production services, and the optional DAW worker in one place.
          </p>
          <div className="hero-tags">
            <span className="tag">{primaryMode(data.workers)}</span>
            <span className="tag">{secureHint}</span>
            <span className="tag">{healthyCount}/{data.services.length} services observed</span>
            <span className="tag">{enabledRuleCount} active rules</span>
            <span className="tag">{data.playbooks.length} starter automations</span>
          </div>
        </div>
        <div className="hero-rail">
          <div className={`metric ${statusTone(data.loadState)}`}>
            <span className="metric-label">Control plane</span>
            <strong>{data.loadState}</strong>
            <span className="metric-subtle">{data.error ?? "Operator view is polling every 15 seconds."}</span>
          </div>
          <div className="metric-grid mission-grid">
            <div className="metric">
              <span className="metric-label">Refreshed</span>
              <strong>{data.refreshedAt ?? "waiting"}</strong>
            </div>
            <div className="metric">
              <span className="metric-label">Approvals</span>
              <strong>{data.approvals.length}</strong>
            </div>
            <div className="metric">
              <span className="metric-label">Live tasks</span>
              <strong>{activeTaskCount}</strong>
            </div>
            <div className={`metric ${activeAlertCount ? "warn" : "ok"}`}>
              <span className="metric-label">Active alerts</span>
              <strong>{activeAlertCount}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="command-grid">
        <article className="panel command-card accent-gold">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Surface</p>
              <h2>Operator Entry</h2>
            </div>
            <span className="count-pill">{browserProtocol === "https:" ? "secure" : "live"}</span>
          </div>
          <div className="link-list">
            <a className="link-chip" href={primaryDashboardUrl}>
              <span>Control room</span>
              <p>Primary operator front door for the entire control plane.</p>
            </a>
            <a className="link-chip" href={n8nUrl}>
              <span>n8n editor</span>
              <p>Workflow automation console for starter packs and webhook wiring.</p>
            </a>
            <a className="link-chip" href={openclawUrl}>
              <span>OpenClaw API</span>
              <p>Rule orchestration, bootstrap state, and policy enforcement surface.</p>
            </a>
          </div>
          <p className="panel-note">
            Operator-facing access should stay concentrated here. Direct ports remain available for
            engineering and worker traffic, but the dashboard should be the normal entry path.
          </p>
          <p className="panel-note">
            HTTPS becomes fully trusted after the Caddy local root certificate is imported on each
            operator Mac.
          </p>
        </article>

        <article className="panel command-card accent-blue">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Posture</p>
              <h2>Deployment Mode</h2>
            </div>
            <span className={`status-pill ${data.workers.length ? "warn" : "ok"}`}>{primaryMode(data.workers)}</span>
          </div>
          <div className="stat-strip">
            <div>
              <span className="metric-label">Observed services</span>
              <strong>{healthyCount}/{data.services.length}</strong>
            </div>
            <div>
              <span className="metric-label">Optional offline</span>
              <strong>{optionalOfflineCount}</strong>
            </div>
            <div>
              <span className="metric-label">Workers</span>
              <strong>{data.workers.length}</strong>
            </div>
          </div>
          <p className="panel-note">
            Single-machine mode is the default. The worker is additive capacity for DAW-side execution,
            not a requirement to use the stack.
          </p>
        </article>

        <article className="panel command-card accent-green">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Automation</p>
              <h2>Bootstrap And Alerts</h2>
            </div>
            <span className={`status-pill ${data.bootstrapStatus.status === "imported" || data.bootstrapStatus.status === "skipped" ? "ok" : "warn"}`}>
              {data.bootstrapStatus.status}
            </span>
          </div>
          <div className="stat-strip">
            <div>
              <span className="metric-label">Starter workflows</span>
              <strong>{data.bootstrapStatus.workflow_count}</strong>
            </div>
            <div>
              <span className="metric-label">Alert channels</span>
              <strong>{configuredAlertCount}/{data.alerts.channels.length}</strong>
            </div>
            <div>
              <span className="metric-label">Failed tasks</span>
              <strong>{failedTaskCount}</strong>
            </div>
          </div>
          <p className="panel-note">{data.bootstrapStatus.detail}</p>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-8">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Topology</p>
              <h2>Full Service Matrix</h2>
            </div>
            <span className="count-pill">{data.services.length}</span>
          </div>
          <div className="zone-stack">
            {serviceZones.map(([zone, services]) => (
              <section key={zone} className="zone-card">
                <div className="zone-header">
                  <div>
                    <h3>{zone}</h3>
                    <p>{zoneDescriptions[zone]}</p>
                  </div>
                  <span className="count-pill">{services.filter((service) => service.state === "healthy").length}/{services.length}</span>
                </div>
                <div className="table-stack">
                  {services.map((service) => {
                    return (
                      <div key={service.key} className="table-row service-row">
                        <div className="row-main">
                          <strong>{service.name}</strong>
                          <div className="muted">{service.role}</div>
                          <div className="meta-inline">
                            <span>{service.note}</span>
                            <span>{service.optional ? "optional execution surface" : "proxied into the control plane"}</span>
                          </div>
                        </div>
                        <div className="row-meta">
                          <span className={`status-pill ${service.optional && service.state === "offline" ? "warn" : statusTone(service.state)}`}>
                            {serviceLabel(service)}
                          </span>
                          <span className="muted">{service.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </article>

        <aside className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Operator</p>
              <h2>Control Inputs</h2>
            </div>
            <span className="count-pill">{operatorName}</span>
          </div>
          <div className="operator-grid">
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
          <p className="panel-note">
            Approval actions send `X-Actor` and `X-Operator-Token`. Keep this panel set before operating the queue.
          </p>
          {actionMessage ? <p className="feedback ok">{actionMessage}</p> : null}
          {actionError ? <p className="feedback bad">{actionError}</p> : null}

          <div className="divider" />

          <div className="panel-header compact-header">
            <div>
              <p className="section-kicker">Fabric</p>
              <h2>Support Surface</h2>
            </div>
          </div>
          <div className="support-stack">
            {supportSurface.map((item) => (
              <div key={item.name} className="support-card">
                <strong>{item.name}</strong>
                <div className="muted">{item.detail}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-6">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Action Queue</p>
              <h2>Approvals</h2>
            </div>
            <span className="count-pill">{data.approvals.length}</span>
          </div>
          <div className="table-stack">
            {data.approvals.length ? (
              data.approvals.slice(0, 6).map((job) => (
                <div key={job.id} className="table-row approval-row">
                  <div className="row-main">
                    <strong>{job.module}</strong>
                    <div className="muted">{job.action}</div>
                    <div className="meta-inline">
                      <span>{job.requested_by ?? "system"}</span>
                      <span>{summarizeTime(job.created_at)}</span>
                    </div>
                    <label className="field compact-field">
                      <span className="metric-label">Reject reason</span>
                      <input
                        value={rejectReasons[job.id] ?? ""}
                        placeholder="Optional rejection note"
                        onChange={(event) => setRejectReasons((current) => ({ ...current, [job.id]: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill warn">awaiting approval</span>
                    <div className="action-row">
                      <button
                        className="action-button ok"
                        disabled={!operatorName || pendingJobId === job.id}
                        onClick={() => handleApproval(job.id, "approve")}
                      >
                        {pendingJobId === job.id ? "working" : "approve"}
                      </button>
                      <button
                        className="action-button bad"
                        disabled={!operatorName || pendingJobId === job.id}
                        onClick={() => handleApproval(job.id, "reject")}
                      >
                        reject
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No items are waiting for approval.</p>
            )}
          </div>
        </article>

        <article className="panel panel-span-6">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Escalation</p>
              <h2>Live Alerts</h2>
            </div>
            <span className="count-pill">{activeAlertCount}</span>
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
              <span className="metric-label">Stale workers</span>
              <strong>{data.runtimeAlerts.stale_workers.length}</strong>
            </div>
          </div>
          <div className="table-stack top-gap">
            {data.runtimeAlerts.active_alerts.length ? (
              data.runtimeAlerts.active_alerts.map((alert) => (
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
          <div className="table-stack top-gap">
            {data.alerts.channels.map((channel) => (
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
        </article>
      </section>

      <section className="workspace-grid">
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
              data.workers.map((worker) => (
                <div key={worker.id} className="table-row">
                  <div className="row-main">
                    <strong>{worker.display_name}</strong>
                    <div className="muted">
                      {worker.slug} · {worker.platform} · {worker.host ?? "no host"}
                    </div>
                    <div className="meta-inline">
                      <span>{asArray(worker.capabilities).join(", ")}</span>
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${statusTone(worker.status)}`}>{worker.status}</span>
                    <span className="muted">
                      {worker.api_base_url ? "worker api reachable" : "no api url"}
                    </span>
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
              data.tasks.slice(0, 8).map((task) => (
                <div key={task.id} className="table-row">
                  <div className="row-main">
                    <strong>{task.task_type}</strong>
                    <div className="muted">
                      {task.worker_slug ?? task.claimed_by ?? "unassigned"} · {task.priority}
                    </div>
                    {task.error_message ? <div className="muted">{task.error_message}</div> : null}
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${statusTone(task.status)}`}>{task.status}</span>
                    <span className="muted">{summarizeTime(task.created_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No worker tasks have been processed yet.</p>
            )}
          </div>
          <p className="panel-note">
            Historical smoke-test failures stay visible until the backing rows are cleared. Treat this as
            operational history, not only current breakage.
          </p>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Context</p>
              <h2>Style Profiles</h2>
            </div>
            <span className="count-pill">{data.styleProfiles.length}</span>
          </div>
          <div className="table-stack">
            {data.styleProfiles.length ? (
              data.styleProfiles.slice(0, 5).map((profile) => (
                <div key={profile.id} className="table-row">
                  <div className="row-main">
                    <strong>{profile.name}</strong>
                    <div className="muted">
                      {profile.scope} · {profile.source_type}
                    </div>
                    <div className="muted">
                      {profile.extracted_guidance?.summary ?? "No guidance summary extracted yet."}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill ok">active context</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No style profiles have been ingested yet.</p>
            )}
          </div>
        </article>

        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Rules</p>
              <h2>Rule Packs</h2>
            </div>
            <span className="count-pill">{data.rulePacks.length}</span>
          </div>
          <div className="table-stack">
            {data.rulePacks.length ? (
              data.rulePacks.map((pack) => (
                <div key={pack.slug} className="table-row">
                  <div className="row-main">
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

        <article className="panel panel-span-4">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Automations</p>
              <h2>Starter Playbooks</h2>
            </div>
            <span className="count-pill">{data.playbooks.length}</span>
          </div>
          <div className="table-stack">
            {data.playbooks.length ? (
              data.playbooks.map((playbook) => (
                <div key={playbook.slug} className="table-row">
                  <div className="row-main">
                    <strong>{playbook.name}</strong>
                    <div className="muted">
                      {playbook.trigger_module}.{playbook.trigger_action} → {playbook.target_module}
                    </div>
                    <div className="muted">{playbook.summary}</div>
                  </div>
                  <div className="row-meta">
                    <span className="status-pill ok">prebuilt</span>
                    <span className="muted">{playbook.n8n_workflow_slug}</span>
                    <span className="muted">{playbook.webhook_path}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No starter automations are available yet.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
