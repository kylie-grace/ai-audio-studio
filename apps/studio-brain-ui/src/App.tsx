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

type StarterPack = {
  slug: string;
  name: string;
  description: string;
  rule_slugs: string[];
  alert_channels: string[];
  rules: OrchestrationRule[];
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
  preview?: {
    kind?: string;
    title?: string;
    trigger_type?: string;
    requested_by?: string | null;
    trigger_payload?: Record<string, unknown>;
    project?: {
      id?: string;
      slug?: string;
      client_name?: string;
      service_type?: string;
      status?: string;
    };
    lead?: {
      id?: string;
      source?: string;
      raw_input?: string;
      normalized?: Record<string, unknown>;
      fit_score?: number;
      urgency_score?: number;
      draft_reply?: string;
    };
    draft?: {
      thread_id?: string;
      message_type?: string;
      classification?: string;
      urgency?: string;
      draft_subject?: string;
      draft_body?: string;
    };
    drafts?: Array<{
      platform?: string;
      caption?: string;
      hashtags?: string[];
      variant_short?: string;
      status?: string;
    }>;
    revision?: {
      raw_notes?: string;
      parsed_changes?: Array<Record<string, unknown>>;
      soundflow_script?: string | null;
      reascript_path?: string | null;
      status?: string;
    };
  };
};

type ProjectRecord = {
  id: string;
  slug: string;
  client_name: string;
  client_email?: string | null;
  service_type: string;
  status: string;
  budget_signal?: string | null;
  timeline?: string | null;
  notes?: string | null;
  lead_count?: number;
  created_at?: string;
  updated_at?: string;
};

