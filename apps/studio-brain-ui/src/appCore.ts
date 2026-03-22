import type {
  AlertConfig,
  ApprovalItem,
  AuditEntry,
  BootstrapStatus,
  ConciergeTurn,
  DashboardData,
  ExecutionPlanPreview,
  MixPlanPreview,
  ModuleSettings,
  OrchestrationRule,
  Playbook,
  ProjectDetail,
  ProjectRecord,
  RenderPlanPreview,
  RulePack,
  ServiceRecord,
  ServiceState,
  ServiceStatusPayload,
  TabId,
  RuntimeAlertSummary,
  RuntimeRecovery,
  WorkerNode,
  WorkerTask,
  WorkflowId,
  WorkspaceSettings,
  WorkspaceStatus,
  WorkstationProfile,
  SessionManifestPreview,
  StarterPack,
  StyleProfile,
  ListeningReportPreview,
} from "./types";

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
const CONCIERGE_TURNS_KEY = "studioBrain.conciergeTurns";

const DEFAULT_CONCIERGE_TURNS: ConciergeTurn[] = [
  {
    role: "assistant",
    text: "Ask about setup, project status, shared storage, approvals, or runtime issues. This assistant uses live control-room state and falls back to explicit setup guidance if Ollama is unavailable.",
    actions: [
      { id: "run-worker-smoke", label: "Run worker smoke" },
      { id: "goto-settings", label: "Review setup" },
      { id: "goto-operations", label: "Show live ops" },
    ],
  },
];

function loadStoredConciergeTurns(): ConciergeTurn[] {
  try {
    const raw = window.sessionStorage.getItem(CONCIERGE_TURNS_KEY);
    if (!raw) return DEFAULT_CONCIERGE_TURNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_CONCIERGE_TURNS;
    return parsed.slice(-8);
  } catch {
    return DEFAULT_CONCIERGE_TURNS;
  }
}

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
    host_machine_type: "macbook-pro",
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
      display_name: "Studio Worker",
      platform: "macos",
      default_daw: "reaper",
      supported_daws: ["reaper"],
      adapter_capabilities: ["execute-reascript"],
      dry_run_daw: false,
      reaper_binary_path: "",
      protools_app_path: "",
      soundflow_cli_path: "",
      notes: "",
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

function normalizeWorkspaceSettings(input?: Partial<WorkspaceSettings> | null): WorkspaceSettings {
  const defaults = defaultWorkspaceSettings();
  const raw = (input ?? {}) as Partial<WorkspaceSettings>;
  const sharedPaths = (raw.shared_paths ?? {}) as Partial<WorkspaceSettings["shared_paths"]>;
  const styleSeed = (raw.style_seed ?? {}) as Partial<WorkspaceSettings["style_seed"]>;
  const alertDestinations = (raw.alert_destinations ?? {}) as Partial<WorkspaceSettings["alert_destinations"]>;
  const integrations = (raw.integrations ?? {}) as Partial<WorkspaceSettings["integrations"]>;
  const worker = (raw.worker ?? {}) as Partial<WorkspaceSettings["worker"]>;
  const modules = (raw.module_settings ?? {}) as Partial<ModuleSettings>;
  const defaultModules = defaults.module_settings;

  return {
    ...defaults,
    ...raw,
    studio_name: raw.studio_name ?? defaults.studio_name,
    host_machine_type: raw.host_machine_type ?? defaults.host_machine_type,
    deployment_mode: raw.deployment_mode ?? defaults.deployment_mode,
    public_base_url: raw.public_base_url ?? defaults.public_base_url,
    https_mode: raw.https_mode ?? defaults.https_mode,
    operator_name: raw.operator_name ?? defaults.operator_name,
    shared_paths: {
      ...defaults.shared_paths,
      ...sharedPaths,
      projects: sharedPaths.projects ?? defaults.shared_paths.projects,
      deliveries: sharedPaths.deliveries ?? defaults.shared_paths.deliveries,
      draft_queue: sharedPaths.draft_queue ?? defaults.shared_paths.draft_queue,
      approval_queue: sharedPaths.approval_queue ?? defaults.shared_paths.approval_queue,
      incoming_stems: sharedPaths.incoming_stems ?? defaults.shared_paths.incoming_stems,
    },
    style_seed: {
      ...defaults.style_seed,
      ...styleSeed,
      name: styleSeed.name ?? defaults.style_seed.name,
      raw_text: styleSeed.raw_text ?? defaults.style_seed.raw_text,
      source_paths: asArray(styleSeed.source_paths ?? defaults.style_seed.source_paths),
    },
    alert_destinations: {
      ...defaults.alert_destinations,
      ...alertDestinations,
      email_to: asArray(alertDestinations.email_to ?? defaults.alert_destinations.email_to),
      webhook_url: alertDestinations.webhook_url ?? defaults.alert_destinations.webhook_url,
    },
    integrations: {
      ...defaults.integrations,
      ...integrations,
      n8n: typeof integrations.n8n === "boolean" ? integrations.n8n : defaults.integrations.n8n,
      gmail_readonly:
        typeof integrations.gmail_readonly === "boolean" ? integrations.gmail_readonly : defaults.integrations.gmail_readonly,
      gmail_send: typeof integrations.gmail_send === "boolean" ? integrations.gmail_send : defaults.integrations.gmail_send,
      instagram: typeof integrations.instagram === "boolean" ? integrations.instagram : defaults.integrations.instagram,
      facebook: typeof integrations.facebook === "boolean" ? integrations.facebook : defaults.integrations.facebook,
    },
    worker: {
      ...defaults.worker,
      ...worker,
      enabled: typeof worker.enabled === "boolean" ? worker.enabled : defaults.worker.enabled,
      worker_slug: worker.worker_slug ?? defaults.worker.worker_slug,
      worker_api_base_url: worker.worker_api_base_url ?? defaults.worker.worker_api_base_url,
      display_name: worker.display_name ?? defaults.worker.display_name,
      platform: worker.platform ?? defaults.worker.platform,
      default_daw: worker.default_daw ?? defaults.worker.default_daw,
      supported_daws: asArray(worker.supported_daws ?? defaults.worker.supported_daws),
      adapter_capabilities: asArray(worker.adapter_capabilities ?? defaults.worker.adapter_capabilities),
      dry_run_daw: typeof worker.dry_run_daw === "boolean" ? worker.dry_run_daw : defaults.worker.dry_run_daw,
      reaper_binary_path: worker.reaper_binary_path ?? defaults.worker.reaper_binary_path,
      protools_app_path: worker.protools_app_path ?? defaults.worker.protools_app_path,
      soundflow_cli_path: worker.soundflow_cli_path ?? defaults.worker.soundflow_cli_path,
      notes: worker.notes ?? defaults.worker.notes,
    },
    module_settings: {
      lead_intake: { ...defaultModules.lead_intake, ...(modules.lead_intake ?? {}) },
      inbox_triage: { ...defaultModules.inbox_triage, ...(modules.inbox_triage ?? {}) },
      content_pipeline: { ...defaultModules.content_pipeline, ...(modules.content_pipeline ?? {}) },
      audio_qc: { ...defaultModules.audio_qc, ...(modules.audio_qc ?? {}) },
      session_prep: { ...defaultModules.session_prep, ...(modules.session_prep ?? {}) },
      revision_parser: { ...defaultModules.revision_parser, ...(modules.revision_parser ?? {}) },
      delivery_packager: { ...defaultModules.delivery_packager, ...(modules.delivery_packager ?? {}) },
      mix_planner: {
        ...defaultModules.mix_planner,
        ...(modules.mix_planner ?? {}),
        default_focus: asArray(modules.mix_planner?.default_focus ?? defaultModules.mix_planner.default_focus),
      },
    },
    onboarding_complete: typeof raw.onboarding_complete === "boolean" ? raw.onboarding_complete : defaults.onboarding_complete,
    created_at: raw.created_at ?? null,
    updated_at: raw.updated_at ?? null,
  };
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

function humanizeMissingField(field: string) {
  const labels: Record<string, string> = {
    studio_name: "studio name",
    operator_name: "primary operator",
    public_base_url: "operator front door",
    "shared_paths.projects": "projects path",
    "shared_paths.deliveries": "deliveries path",
    "shared_paths.approval_queue": "approval queue path",
    "style_seed.raw_text": "tone and voice seed",
    "worker.worker_slug": "worker slug",
    "worker.worker_api_base_url": "worker API URL",
  };
  return labels[field] ?? field.replace(/_/g, " ").replace(/\./g, " / ");
}

function fileLabel(path: string | null | undefined) {
  if (!path) return "unavailable";
  return path.split("/").pop() || path;
}

function parseDelimitedList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function artifactKindLabel(artifact: Record<string, unknown>) {
  return String(artifact.kind ?? artifact.type ?? "artifact");
}

function buildDeliveryHistory(projectDetail: ProjectDetail | null) {
  if (!projectDetail) return [];
  return projectDetail.artifact_inventory
    .map((entry) => {
      const artifact = entry.artifact ?? {};
      const path =
        entry.artifact_path ??
        (artifact.path as string | undefined) ??
        (artifact.manifest_path as string | undefined) ??
        (artifact.delivery_path as string | undefined);
      const kind = artifactKindLabel(artifact).toLowerCase();
      const label = `${kind} ${fileLabel(path)}`.toLowerCase();
      const deliveryLike =
        kind.includes("delivery") ||
        kind.includes("manifest") ||
        kind.includes("render") ||
        label.includes("review_mix") ||
        label.includes("instrumental") ||
        label.includes("stems");
      if (!deliveryLike) return null;
      return {
        artifactId: entry.artifact_id,
        path,
        createdAt: entry.created_at,
        source: entry.source,
        kind: artifactKindLabel(artifact),
        workerSlug: entry.worker_slug,
        summary: path ? fileLabel(path) : JSON.stringify(artifact),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12);
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

async function fetchOptionalJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" }, ...init });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
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

async function loadDashboardData(auditDateFrom = "", auditDateTo = ""): Promise<DashboardData> {
  const auditQuery = new URLSearchParams({ limit: "12" });
  if (auditDateFrom) auditQuery.set("date_from", auditDateFrom);
  if (auditDateTo) auditQuery.set("date_to", auditDateTo);
  const [services, workers, rules, rulePacks, starterPacks, playbooks, tasks, approvals, jobHistory, projects, leads, auditLog, styleProfiles, alerts, runtimeAlerts, runtimeRecovery, bootstrapStatus, workspace] =
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
      fetchJson<DashboardData["jobHistory"]>(`${API.projectState}/jobs/?status=complete&limit=30`),
      fetchJson<ProjectRecord[]>(`${API.crm}/projects`),
      fetchJson<DashboardData["leads"]>(`${API.crm}/leads`),
      fetchJson<AuditEntry[]>(`${API.projectState}/audit-log/?${auditQuery.toString()}`),
      fetchJson<StyleProfile[]>(`${API.crm}/style-profiles?scope=studio`),
      fetchJson<AlertConfig>(`${API.openclaw}/alerts/config`),
      fetchJson<RuntimeAlertSummary>(`${API.projectState}/alerts/summary`),
      fetchJson<RuntimeRecovery>(`${API.projectState}/workers/runtime/recovery`),
      fetchJson<BootstrapStatus>(`${API.openclaw}/bootstrap/status`),
      fetchJson<WorkspaceStatus>(`${API.crm}/workspace-settings/status`),
    ]);

  const previewProjectRoot = workspace.settings.shared_paths.projects || "/data/projects";
  const workstationProfile = await fetchOptionalJson<WorkstationProfile>(`${API.studioWorker}/workstation/profile`);
  const [sessionManifestPreview, mixPlanPreview, renderPlanPreview, listeningReportPreview] = await Promise.all([
    fetchOptionalJson<SessionManifestPreview>(`${API.studioWorker}/session-manifest/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ project_root: previewProjectRoot }),
    }),
    fetchOptionalJson<MixPlanPreview>(`${API.studioWorker}/mix-plan/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        workstation: workstationProfile,
        session_manifest: {
          project_root: previewProjectRoot,
          stem_count: 0,
          reference_count: 0,
          readiness: { ready_for_planning: false },
        },
        priorities: workspace.settings.module_settings.mix_planner.default_focus,
        client_notes: "Preview plan generated from saved studio posture.",
      }),
    }),
    fetchOptionalJson<RenderPlanPreview>(`${API.studioWorker}/render-plan/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        project_slug: workspace.settings.studio_name ? workspace.settings.studio_name.toLowerCase().replace(/\s+/g, "-") : "session",
        target: workspace.settings.module_settings.audio_qc.default_target,
        include_stems: true,
        include_instrumental: true,
      }),
    }),
    fetchOptionalJson<ListeningReportPreview>(`${API.studioWorker}/listening-report/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        target: "review-mix",
        references: workspace.settings.style_seed.source_paths,
        issues: [],
        qc_summary: { target: workspace.settings.module_settings.audio_qc.default_target, hard_fail_count: 0, warning_count: 2 },
        reference_summary: { lufs_delta: -0.6, true_peak_delta: -0.3, alignment: "close" },
      }),
    }),
  ]);
  const executionPlanPreview = await fetchOptionalJson<ExecutionPlanPreview>(`${API.studioWorker}/execution-plan/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      workstation: workstationProfile,
      session_manifest: sessionManifestPreview,
      mix_plan: mixPlanPreview,
      render_plan: renderPlanPreview,
      listening_report: listeningReportPreview,
    }),
  });

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
    jobHistory,
    projects,
    leads,
    auditLog,
    styleProfiles,
    alerts,
    runtimeAlerts,
    runtimeRecovery,
    bootstrapStatus,
    workspace,
    workstationProfile,
    sessionManifestPreview,
    mixPlanPreview,
    renderPlanPreview,
    listeningReportPreview,
    executionPlanPreview,
    loadState: "ready",
    error: null,
  };
}

export {
  API,
  asArray,
  browserProtocol,
  supportSurface,
  primaryTabs,
  zoneDescriptions,
  defaultWorkspaceSettings,
  normalizeWorkspaceSettings,
  summarizeTime,
  humanizeMissingField,
  fileLabel,
  fetchJson,
  parseDelimitedList,
  buildDeliveryHistory,
  serviceStatusHighlights,
  bootstrapStatusLabel,
  n8nWorkflowUrl,
  studioVoicePreview,
  serviceSettingsSummary,
  statusTone,
  primaryMode,
  serviceLabel,
  fetchOptionalJson,
  fetchServiceState,
  groupByZone,
  serviceManagedIn,
  zoneAccent,
  servicePrimaryTab,
  serviceDependencyHints,
  serviceRecommendedAction,
  workflowTone,
  loadDashboardData,
  frontDoorUrl,
  frontDoorServiceUrl,
  serviceProxyBase,
  serviceStatusApi,
  OPERATOR_NAME_KEY,
  OPERATOR_TOKEN_KEY,
  CONCIERGE_TURNS_KEY,
  DEFAULT_CONCIERGE_TURNS,
  loadStoredConciergeTurns,
  serviceCatalog,
};