type AuditEntry = {
  id?: number | string;
  job_id?: string | null;
  project_id?: string | null;
  actor: string;
  action: string;
  tier: number;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

type StyleProfile = {
  id: string;
  name: string;
  scope: string;
  source_type: string;
  raw_text?: string;
  file_paths?: string[];
  extracted_guidance?: {
    summary?: string;
    tone_markers?: string[];
    preferred_phrases?: string[];
  } | null;
  updated_at?: string;
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

type AlertDeliveryResult = {
  channel: string;
  status: string;
  detail: string;
};

type AlertActionResponse = {
  status?: string;
  event?: RuntimeAlert;
  deliveries?: AlertDeliveryResult[];
  dispatched_count?: number;
  results?: Array<{
    deliveries: AlertDeliveryResult[];
  }>;
};

type RuntimeAlert = {
  slug: string;
  severity: string;
  detail: string;
};

type RuntimeAlertSummary = {
  approvals_waiting: number;
  failed_worker_tasks: number;
  claimed_worker_tasks: number;
  expired_worker_leases: number;
  stale_workers: Array<{
    slug: string;
    display_name: string;
    status: string;
    last_seen_at: string | null;
  }>;
  active_alerts: RuntimeAlert[];
};

type RuntimeRecovery = {
  stale_workers: Array<{
    slug: string;
    display_name: string;
    status: string;
    host?: string | null;
    api_base_url?: string | null;
    last_seen_at: string | null;
  }>;
  failed_tasks: WorkerTask[];
  claimed_tasks: Array<WorkerTask & { lease_expires_at?: string | null; lease_state?: "active" | "expired" }>;
  summary: {
    failed_task_count: number;
    claimed_task_count: number;
    expired_claim_count: number;
    stale_worker_count: number;
  };
};

type BootstrapStatus = {
  status: string;
  workflow_count: number;
  detail: string;
  updated_at?: string;
};

type ServiceStatusPayload = Record<string, unknown>;

type ModuleSettings = {
  lead_intake: {
    enabled: boolean;
    minimum_fit_score: number;
    response_sla_hours: number;
    auto_create_projects: boolean;
  };
  inbox_triage: {
    enabled: boolean;
    ignore_noise: boolean;
    high_priority_types: string[];
  };
  content_pipeline: {
    enabled: boolean;
    default_platforms: string[];
    require_assets: boolean;
    approval_required: boolean;
  };
  audio_qc: {
    enabled: boolean;
    default_target: string;
    hard_fail_on_clipping: boolean;
  };
  session_prep: {
    enabled: boolean;
    filename_space_warning: boolean;
    remote_enabled: boolean;
  };
  revision_parser: {
    enabled: boolean;
    default_daw: string;
    confidence_threshold: number;
  };
  delivery_packager: {
    enabled: boolean;
    require_qc_pass: boolean;
    include_manifest: boolean;
  };
  mix_planner: {
    enabled: boolean;
    default_focus: string[];
  };
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
  module_settings: ModuleSettings;
  onboarding_complete: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type WorkspaceStatus = {
  readiness_checks: Array<{
    slug: string;
    name: string;
    status: "ready" | "partial" | "needs-attention" | "optional";
    detail: string;
  }>;
  readiness_summary: {
    ready_count: number;
    partial_count: number;
    needs_attention_count: number;
    optional_count: number;
  };
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
  starterPacks: StarterPack[];
  playbooks: Playbook[];
  tasks: WorkerTask[];
  approvals: ApprovalItem[];
  projects: ProjectRecord[];
  leads: Array<{
    id: string;
    project_id?: string | null;
    source: string;
    fit_score?: number | null;
    urgency_score?: number | null;
    draft_reply?: string | null;
    created_at?: string;
  }>;
  auditLog: AuditEntry[];
  styleProfiles: StyleProfile[];
  alerts: AlertConfig;
  runtimeAlerts: RuntimeAlertSummary;
  runtimeRecovery: RuntimeRecovery;
  bootstrapStatus: BootstrapStatus;
  workspace: WorkspaceStatus;
  loadState: "loading" | "ready" | "error";
  error: string | null;
};

type TabId = "overview" | "operations" | "automation" | "context" | "settings";

type WorkflowId = "start-day" | "approvals" | "recover-runtime" | "manage-automation" | "update-setup";

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

const serviceProxyBase: Record<string, string> = {
  "project-state": API.projectState,
  "crm-api": API.crm,
  openclaw: API.openclaw,
  n8n: API.n8n,
  ollama: API.ollama,
  "content-pipeline": API.contentPipeline,
  "audio-qc": API.audioQc,
  "lead-intake": API.leadIntake,
  "inbox-triage": API.inboxTriage,
  "session-prep": API.sessionPrep,
  "revision-parser": API.revisionParser,
  "delivery-packager": API.deliveryPackager,
  "mix-planner": API.mixPlanner,
  "studio-worker": API.studioWorker,
};

const serviceStatusApi: Record<string, string> = {
  "project-state": `${API.projectState}/status`,
  "crm-api": `${API.crm}/status`,
  openclaw: `${API.openclaw}/status`,
  n8n: `${API.n8n}/healthz`,
  ollama: `${API.ollama}/api/tags`,
  "content-pipeline": `${API.contentPipeline}/status`,
  "audio-qc": `${API.audioQc}/status`,
  "lead-intake": `${API.leadIntake}/status`,
  "inbox-triage": `${API.inboxTriage}/status`,
  "session-prep": `${API.sessionPrep}/status`,
  "revision-parser": `${API.revisionParser}/status`,
  "delivery-packager": `${API.deliveryPackager}/status`,
  "mix-planner": `${API.mixPlanner}/status`,
  "studio-worker": `${API.studioWorker}/status`,
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

const primaryTabs: Array<{ id: TabId; label: string; summary: string; accent: string }> = [
  {
    id: "overview",
    label: "Overview",
    summary: "Platform posture, service health, and support fabric.",
    accent: "tab-overview",
  },
  {
    id: "operations",
    label: "Operations",
    summary: "Approvals, alerts, runtime recovery, and worker control.",
    accent: "tab-operations",
  },
  {
    id: "automation",
    label: "Automation",
    summary: "OpenClaw rules, starter packs, playbooks, and automation modules.",
    accent: "tab-automation",
  },
  {
    id: "context",
    label: "Context",
    summary: "Studio identity, style context, paths, and deployment posture.",
    accent: "tab-context",
  },
  {
    id: "settings",
    label: "Settings",
    summary: "First-run onboarding, integrations, alert destinations, and worker options.",
    accent: "tab-settings",
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
    module_settings: {
      lead_intake: {
        enabled: true,
        minimum_fit_score: 55,
        response_sla_hours: 24,
        auto_create_projects: true,
      },
      inbox_triage: {
        enabled: true,
        ignore_noise: true,
        high_priority_types: ["payment", "revision-request"],
      },
      content_pipeline: {
        enabled: true,
        default_platforms: ["instagram", "facebook"],
        require_assets: false,
        approval_required: true,
      },
      audio_qc: {
        enabled: true,
        default_target: "streaming",
        hard_fail_on_clipping: true,
      },
      session_prep: {
        enabled: true,
        filename_space_warning: true,
        remote_enabled: true,
      },
      revision_parser: {
        enabled: true,
        default_daw: "reaper",
        confidence_threshold: 0.85,
      },
      delivery_packager: {
        enabled: true,
        require_qc_pass: true,
        include_manifest: true,
      },
      mix_planner: {
        enabled: true,
        default_focus: ["vocals", "drums", "low-end translation"],
      },
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
  const deltaMs = Date.now() - date.getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 12) return `${deltaHours} hr ago`;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
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

function formatStatusValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined || value === "") return "n/a";
  return String(value);
}

function serviceStatusHighlights(payload: ServiceStatusPayload | null): Array<{ label: string; value: string }> {
  if (!payload) return [];
  return Object.entries(payload)
    .filter(([key]) => key !== "status" && key !== "settings")
    .slice(0, 6)
    .map(([key, value]) => ({
      label: key.replace(/_/g, " "),
      value: formatStatusValue(value),
    }));
}

function bootstrapStatusLabel(status: string) {
  if (status === "skipped") return "workflows present";
  return status.replace(/-/g, " ");
}

function n8nWorkflowUrl(baseUrl: string, workflowSlug: string) {
  return `${baseUrl}/home/workflows?search=${encodeURIComponent(workflowSlug)}`;
}

function studioVoicePreview(workspace: WorkspaceSettings, profile: StyleProfile | null) {
  const studioName = workspace.studio_name || "the studio";
  const toneMarkers = profile?.extracted_guidance?.tone_markers ?? [];
  const preferredPhrases = profile?.extracted_guidance?.preferred_phrases ?? [];
  if (preferredPhrases.length) {
    return `Hi, this is ${studioName}. ${preferredPhrases.slice(0, 2).join(". ")}.`;
  }
  if (toneMarkers.length) {
    return `Hi, this is ${studioName}. We keep communication ${toneMarkers.slice(0, 3).join(", ")} while staying clear on next steps.`;
  }
  if (workspace.style_seed.raw_text.trim()) {
    return workspace.style_seed.raw_text.trim().slice(0, 180);
  }
  return "Add a tone seed or rescan saved sources so the studio voice can be previewed here.";
}

function serviceSettingsSummary(service: ServiceRecord, settings: ModuleSettings): string[] {
  switch (service.key) {
    case "lead-intake":
      return [
        `Fit floor ${settings.lead_intake.minimum_fit_score}`,
        `${settings.lead_intake.response_sla_hours}h reply SLA`,
        settings.lead_intake.auto_create_projects ? "auto-create projects" : "manual project creation",
      ];
    case "inbox-triage":
      return [
        settings.inbox_triage.ignore_noise ? "noise filtering on" : "noise filtering off",
        `${settings.inbox_triage.high_priority_types.length} priority classes`,
      ];
    case "content-pipeline":
      return [
        settings.content_pipeline.approval_required ? "approval gate on" : "approval gate off",
        settings.content_pipeline.require_assets ? "assets required" : "asset-light drafts allowed",
        settings.content_pipeline.default_platforms.join(", "),
      ];
    case "audio-qc":
      return [
        settings.audio_qc.default_target,
        settings.audio_qc.hard_fail_on_clipping ? "clip hard-fail" : "clip warning only",
      ];
    case "session-prep":
      return [
        settings.session_prep.remote_enabled ? "remote prep allowed" : "local prep only",
        settings.session_prep.filename_space_warning ? "filename warnings on" : "filename warnings off",
      ];
    case "revision-parser":
      return [
        settings.revision_parser.default_daw,
        `confidence ${settings.revision_parser.confidence_threshold}`,
      ];
    case "delivery-packager":
      return [
        settings.delivery_packager.require_qc_pass ? "QC pass required" : "QC optional",
        settings.delivery_packager.include_manifest ? "manifest included" : "manifest off",
      ];
    case "mix-planner":
      return settings.mix_planner.default_focus;
    default:
      return [];
  }
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

function serviceManagedIn(service: ServiceRecord): string {
  if (service.key === "project-state" || service.key === "studio-worker") return "Operations";
  if (service.key === "crm-api") return "Context / Settings";
  if (service.key === "openclaw" || service.key === "n8n" || service.zone === "Automation Modules") return "Automation";
  if (service.zone === "Production Services" || service.zone === "AI Runtime") return "Overview / Operations";
  return "Overview";
}

function zoneAccent(zone: string): string {
  switch (zone) {
    case "Control Plane":
      return "gold";
    case "AI Runtime":
      return "violet";
    case "Automation Modules":
      return "cyan";
    case "Production Services":
      return "ember";
    case "Execution Node":
      return "moss";
    default:
      return "neutral";
  }
}

function servicePrimaryTab(service: ServiceRecord): TabId {
  if (service.key === "project-state" || service.key === "studio-worker") return "operations";
  if (service.key === "crm-api") return "context";
  if (service.key === "openclaw" || service.key === "n8n" || service.zone === "Automation Modules") return "automation";
  if (service.zone === "Execution Node") return "operations";
  if (service.zone === "AI Runtime" || service.zone === "Production Services") return "overview";
  return "overview";
}

function serviceDependencyHints(service: ServiceRecord): string[] {
  switch (service.key) {
    case "project-state":
      return ["postgres", "control-plane health", "approval and queue persistence"];
    case "crm-api":
      return ["postgres", "workspace settings", "style profiles"];
    case "openclaw":
      return ["project-state", "ollama", "starter packs and rules"];
    case "n8n":
      return ["postgres", "workflow bootstrap", "webhook layer"];
    case "ollama":
      return ["local model serving", "OpenClaw", "automation modules"];
    case "studio-worker":
      return ["project-state queue", "shared paths", "optional DAW execution"];
    default:
      if (service.zone === "Automation Modules") return ["OpenClaw posture", "Ollama", "project-state approvals"];
      if (service.zone === "Production Services") return ["project-state", "shared paths", "production pipeline"];
      return ["control plane", "shared fabric", "operator posture"];
  }
}

function serviceRecommendedAction(service: ServiceRecord): string {
  if (service.state === "offline") return "Resolve health first, then refresh the control room.";
  if (service.key === "openclaw") return "Review starter packs and rule posture in Automation.";
  if (service.key === "n8n") return "Use Automation to confirm bootstrap and playbook coverage.";
  if (service.key === "project-state") return "Check approvals, task backlog, and runtime recovery in Operations.";
  if (service.key === "crm-api") return "Review workspace settings and context posture in Settings or Context.";
  if (service.key === "studio-worker") return "Check worker registrations and task recovery in Operations.";
  if (service.zone === "Automation Modules") return "Confirm automation posture and operator-safe starter packs.";
  if (service.zone === "Production Services") return "Confirm runtime health and packaging path readiness.";
  return "Review platform posture and service ownership in Overview.";
}

function workflowTone(state: "ready" | "watch" | "action"): "ok" | "warn" | "bad" {
  if (state === "ready") return "ok";
  if (state === "watch") return "warn";
  return "bad";
}

async function loadDashboardData(): Promise<DashboardData> {
  const [services, workers, rules, rulePacks, starterPacks, playbooks, tasks, approvals, projects, leads, auditLog, styleProfiles, alerts, runtimeAlerts, runtimeRecovery, bootstrapStatus, workspace] =
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
      fetchJson<StarterPack[]>(`${API.openclaw}/starter-packs`),
      fetchJson<Playbook[]>(`${API.openclaw}/playbooks`),
      fetchJson<WorkerTask[]>(`${API.projectState}/workers/tasks/list`),
      fetchJson<ApprovalItem[]>(`${API.projectState}/approval-queue/`),
      fetchJson<ProjectRecord[]>(`${API.crm}/projects`),
      fetchJson<DashboardData["leads"]>(`${API.crm}/leads`),
      fetchJson<AuditEntry[]>(`${API.projectState}/audit-log/?limit=12`),
      fetchJson<StyleProfile[]>(`${API.crm}/style-profiles?scope=studio`),
      fetchJson<AlertConfig>(`${API.openclaw}/alerts/config`),
      fetchJson<RuntimeAlertSummary>(`${API.projectState}/alerts/summary`),
      fetchJson<RuntimeRecovery>(`${API.projectState}/workers/runtime/recovery`),
      fetchJson<BootstrapStatus>(`${API.openclaw}/bootstrap/status`),
      fetchJson<WorkspaceStatus>(`${API.crm}/workspace-settings/status`),
    ]);

  return {
    refreshedAt: new Date().toLocaleTimeString(),
    services,
    workers,
    rules,
    rulePacks,
    starterPacks,
    playbooks,
    tasks,
    approvals,
    projects,
    leads,
    auditLog,
    styleProfiles,
    alerts,
    runtimeAlerts,
    runtimeRecovery,
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
      state: "degraded",
      detail: "loading",
    })),
    workers: [],
    rules: [],
    rulePacks: [],
    starterPacks: [],
    playbooks: [],
    tasks: [],
    approvals: [],
    projects: [],
    leads: [],
    auditLog: [],
    styleProfiles: [],
    alerts: {
      configured_channel_count: 0,
      channels: [],
      thresholds: [],
    },
    runtimeAlerts: {
      approvals_waiting: 0,
      failed_worker_tasks: 0,
      claimed_worker_tasks: 0,
      expired_worker_leases: 0,
      stale_workers: [],
      active_alerts: [],
    },
    runtimeRecovery: {
      stale_workers: [],
      failed_tasks: [],
      claimed_tasks: [],
      summary: {
        failed_task_count: 0,
        claimed_task_count: 0,
        expired_claim_count: 0,
        stale_worker_count: 0,
      },
    },
    bootstrapStatus: {
      status: "pending",
      workflow_count: 0,
      detail: "Waiting for bootstrap status.",
    },
    workspace: {
      readiness_checks: [],
      readiness_summary: {
        ready_count: 0,
        partial_count: 0,
        needs_attention_count: 0,
        optional_count: 0,
      },
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
  const [pendingTaskActionId, setPendingTaskActionId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceSettings>(defaultWorkspaceSettings());
  const [workspaceDraftHydrated, setWorkspaceDraftHydrated] = useState(false);
  const [operatorNameHydrated, setOperatorNameHydrated] = useState(false);
  const [editingWorkspaceSetup, setEditingWorkspaceSetup] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [alertActionPending, setAlertActionPending] = useState<"test" | "dispatch" | null>(null);
  const [alertActionMessage, setAlertActionMessage] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);
  const [starterPackPending, setStarterPackPending] = useState<string | null>(null);
  const [starterPackMessage, setStarterPackMessage] = useState<string | null>(null);
  const [starterPackError, setStarterPackError] = useState<string | null>(null);
  const [maintenancePending, setMaintenancePending] = useState<"reseed" | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [taskActionMessage, setTaskActionMessage] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedServiceKey, setSelectedServiceKey] = useState<string>("project-state");
  const [serviceInspectorMessage, setServiceInspectorMessage] = useState<string | null>(null);
  const [serviceInspectorError, setServiceInspectorError] = useState<string | null>(null);
  const [selectedServiceStatus, setSelectedServiceStatus] = useState<ServiceStatusPayload | null>(null);
  const [selectedServiceStatusState, setSelectedServiceStatusState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [styleRescanPending, setStyleRescanPending] = useState(false);

  const healthyCount = data.services.filter((service) => service.state === "healthy").length;
  const isInitialLoad = data.loadState === "loading" && !data.refreshedAt;
  const optionalOfflineCount = data.services.filter((service) => service.optional && service.state === "offline").length;
  const activeTaskCount = data.tasks.filter((task) => task.status === "queued" || task.status === "claimed").length;
  const failedTaskCount = data.tasks.filter((task) => task.status === "failed").length;
  const enabledRuleCount = data.rules.filter((rule) => rule.enabled).length;
  const n8nUrl = frontDoorServiceUrl("n8n");
  const secureHint = browserProtocol === "https:" ? "TLS active" : "HTTP only";
  const configuredAlertCount = data.alerts.configured_channel_count;
  const activeAlertCount = data.runtimeAlerts.active_alerts.length;
  const serviceZones = groupByZone(data.services);
  const selectedService =
    data.services.find((service) => service.key === selectedServiceKey) ?? data.services[0] ?? null;
  const zoneSummaries = serviceZones.map(([zone, services]) => ({
    zone,
    services,
    healthyCount: services.filter((service) => service.state === "healthy").length,
    managedIn: Array.from(new Set(services.map(serviceManagedIn))).join(" · "),
    accent: zoneAccent(zone),
  }));
  const workspaceSettings = data.workspace.settings;
  const readinessSummary = data.workspace.readiness_summary;
  const styleSourceCount = workspaceSettings.style_seed.source_paths.length;
  const alertEmailCount = workspaceSettings.alert_destinations.email_to.length;
  const displayedFrontDoor = workspaceSettings.public_base_url || frontDoorUrl;
  const activeStarterPack = data.starterPacks.find(
    (pack) => pack.rule_slugs.length && pack.rule_slugs.every((slug) => data.rules.some((rule) => rule.slug === slug && rule.enabled)),
  );
  const integrationFlags = [
    workspaceSettings.integrations.n8n,
    workspaceSettings.integrations.gmail_readonly,
    workspaceSettings.integrations.gmail_send,
    workspaceSettings.integrations.instagram,
    workspaceSettings.integrations.facebook,
  ].filter(Boolean).length;
  const moduleSettings = workspaceSettings.module_settings;
  const moduleEnabledCount = Object.values(moduleSettings).filter((module) => module.enabled).length;
  const selectedServiceHighlights = serviceStatusHighlights(selectedServiceStatus);
  const selectedServiceProxyUrl = selectedService ? `${frontDoorUrl}${serviceProxyBase[selectedService.key] ?? ""}` : frontDoorUrl;
  const visibleApprovals = data.approvals.slice(0, 8);
  const visibleRules = data.rules.slice(0, 10);
  const latestStyleProfile = data.styleProfiles[0] ?? null;
  const voicePreview = studioVoicePreview(workspaceSettings, latestStyleProfile);

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
    document.title = `${data.workspace.settings.studio_name || "Studio Brain"} - Control Room`;
  }, [data.workspace.settings.studio_name]);

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

    async function loadSelectedServiceStatus() {
      if (!selectedService) {
        setSelectedServiceStatus(null);
        setSelectedServiceStatusState("idle");
        return;
      }
      const path = serviceStatusApi[selectedService.key];
      if (!path) {
        setSelectedServiceStatus(null);
        setSelectedServiceStatusState("idle");
        return;
      }
      setSelectedServiceStatusState("loading");
      try {
        const payload = await fetchJson<ServiceStatusPayload>(path);
        if (!active) return;
        setSelectedServiceStatus(payload);
        setSelectedServiceStatusState("ready");
      } catch (error) {
        if (!active) return;
        setSelectedServiceStatus({
          error: error instanceof Error ? error.message : "Unable to load service status.",
        });
        setSelectedServiceStatusState("error");
      }
    }

    void loadSelectedServiceStatus();

    return () => {
      active = false;
    };
  }, [selectedService]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const load = async () => {
      try {
        const nextData = await loadDashboardData();
        if (!active) return;
      setData(nextData);
      setSelectedServiceKey((current) => {
        if (nextData.services.some((service) => service.key === current)) return current;
        return nextData.services[0]?.key ?? current;
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

  async function refreshData() {
    const nextData = await loadDashboardData();
    setData(nextData);
    setSelectedServiceKey((current) => {
      if (nextData.services.some((service) => service.key === current)) return current;
      return nextData.services[0]?.key ?? current;
    });
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
      await refreshData();
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Unable to save workspace settings");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function runAlertAction(action: "test" | "dispatch") {
    setAlertActionPending(action);
    setAlertActionMessage(null);
    setAlertActionError(null);
    try {
      const response = await fetch(
        action === "test" ? `${API.openclaw}/alerts/test` : `${API.openclaw}/alerts/dispatch-active`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body:
            action === "test"
              ? JSON.stringify({
                  slug: "control-room-test",
                  severity: "warn",
                  detail: "Manual test alert triggered from the Studio Brain control room.",
                })
              : undefined,
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `${action} alert action failed with ${response.status}`);
      }
      const payload = (await response.json()) as AlertActionResponse;
      const deliveries =
        payload.deliveries ??
        (payload.results ?? []).flatMap((result) => result.deliveries ?? []);
      setAlertActionMessage(
        action === "test"
          ? `Test alert executed across ${deliveries.length} channel result(s).`
          : `Dispatched ${payload.dispatched_count ?? 0} active alert(s).`,
      );
      await refreshData();
    } catch (error) {
      setAlertActionError(error instanceof Error ? error.message : "Unable to execute alert action");
    } finally {
      setAlertActionPending(null);
    }
  }

  async function applyStarterPack(slug: string) {
    setStarterPackPending(slug);
    setStarterPackMessage(null);
    setStarterPackError(null);
    try {
      const response = await fetch(`${API.openclaw}/starter-packs/${slug}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ exclusive: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Starter pack apply failed with ${response.status}`);
      }
      const payload = (await response.json()) as { applied_pack?: { name?: string }; active_rule_count?: number };
      setStarterPackMessage(
        `${payload.applied_pack?.name ?? slug} applied. ${payload.active_rule_count ?? 0} rule(s) are now active.`,
      );
      await refreshData();
    } catch (error) {
      setStarterPackError(error instanceof Error ? error.message : "Unable to apply starter pack");
    } finally {
      setStarterPackPending(null);
    }
  }

  async function reseedAutomationDefaults() {
    setMaintenancePending("reseed");
    setMaintenanceMessage(null);
    setMaintenanceError(null);
    try {
      const response = await fetch(`${API.openclaw}/bootstrap/defaults`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Bootstrap reseed failed with ${response.status}`);
      }
      const payload = (await response.json()) as {
        seeded_rule_count?: number;
        starter_pack_count?: number;
        playbook_count?: number;
      };
      setMaintenanceMessage(
        `Reseeded ${payload.seeded_rule_count ?? 0} rules, ${payload.starter_pack_count ?? 0} starter packs, and ${payload.playbook_count ?? 0} playbooks.`,
      );
      await refreshData();
    } catch (error) {
      setMaintenanceError(error instanceof Error ? error.message : "Unable to reseed automation defaults");
    } finally {
      setMaintenancePending(null);
    }
  }

  async function handleTaskRecovery(taskId: string, action: "release" | "requeue") {
    setPendingTaskActionId(taskId);
    setTaskActionMessage(null);
    setTaskActionError(null);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Actor": operatorName,
      };
      if (operatorToken) headers["X-Operator-Token"] = operatorToken;
      const response = await fetch(`${API.projectState}/workers/tasks/${taskId}/${action}`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `${action} failed with ${response.status}`);
      }
      setTaskActionMessage(`${action === "release" ? "Released" : "Requeued"} worker task ${taskId}.`);
      await refreshData();
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : `Unable to ${action} task`);
    } finally {
      setPendingTaskActionId(null);
    }
  }

  async function retireWorker(workerSlug: string) {
    setPendingTaskActionId(workerSlug);
    setTaskActionMessage(null);
    setTaskActionError(null);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Actor": operatorName,
      };
      if (operatorToken) headers["X-Operator-Token"] = operatorToken;
      const response = await fetch(`${API.projectState}/workers/${workerSlug}/retire`, {
        method: "POST",
        headers,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Retire failed with ${response.status}`);
      }
      setTaskActionMessage(`Retired worker ${workerSlug} and cleaned up its queued work.`);
      await refreshData();
    } catch (error) {
      setTaskActionError(error instanceof Error ? error.message : "Unable to retire worker");
    } finally {
      setPendingTaskActionId(null);
    }
  }

  async function copyServiceField(value: string, label: string) {
    setServiceInspectorMessage(null);
    setServiceInspectorError(null);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is not available in this browser context.");
      }
      await navigator.clipboard.writeText(value);
      setServiceInspectorMessage(`${label} copied.`);
    } catch (error) {
      setServiceInspectorError(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`);
    }
  }

  async function rescanStyleSources() {
    setStyleRescanPending(true);
    setOnboardingError(null);
    setOnboardingMessage(null);
    try {
      const response = await fetch(`${API.crm}/workspace-settings/style-seed/rescan`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Style rescan failed with ${response.status}`);
      }
      const payload = (await response.json()) as { source_count?: number; style_profile_name?: string };
      setOnboardingMessage(
        `Rescanned ${payload.source_count ?? 0} style source file(s) into ${payload.style_profile_name ?? "the studio profile"}.`,
      );
      await refreshData();
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Unable to rescan style sources");
    } finally {
      setStyleRescanPending(false);
    }
  }

  const onboardingRequired = data.workspace.onboarding_required;
  const onboardingMissingCount = data.workspace.missing_fields.length;
  const onboardingStepCount = 7;
  const settingsPills = [
    workspaceSettings.studio_name || "unnamed studio",
    workspaceSettings.operator_name || "operator missing",
    workspaceSettings.deployment_mode === "control_plane_plus_worker" ? "worker optional" : "single machine",
    workspaceSettings.public_base_url || frontDoorUrl,
  ];
  const frontDoorMode =
    workspaceSettings.https_mode === "https_enabled"
      ? "HTTPS on stack"
      : workspaceSettings.https_mode === "https_terminated_elsewhere"
        ? "HTTPS upstream"
        : "LAN HTTP";
  const integrationReadinessLabel =
    integrationFlags >= 4 ? "integration ready" : integrationFlags >= 2 ? "partially wired" : "minimal wiring";
  const workerPostureLabel =
    workspaceSettings.worker.enabled && workspaceSettings.deployment_mode === "control_plane_plus_worker"
      ? "worker posture active"
      : "worker optional";
  const overviewServices = data.services.filter(
    (service) => service.zone === "Control Plane" || service.zone === "AI Runtime" || service.zone === "Production Services",
  );
  const automationServices = data.services.filter(
    (service) =>
      service.key === "openclaw" ||
      service.key === "n8n" ||
      service.key === "ollama" ||
      service.zone === "Automation Modules",
  );
  const operationsServices = data.services.filter(
    (service) =>
      service.key === "project-state" ||
      service.key === "studio-worker" ||
      service.zone === "Production Services" ||
      service.zone === "Execution Node",
  );
  const platformBackbone = [
    {
      key: "caddy-edge",
      name: "Caddy Edge",
      state: workspaceSettings.https_mode === "https_enabled" ? "healthy" : "degraded",
      detail:
        workspaceSettings.https_mode === "https_enabled"
          ? "TLS enabled on-stack."
          : workspaceSettings.https_mode === "https_terminated_elsewhere"
            ? "TLS terminates upstream."
            : "HTTP fallback is still active.",
      role: "LAN and HTTPS front door for operators and service subdomains.",
      owner: "Overview",
    },
    {
      key: "postgres",
      name: "Postgres",
      state: data.services.some((service) => service.key === "project-state" && service.state === "healthy") ? "healthy" : "offline",
      detail: "Backs project-state, CRM, n8n, and orchestration state.",
      role: "Shared state fabric for workflow, context, and approvals.",
      owner: "Overview",
    },
    {
      key: "studio-brain-ui",
      name: "Studio Brain UI",
      state: data.loadState === "ready" ? "healthy" : data.loadState === "loading" ? "degraded" : "offline",
      detail: data.error ?? "Operator console reachable and polling live APIs.",
      role: "Primary novice-facing control surface.",
      owner: "Overview",
    },
  ];
  const contextCards = [
    {
      label: "Studio identity",
      value: workspaceSettings.studio_name || "Unnamed studio",
      detail: `${workspaceSettings.operator_name || "owner"} · ${workspaceSettings.deployment_mode === "control_plane_plus_worker" ? "control plane + worker" : "single machine"}`,
    },
    {
      label: "Voice context",
      value: workspaceSettings.style_seed.name || "Default Studio Tone",
      detail: `${data.workspace.style_profile_count} style profile(s) · ${styleSourceCount} reference file(s)`,
    },
    {
      label: "Shared projects path",
      value: workspaceSettings.shared_paths.projects,
      detail: `Deliveries: ${workspaceSettings.shared_paths.deliveries}`,
    },
    {
      label: "Alerts + integrations",
      value: `${alertEmailCount} email destination(s)`,
      detail: `${integrationFlags} integrations enabled · ${workspaceSettings.alert_destinations.webhook_url || "no webhook configured"}`,
    },
  ];
  const supportHealthCards = [
    {
      name: "Caddy Edge",
      tone: workspaceSettings.https_mode === "https_enabled" ? "ok" : "warn",
      detail:
        workspaceSettings.https_mode === "https_enabled"
          ? "TLS enabled on this stack."
          : workspaceSettings.https_mode === "https_terminated_elsewhere"
            ? "TLS terminates upstream."
            : "LAN HTTP fallback is still allowed.",
    },
    {
      name: "Postgres State",
      tone: data.services.some((service) => service.key === "project-state" && service.state === "healthy") ? "ok" : "bad",
      detail: "Approvals, task state, style records, and workflow state all depend on the shared database fabric.",
    },
    {
      name: "Shared Volumes",
      tone: readinessSummary.needs_attention_count ? "warn" : "ok",
      detail: `${workspaceSettings.shared_paths.projects} · ${workspaceSettings.shared_paths.deliveries}`,
    },
    {
      name: "Operator Front Door",
      tone: displayedFrontDoor.startsWith("https://") ? "ok" : "warn",
      detail: displayedFrontDoor,
    },
  ];
  const workflowPlaybooks: Array<{
    id: WorkflowId;
    label: string;
    tab: TabId;
    state: "ready" | "watch" | "action";
    count: string;
    unit: string;
    summary: string;
    detail: string;
  }> = [
    {
      id: "start-day",
      label: "Start Day",
      tab: "overview",
      state: healthyCount === data.services.length && !activeAlertCount ? "ready" : healthyCount >= data.services.length - 2 ? "watch" : "action",
      count: `${healthyCount}/${data.services.length}`,
      unit: "services healthy",
      summary: "Check front door, platform health, and workspace readiness.",
      detail: `${activeAlertCount} active alerts · ${readinessSummary.partial_count} partial checks`,
    },
    {
      id: "approvals",
      label: "Handle Approvals",
      tab: "operations",
      state: data.approvals.length ? "action" : "ready",
      count: `${data.approvals.length}`,
      unit: "items waiting",
      summary: "Clear the approval queue and keep operator identity pinned.",
      detail: `${data.runtimeAlerts.approvals_waiting} waiting approvals`,
    },
    {
      id: "recover-runtime",
      label: "Recover Runtime",
      tab: "operations",
      state: data.runtimeRecovery.summary.failed_task_count || data.runtimeRecovery.summary.expired_claim_count ? "action" : data.runtimeRecovery.summary.stale_worker_count ? "watch" : "ready",
      count: `${data.runtimeRecovery.summary.failed_task_count + data.runtimeRecovery.summary.expired_claim_count}`,
      unit: "runtime issues",
      summary: "Investigate failed tasks, expired claims, and stale workers.",
      detail: `${data.runtimeRecovery.summary.stale_worker_count} stale workers · ${data.runtimeRecovery.summary.claimed_task_count} claimed`,
    },
    {
      id: "manage-automation",
      label: "Manage Automation",
      tab: "automation",
      state: activeStarterPack ? "ready" : "watch",
      count: `${enabledRuleCount}`,
      unit: "rules active",
      summary: "Confirm starter packs, rule posture, and playbook coverage.",
      detail: `${data.playbooks.length} playbooks · ${data.bootstrapStatus.workflow_count} starter workflows`,
    },
    {
      id: "update-setup",
      label: "Update Setup",
      tab: "settings",
      state: data.workspace.onboarding_required || readinessSummary.needs_attention_count ? "action" : readinessSummary.partial_count ? "watch" : "ready",
      count: `${data.workspace.missing_fields.length}`,
      unit: "items missing",
      summary: "Adjust onboarding, shared paths, context, alerts, and worker posture.",
      detail: `${integrationFlags} integrations enabled · ${alertEmailCount} alert destinations`,
    },
  ];

  return (
    <main className="app-shell">
      <section className="top-rail">
        <div className="top-identity">
          <p className="eyebrow">AI Audio Studio</p>
          <h1>Studio Brain Control Room</h1>
          <p className="lede">
            Operator console for the full Mac-first stack: platform health, orchestration, approvals, context, and the optional worker surface.
          </p>
        </div>
        <div className="top-status-grid">
          <article className={`metric ${statusTone(data.loadState)}`}>
            <span className="metric-label">Control plane</span>
            <strong>{data.loadState}</strong>
            <span className="metric-subtle">{data.error ?? "Polling every 15 seconds."}</span>
          </article>
          <article className="metric">
            <span className="metric-label">Refreshed</span>
            <strong>{data.refreshedAt ?? "waiting"}</strong>
            <span className="metric-subtle">{primaryMode(data.workers)}</span>
          </article>
          <article className="metric">
            <span className="metric-label">Services</span>
            <strong>{healthyCount}/{data.services.length}</strong>
            <span className="metric-subtle">{secureHint}</span>
          </article>
          <article className={`metric ${activeAlertCount ? "warn" : "ok"}`}>
            <span className="metric-label">Active alerts</span>
            <strong>{activeAlertCount}</strong>
            <span className="metric-subtle">{data.approvals.length} approvals · {activeTaskCount} live tasks</span>
          </article>
        </div>
      </section>

      <section className="workflow-strip" aria-label="Guided operator workflows">
        {workflowPlaybooks.map((workflow) => (
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
              <span>open {primaryTabs.find((tab) => tab.id === workflow.tab)?.label.toLowerCase()}</span>
            </div>
          </button>
        ))}
      </section>

      <nav className="tab-strip" aria-label="Primary control surfaces">
        {primaryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${tab.accent} ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-label">{tab.label}</span>
            {activeTab === tab.id ? <span className="tab-summary">{tab.summary}</span> : null}
          </button>
        ))}
      </nav>

      {isInitialLoad ? (
        <section className="loading-shell" aria-label="Loading control room">
          <div className="loading-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <article key={index} className="panel loading-card">
                <div className="loading-bar loading-bar-short" />
                <div className="loading-bar loading-bar-medium" />
                <div className="loading-bar" />
                <div className="loading-bar loading-bar-medium" />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!isInitialLoad && activeTab === "overview" ? (
        <div className="tab-panel">
          <section className="command-grid">
            <article className="panel command-card accent-gold">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Front Door</p>
                  <h2>Operator Access</h2>
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

            <article className="panel command-card accent-blue">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Zones</p>
                  <h2>Service Coverage</h2>
                </div>
                <span className="status-pill ok">{zoneSummaries.length} zones mapped</span>
              </div>
              <div className="zone-summary-grid">
                {zoneSummaries.map((summary) => (
                  <div key={summary.zone} className={`mini-card zone-summary-card ${summary.accent}`}>
                    <span className="metric-label">{summary.zone}</span>
                    <strong>{summary.healthyCount}/{summary.services.length}</strong>
                    <p className="panel-note">{summary.managedIn}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel command-card accent-green">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Fabric</p>
                  <h2>Platform Readiness</h2>
                </div>
                <span className={`status-pill ${readinessSummary.needs_attention_count ? "bad" : "ok"}`}>{frontDoorMode}</span>
              </div>
              <div className="support-health-grid">
                {supportHealthCards.map((item) => (
                  <div key={item.name} className={`mini-card support-health-card ${item.tone}`}>
                    <span className="metric-label">{item.name}</span>
                    <strong>{item.tone === "ok" ? "ready" : item.tone === "warn" ? "watch" : "attention"}</strong>
                    <p className="panel-note">{item.detail}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-12">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Readiness</p>
                  <h2>Workspace Readiness</h2>
                </div>
                <div className="header-actions">
                  <span className="count-pill">{readinessSummary.ready_count} ready</span>
                  <span className="status-pill warn">{readinessSummary.partial_count} partial</span>
                  <span className="status-pill bad">{readinessSummary.needs_attention_count} attention</span>
                </div>
              </div>
              <div className="readiness-grid">
                {data.workspace.readiness_checks.map((check) => (
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
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-12">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Backbone</p>
                  <h2>Platform Services</h2>
                </div>
                <span className="count-pill">{platformBackbone.length + overviewServices.length}</span>
              </div>
              <div className="module-grid platform-grid">
                {platformBackbone.map((service) => (
                  <div key={service.key} className="mini-card module-card module-gold">
                    <span className="metric-label">{service.owner}</span>
                    <strong>{service.name}</strong>
                    <p className="panel-note">{service.role}</p>
                    <div className="meta-inline">
                      <span>{service.detail}</span>
                    </div>
                    <span className={`status-pill ${statusTone(service.state)}`}>{service.state}</span>
                  </div>
                ))}
                {overviewServices.map((service) => (
                  <button
                    key={service.key}
                    type="button"
                    className="mini-card module-card module-violet service-module-button"
                    onClick={() => setSelectedServiceKey(service.key)}
                  >
                    <span className="metric-label">{service.zone}</span>
                    <strong>{service.name}</strong>
                    <p className="panel-note">{service.role}</p>
                    <div className="meta-inline">
                      <span>{service.note}</span>
                    </div>
                    <span className={`status-pill ${statusTone(service.state)}`}>{serviceLabel(service)}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-8">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Topology</p>
                  <h2>Service Ownership Map</h2>
                </div>
                <span className="count-pill">{data.services.length} services</span>
              </div>
              <div className="zone-stack">
                {serviceZones.map(([zone, services]) => (
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
                  <p className="section-kicker">Inspector</p>
                  <h2>Service Drilldown</h2>
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
                      {serviceDependencyHints(selectedService).map((item) => (
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
                        {selectedServiceHighlights.map((item) => (
                          <div key={item.label} className="status-key-card">
                            <span className="metric-label">{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="panel-note">No detailed service payload is available for this module yet.</p>
                    )}
                  </div>
                  {serviceSettingsSummary(selectedService, moduleSettings).length ? (
                    <div className="mini-card">
                      <span className="metric-label">Saved tuning</span>
                      <div className="summary-pill-row">
                        {serviceSettingsSummary(selectedService, moduleSettings).map((item) => (
                          <span key={item} className="summary-pill">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="action-deck">
                    <button
                      className="action-button ok"
                      type="button"
                      onClick={() => setActiveTab(servicePrimaryTab(selectedService))}
                    >
                      open {primaryTabs.find((tab) => tab.id === servicePrimaryTab(selectedService))?.label.toLowerCase()}
                    </button>
                    <button className="action-button" type="button" onClick={() => refreshData()}>
                      refresh state
                    </button>
                    <button className="action-button" type="button" onClick={() => copyServiceField(selectedServiceProxyUrl, `${selectedService.name} URL`)}>
                      copy url
                    </button>
                    <button
                      className="action-button"
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
                  <p className="section-kicker">Platform Actions</p>
                  <h2>Safe Operator Controls</h2>
                </div>
              </div>
              <div className="table-stack">
                <div className="table-row">
                  <div className="row-main">
                    <strong>Refresh control room</strong>
                    <div className="muted">Re-poll the full stack and re-evaluate service health and readiness.</div>
                  </div>
                  <div className="row-meta">
                    <button className="action-button" type="button" onClick={() => refreshData()}>
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
                    <button className="action-button" type="button" disabled={alertActionPending !== null} onClick={() => runAlertAction("test")}>
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
                    <button className="action-button" type="button" disabled={maintenancePending !== null} onClick={reseedAutomationDefaults}>
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
                    <button className="action-button ok" type="button" onClick={() => setActiveTab("settings")}>
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
                  <p className="section-kicker">Support Surface</p>
                  <h2>Stack Fabric</h2>
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
        </div>
      ) : null}

      {!isInitialLoad && activeTab === "operations" ? (
        <div className="tab-panel">
          <section className="workspace-grid">
            <article className="panel panel-span-12">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Execution Fabric</p>
                  <h2>Operational Service Modules</h2>
                </div>
                <span className="count-pill">{operationsServices.length}</span>
              </div>
              <div className="module-grid platform-grid">
                {operationsServices.map((service) => (
                  <button
                    key={service.key}
                    type="button"
                    className={`mini-card module-card module-${zoneAccent(service.zone)} service-module-button`}
                    onClick={() => setSelectedServiceKey(service.key)}
                  >
                    <span className="metric-label">{service.zone}</span>
                    <strong>{service.name}</strong>
                    <p className="panel-note">{service.role}</p>
                    <div className="meta-inline">
                      <span>{service.note}</span>
                      <span>{serviceRecommendedAction(service)}</span>
                    </div>
                    <span className={`status-pill ${statusTone(service.state)}`}>{serviceLabel(service)}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-8">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Action Queue</p>
                  <h2>Approvals</h2>
                </div>
                <span className="count-pill">showing {visibleApprovals.length} of {data.approvals.length}</span>
              </div>
              <div className="table-stack">
                {data.approvals.length ? (
                  visibleApprovals.map((job) => (
                    <div key={job.id} className="table-row approval-row">
                      <div className="row-main">
                        <strong>{job.module}</strong>
                        <div className="muted">{job.action}</div>
                        <div className="meta-inline">
                          <span>{job.requested_by ?? "system"}</span>
                          <span>{summarizeTime(job.created_at)}</span>
                        </div>
                        {job.preview?.title ? <div className="approval-preview-title">{job.preview.title}</div> : null}
                        {job.preview?.project ? (
                          <div className="meta-inline">
                            <span>{job.preview.project.client_name}</span>
                            <span>{job.preview.project.service_type}</span>
                            <span>{job.preview.project.status}</span>
                          </div>
                        ) : null}
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
                              {job.preview.drafts.map((draft) => (
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
                            <strong>Revision notes</strong>
                            <p>{job.preview.revision.raw_notes}</p>
                            <div className="meta-inline">
                              <span>{job.preview.revision.soundflow_script ? "soundflow ready" : "no soundflow"}</span>
                              <span>{job.preview.revision.reascript_path ? "reascript ready" : "no reascript"}</span>
                            </div>
                          </div>
                        ) : null}
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
            </aside>
          </section>

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
                <div className="panel-span-5 table-stack top-gap">
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
              </div>
              {alertActionMessage ? <p className="feedback ok">{alertActionMessage}</p> : null}
              {alertActionError ? <p className="feedback bad">{alertActionError}</p> : null}
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
                    {data.runtimeRecovery.failed_tasks.slice(0, 3).map((task) => (
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
                    {data.runtimeRecovery.claimed_tasks.slice(0, 3).map((task) => (
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
                    {data.runtimeRecovery.stale_workers.slice(0, 3).map((worker) => (
                      <div key={worker.slug} className="table-row">
                        <div className="row-main">
                          <strong>{worker.display_name}</strong>
                          <div className="muted">{worker.slug}</div>
                        </div>
                        <div className="row-meta">
                          <span className="status-pill warn">stale</span>
                          <button
                            className="action-button bad"
                            disabled={!operatorName || pendingTaskActionId === worker.slug}
                            onClick={() => retireWorker(worker.slug)}
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
                  data.workers.map((worker) => (
                    <div key={worker.id} className="table-row">
                      <div className="row-main">
                        <strong>{worker.display_name}</strong>
                        <div className="muted">{worker.slug} · {worker.platform} · {worker.host ?? "no host"}</div>
                        <div className="meta-inline">
                          <span>{asArray(worker.capabilities).join(", ")}</span>
                        </div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${statusTone(worker.status)}`}>{worker.status}</span>
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
                  data.tasks.slice(0, 8).map((task) => (
                    <div key={task.id} className="table-row">
                      <div className="row-main">
                        <strong>{task.task_type}</strong>
                        <div className="muted">{task.worker_slug ?? task.claimed_by ?? "unassigned"} · {task.priority}</div>
                        {task.error_message ? <div className="muted">{task.error_message}</div> : null}
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${statusTone(task.status)}`}>{task.status}</span>
                        <span className="muted">{summarizeTime(task.created_at)}</span>
                        {task.status === "claimed" || task.status === "failed" ? (
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
                <span className="count-pill">{data.auditLog.length}</span>
              </div>
              <div className="table-stack">
                {data.auditLog.length ? (
                  data.auditLog.map((entry) => (
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
                  <p className="empty-state">No recent audit activity is available yet.</p>
                )}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {!isInitialLoad && activeTab === "automation" ? (
        <div className="tab-panel">
          <section className="workspace-grid">
            <article className="panel panel-span-4 automation-panel automation-cyan">
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
                <button className="action-button" disabled={maintenancePending !== null} onClick={reseedAutomationDefaults}>
                  {maintenancePending === "reseed" ? "reseeding" : "reseed defaults"}
                </button>
                <button
                  className="action-button ok"
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

            <article className="panel panel-span-8 automation-panel automation-violet">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Inventory</p>
                  <h2>Automation Module Directory</h2>
                </div>
                <span className="count-pill">{automationServices.length}</span>
              </div>
              <div className="module-grid">
                {automationServices.map((service) => (
                  <div key={service.key} className={`mini-card module-card module-${zoneAccent(service.zone)}`}>
                    <span className="metric-label">{service.zone}</span>
                    <strong>{service.name}</strong>
                    <p className="panel-note">{service.role}</p>
                    <div className="meta-inline">
                      <span>{service.note}</span>
                      <span>{serviceManagedIn(service)}</span>
                    </div>
                    <span className={`status-pill ${statusTone(service.state)}`}>{serviceLabel(service)}</span>
                  </div>
                ))}
              </div>
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
                  data.starterPacks.map((pack) => (
                    <div key={pack.slug} className="table-row">
                      <div className="row-main">
                        <strong>{pack.name}</strong>
                        <div className="muted">{pack.description}</div>
                        <div className="muted">{pack.rules.length} rule(s) · alerts via {pack.alert_channels.join(", ")}</div>
                      </div>
                      <div className="row-meta">
                        <span className={`status-pill ${activeStarterPack?.slug === pack.slug ? "ok" : "warn"}`}>
                          {activeStarterPack?.slug === pack.slug ? "active posture" : "available"}
                        </span>
                        <button className="action-button" disabled={starterPackPending !== null} onClick={() => applyStarterPack(pack.slug)}>
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
                <span className="count-pill">showing {visibleRules.length} of {data.rules.length}</span>
              </div>
              <div className="table-stack">
                {visibleRules.map((rule) => (
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
                  data.playbooks.map((playbook) => (
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
                          <a className="action-button" href={n8nWorkflowUrl(n8nUrl, playbook.n8n_workflow_slug)} target="_blank" rel="noreferrer">
                            open in n8n
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
                {data.rulePacks.map((pack) => (
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
      ) : null}

      {!isInitialLoad && activeTab === "context" ? (
        <div className="tab-panel">
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
                  data.styleProfiles.slice(0, 8).map((profile) => (
                    <div key={profile.id} className="table-row">
                      <div className="row-main">
                        <strong>{profile.name}</strong>
                        <div className="muted">{profile.scope} · {profile.source_type}</div>
                        <div className="muted">
                          {profile.extracted_guidance?.summary ?? "No guidance summary extracted yet. Add seed text or rescan saved source files."}
                        </div>
                        <div className="meta-inline">
                          <span>updated {profile.updated_at ? summarizeTime(profile.updated_at) : "n/a"}</span>
                          {profile.extracted_guidance?.tone_markers?.slice(0, 3).map((marker) => (
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
                  <p className="empty-state">No style profiles have been ingested yet.</p>
                )}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-5">
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
                  {(latestStyleProfile?.extracted_guidance?.preferred_phrases ?? workspaceSettings.style_seed.source_paths).slice(0, 4).map((item) => (
                    <span key={item} className="summary-pill">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            <article className="panel panel-span-3">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Context Feed</p>
                  <h2>Source Inputs</h2>
                </div>
                <span className="count-pill">{styleSourceCount}</span>
              </div>
              <div className="table-stack">
                {workspaceSettings.style_seed.source_paths.length ? (
                  workspaceSettings.style_seed.source_paths.slice(0, 6).map((sourcePath) => (
                    <div key={sourcePath} className="table-row compact-row">
                      <div className="row-main">
                        <strong>{sourcePath.split("/").pop() || sourcePath}</strong>
                        <div className="muted">{sourcePath}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">No saved style source files yet. Paste a tone seed or add source paths in Settings.</p>
                )}
              </div>
            </article>

            <article className="panel panel-span-4">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">CRM</p>
                  <h2>Projects + Leads</h2>
                </div>
                <span className="count-pill">{data.projects.length} projects</span>
              </div>
              <div className="table-stack">
                {data.projects.length ? (
                  data.projects.slice(0, 4).map((project) => (
                    <div key={project.id} className="table-row">
                      <div className="row-main">
                        <strong>{project.client_name}</strong>
                        <div className="muted">{project.service_type} · {project.status}</div>
                        <div className="meta-inline">
                          <span>{project.lead_count ?? 0} leads</span>
                          {project.updated_at ? <span>updated {summarizeTime(project.updated_at)}</span> : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">No projects have been created yet.</p>
                )}
              </div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel panel-span-12">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Recent Intake</p>
                  <h2>Lead Signals</h2>
                </div>
                <span className="count-pill">{data.leads.length}</span>
              </div>
              <div className="table-stack">
                {data.leads.length ? (
                  data.leads.slice(0, 6).map((lead) => (
                    <div key={lead.id} className="table-row">
                      <div className="row-main">
                        <strong>{lead.source}</strong>
                        <div className="muted">{lead.draft_reply ?? "No draft reply stored yet."}</div>
                        <div className="meta-inline">
                          <span>fit {lead.fit_score ?? "n/a"}</span>
                          <span>urgency {lead.urgency_score ?? "n/a"}</span>
                          {lead.created_at ? <span>{summarizeTime(lead.created_at)}</span> : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">No lead signals are in CRM yet.</p>
                )}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {!isInitialLoad && activeTab === "settings" ? (
        <div className="tab-panel">
          <section className={`panel onboarding-panel ${onboardingRequired ? "needs-setup" : "is-complete"}`}>
            <div className="panel-header onboarding-header">
              <div>
                <p className="section-kicker">Bootstrap</p>
                <h2>{editingWorkspaceSetup || onboardingRequired ? "First-run onboarding" : "Workspace settings"}</h2>
                <p className="panel-note">
                  {onboardingRequired
                    ? "Capture the studio identity, deployment posture, paths, style seed, alerts, and optional worker details."
                    : "Review the saved workspace settings, then jump into operations without reopening the questionnaire."}
                </p>
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
                    setWorkspaceDraft(data.workspace.settings);
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
                <p>{workspaceSettings.operator_name || "owner"} · {workspaceSettings.deployment_mode === "control_plane_plus_worker" ? "control plane + worker" : "single machine"}</p>
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
                <strong>{integrationFlags} enabled</strong>
                <p>{alertEmailCount} alert destination(s) · {workerPostureLabel}</p>
              </article>
              <article className="snapshot-card">
                <span className="metric-label">Module posture</span>
                <strong>{moduleEnabledCount}/{Object.keys(moduleSettings).length} enabled</strong>
                <p>Persisted tuning now drives service status and operator defaults.</p>
              </article>
            </div>
            <div className="onboarding-actions-bar">
              <div className="summary-pill-row onboarding-steps-row">
                {settingsPills.map((pill) => (
                  <span key={pill} className="summary-pill">{pill}</span>
                ))}
                <span className="summary-pill">{onboardingStepCount} steps</span>
              </div>
              <div className="onboarding-actions">
                <button className="action-button" type="button" onClick={refreshData}>refresh workspace</button>
                {editingWorkspaceSetup || onboardingRequired ? (
                  !onboardingRequired ? (
                    <button className="action-button" type="button" onClick={() => setEditingWorkspaceSetup(false)}>
                      close editor
                    </button>
                  ) : null
                ) : (
                  <button
                    className="action-button ok"
                    type="button"
                    onClick={() => {
                      setEditingWorkspaceSetup(true);
                      setWorkspaceDraft(workspaceSettings);
                    }}
                  >
                    edit saved settings
                  </button>
                )}
              </div>
            </div>
            {editingWorkspaceSetup || onboardingRequired ? (
            <>
            <div className="onboarding-grid">
              <article className="mini-card">
                <span className="metric-label">1. Studio identity</span>
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
                <span className="metric-label">2. Posture</span>
                <label className="field">
                  <span className="metric-label">Public front door</span>
                  <input
                    value={workspaceDraft.public_base_url}
                    placeholder={frontDoorUrl}
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
              <article className="mini-card">
                <span className="metric-label">3. Shared paths</span>
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
                <span className="metric-label">4. Style and tone</span>
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
                <button className="action-button" type="button" disabled={styleRescanPending} onClick={rescanStyleSources}>
                  {styleRescanPending ? "rescanning" : "rescan saved sources"}
                </button>
              </article>
              <article className="mini-card">
                <span className="metric-label">5. Alerts and integrations</span>
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
                <span className="metric-label">6. Optional worker</span>
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
              <article className="mini-card module-settings-card">
                <span className="metric-label">7. Module tuning</span>
                <div className="module-settings-grid">
                  <div className="module-setting-block">
                    <div className="module-setting-head">
                      <strong>Lead intake</strong>
                      <label className="toggle-chip">
                        <input
                          type="checkbox"
                          checked={workspaceDraft.module_settings.lead_intake.enabled}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                lead_intake: { ...current.module_settings.lead_intake, enabled: event.target.checked },
                              },
                            }))}
                        />
                        <span>enabled</span>
                      </label>
                    </div>
                    <div className="inline-form-grid">
                      <label className="field">
                        <span className="metric-label">Min fit score</span>
                        <input
                          type="number"
                          value={workspaceDraft.module_settings.lead_intake.minimum_fit_score}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                lead_intake: {
                                  ...current.module_settings.lead_intake,
                                  minimum_fit_score: Number(event.target.value) || 0,
                                },
                              },
                            }))}
                        />
                      </label>
                      <label className="field">
                        <span className="metric-label">Reply SLA hours</span>
                        <input
                          type="number"
                          value={workspaceDraft.module_settings.lead_intake.response_sla_hours}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                lead_intake: {
                                  ...current.module_settings.lead_intake,
                                  response_sla_hours: Number(event.target.value) || 0,
                                },
                              },
                            }))}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="module-setting-block">
                    <div className="module-setting-head">
                      <strong>Inbox triage</strong>
                      <label className="toggle-chip">
                        <input
                          type="checkbox"
                          checked={workspaceDraft.module_settings.inbox_triage.enabled}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                inbox_triage: { ...current.module_settings.inbox_triage, enabled: event.target.checked },
                              },
                            }))}
                        />
                        <span>enabled</span>
                      </label>
                    </div>
                    <label className="field">
                      <span className="metric-label">Priority classes</span>
                      <input
                        value={workspaceDraft.module_settings.inbox_triage.high_priority_types.join(", ")}
                        onChange={(event) =>
                          setWorkspaceDraft((current) => ({
                            ...current,
                            module_settings: {
                              ...current.module_settings,
                              inbox_triage: {
                                ...current.module_settings.inbox_triage,
                                high_priority_types: parseDelimitedList(event.target.value),
                              },
                            },
                          }))}
                      />
                    </label>
                  </div>
                  <div className="module-setting-block">
                    <div className="module-setting-head">
                      <strong>Content pipeline</strong>
                      <label className="toggle-chip">
                        <input
                          type="checkbox"
                          checked={workspaceDraft.module_settings.content_pipeline.enabled}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                content_pipeline: { ...current.module_settings.content_pipeline, enabled: event.target.checked },
                              },
                            }))}
                        />
                        <span>enabled</span>
                      </label>
                    </div>
                    <label className="field">
                      <span className="metric-label">Default platforms</span>
                      <input
                        value={workspaceDraft.module_settings.content_pipeline.default_platforms.join(", ")}
                        onChange={(event) =>
                          setWorkspaceDraft((current) => ({
                            ...current,
                            module_settings: {
                              ...current.module_settings,
                              content_pipeline: {
                                ...current.module_settings.content_pipeline,
                                default_platforms: parseDelimitedList(event.target.value),
                              },
                            },
                          }))}
                      />
                    </label>
                  </div>
                  <div className="module-setting-block">
                    <div className="module-setting-head">
                      <strong>Audio QC</strong>
                      <label className="toggle-chip">
                        <input
                          type="checkbox"
                          checked={workspaceDraft.module_settings.audio_qc.enabled}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                audio_qc: { ...current.module_settings.audio_qc, enabled: event.target.checked },
                              },
                            }))}
                        />
                        <span>enabled</span>
                      </label>
                    </div>
                    <label className="field">
                      <span className="metric-label">Default target</span>
                      <select
                        value={workspaceDraft.module_settings.audio_qc.default_target}
                        onChange={(event) =>
                          setWorkspaceDraft((current) => ({
                            ...current,
                            module_settings: {
                              ...current.module_settings,
                              audio_qc: { ...current.module_settings.audio_qc, default_target: event.target.value },
                            },
                          }))}
                      >
                        <option value="streaming">streaming</option>
                        <option value="broadcast">broadcast</option>
                        <option value="club">club</option>
                      </select>
                    </label>
                  </div>
                  <div className="module-setting-block">
                    <div className="module-setting-head">
                      <strong>Revision parser</strong>
                      <label className="toggle-chip">
                        <input
                          type="checkbox"
                          checked={workspaceDraft.module_settings.revision_parser.enabled}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                revision_parser: { ...current.module_settings.revision_parser, enabled: event.target.checked },
                              },
                            }))}
                        />
                        <span>enabled</span>
                      </label>
                    </div>
                    <div className="inline-form-grid">
                      <label className="field">
                        <span className="metric-label">Default DAW</span>
                        <select
                          value={workspaceDraft.module_settings.revision_parser.default_daw}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                revision_parser: { ...current.module_settings.revision_parser, default_daw: event.target.value },
                              },
                            }))}
                        >
                          <option value="reaper">reaper</option>
                          <option value="protools">protools</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="metric-label">Confidence floor</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={workspaceDraft.module_settings.revision_parser.confidence_threshold}
                          onChange={(event) =>
                            setWorkspaceDraft((current) => ({
                              ...current,
                              module_settings: {
                                ...current.module_settings,
                                revision_parser: {
                                  ...current.module_settings.revision_parser,
                                  confidence_threshold: Number(event.target.value) || 0,
                                },
                              },
                            }))}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="module-setting-block">
                    <div className="module-setting-head">
                      <strong>Delivery + planning</strong>
                    </div>
                    <div className="summary-pill-row">
                      {workspaceDraft.module_settings.mix_planner.default_focus.map((item) => (
                        <span key={item} className="summary-pill">
                          {item}
                        </span>
                      ))}
                      <span className="summary-pill">
                        {workspaceDraft.module_settings.delivery_packager.require_qc_pass ? "qc required" : "qc optional"}
                      </span>
                    </div>
                    <label className="field">
                      <span className="metric-label">Mix focus priorities</span>
                      <input
                        value={workspaceDraft.module_settings.mix_planner.default_focus.join(", ")}
                        onChange={(event) =>
                          setWorkspaceDraft((current) => ({
                            ...current,
                            module_settings: {
                              ...current.module_settings,
                              mix_planner: {
                                ...current.module_settings.mix_planner,
                                default_focus: parseDelimitedList(event.target.value),
                              },
                            },
                          }))}
                      />
                    </label>
                  </div>
                </div>
              </article>
            </div>
            <div className="onboarding-footer">
              <div className="missing-list">
                <span className="metric-label">Still missing</span>
                <strong>{data.workspace.missing_fields.length ? data.workspace.missing_fields.join(", ") : "Nothing required is missing."}</strong>
              </div>
              <div className="wizard-footer-actions">
                <button className="action-button" disabled={onboardingSaving} onClick={refreshData}>refresh now</button>
                <button className="action-button ok" disabled={onboardingSaving} onClick={saveWorkspaceSettings}>
                  {onboardingSaving ? "saving" : "save settings"}
                </button>
              </div>
            </div>
            </>
            ) : (
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
                    <button className="action-button" type="button" disabled={styleRescanPending} onClick={rescanStyleSources}>
                      {styleRescanPending ? "rescanning" : "rescan style sources"}
                    </button>
                  </div>
                </article>
              </div>
            )}
            {onboardingMessage ? <p className="feedback ok">{onboardingMessage}</p> : null}
            {onboardingError ? <p className="feedback bad">{onboardingError}</p> : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
