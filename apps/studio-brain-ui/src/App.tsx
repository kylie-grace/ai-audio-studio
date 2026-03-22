import { useEffect, useState } from "react";

import { AlertBanner } from "./components/AlertBanner";
import { ApprovalQueue } from "./components/ApprovalQueue";
import { EmptyState } from "./components/EmptyState";
import { PrimaryTabStrip } from "./components/PrimaryTabStrip";
import { ContextTab } from "./pages/ContextTab";
import { SettingsTab } from "./pages/SettingsTab";

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

type PluginInventoryRecord = {
  name: string;
  plugin_format: string;
  vendor?: string | null;
  version?: string | null;
  path: string;
  file_name: string;
  installed: boolean;
  source_root?: string | null;
  size_bytes?: number | null;
  modified_at?: string | number | null;
};

type WorkstationPluginInventory = {
  worker_slug: string;
  plugin_count: number;
  counts_by_format: Record<string, number>;
  plugins: PluginInventoryRecord[];
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

type WorkstationProfile = {
  host: string;
  platform: string;
  os_version: string;
  deployment_mode: string;
  dry_run_daw: boolean;
  shared_projects_path: string;
  delivery_path: string;
  daws: Array<{
    slug: string;
    installed: boolean;
    binary_path?: string | null;
    automation_ready: boolean;
    execution_mode: string;
    notes: string;
  }>;
  capabilities: Record<string, boolean>;
  permissions: Record<string, boolean>;
  plugins?: {
    summary?: {
      count: number;
      counts_by_format: Record<string, number>;
      sample_names: string[];
    };
    roots?: Array<{ format: string; root: string; exists: boolean; count: number }>;
  };
  blockers: string[];
  ready: boolean;
};

type ProjectDetail = {
  project: ProjectRecord;
  leads: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  revisions: Array<Record<string, unknown>>;
  qc_reports: Array<Record<string, unknown>>;
  mix_plans: Array<Record<string, unknown>>;
  session_manifests: Array<Record<string, unknown>>;
  listening_reports: Array<Record<string, unknown>>;
  render_reviews: Array<Record<string, unknown>>;
  worker_tasks: WorkerTask[];
  audit_entries: AuditEntry[];
  artifact_inventory: Array<{
    artifact_id: number;
    source: string;
    created_at?: string | null;
    artifact: Record<string, unknown>;
    artifact_path?: string | null;
    job_id?: string;
    task_id?: string;
    module?: string;
    action?: string;
    task_type?: string;
    worker_slug?: string;
  }>;
  review_summary: {
    qc_report_count: number;
    passing_qc_count: number;
    failing_qc_count: number;
    revision_count: number;
    mix_plan_count: number;
    artifact_count: number;
    latest_revision_status?: string | null;
    latest_mix_plan_status?: string | null;
  };
  review_packet: {
    recommended_operator_action: string;
    latest_candidate_path?: string | null;
    focus_flags: string[];
    latest_manifest_status?: string | null;
    latest_revision_status?: string | null;
    latest_mix_plan_status?: string | null;
    latest_qc: {
      file_path?: string | null;
      overall_pass?: boolean | null;
      hard_fail_count: number;
      warning_count: number;
      lufs_integrated?: number | null;
      true_peak_dbfs?: number | null;
      low_end_ratio?: number | null;
      stereo_width?: number | null;
      spectral_tilt_db?: number | null;
    };
    latest_listening_status?: string | null;
    latest_render_review_status?: string | null;
  };
};

type ArtifactPreview = {
  artifact_id: number;
  path: string;
  file_name: string;
  content: string;
};

type SessionManifestPreview = {
  project_root: string;
  stems_dir: string;
  session_path: string;
  reference_count: number;
  stem_count: number;
  stems: Array<{ name: string; path: string; extension: string; size_bytes: number }>;
  references: Array<{ name: string; path: string }>;
  session_files: Array<{ name: string; path: string; type?: string }>;
  session_details: {
    session_type: string;
    track_count: number;
    track_names: string[];
    marker_count: number;
    markers: Array<{ index: number; position: number; name: string }>;
    tempo_candidates: number[];
    introspection_confidence: number;
    primary_session_file?: string | null;
  };
  readiness: {
    has_stems: boolean;
    has_session_files: boolean;
    ready_for_planning: boolean;
    confidence_score: number;
  };
};

type MixPlanPreview = {
  status: string;
  genre: string;
  reference_count: number;
  session_summary: {
    stem_count: number;
    reference_count: number;
    ready_for_planning: boolean;
  };
  priorities: string[];
  client_notes: string;
  phases: Array<{ slug: string; title: string; actions: string[] }>;
  dependency_warnings?: Array<{ slug: string; severity: string; detail: string }>;
  risk_summary: string[];
};

type ListeningReportPreview = {
  status: string;
  target: string;
  reference_count: number;
  checks: Array<{ slug: string; status: string; detail: string }>;
  summary: {
    issue_count: number;
    qc_hard_fail_count: number;
    qc_warning_count: number;
    reference_alignment: string;
    focus_flags?: string[];
  };
  next_actions: string[];
};

type RenderPlanPreview = {
  status: string;
  target: string;
  profile_count: number;
  profiles: Array<{
    slug: string;
    label: string;
    filename: string;
    target: string;
    sample_rate: number;
    bit_depth: number;
    notes: string;
    review_gate?: string;
    qc_required?: boolean;
    listening_required?: boolean;
  }>;
  review_candidate_slug?: string;
  follow_up: string[];
};

type ExecutionPlanPreview = {
  status: string;
  blockers: string[];
  dependency_warnings?: Array<{ slug: string; severity: string; detail: string }>;
  ready_for_operator_review: boolean;
  recommended_next_step: string;
  phases: Array<{ slug: string; title: string; status: string; summary: string }>;
};

type WorkstationValidation = {
  status: string;
  ready: boolean;
  host: string;
  platform: string;
  blockers: string[];
  checks: Array<{ slug: string; label: string; status: string; detail: string }>;
  recommended_next_step: string;
};

type WorkstationSmokeReport = {
  status: string;
  result: "pass" | "review";
  host: string;
  platform: string;
  dry_run_daw: boolean;
  summary: {
    session_ready: boolean;
    mix_phase_count: number;
    render_profile_count: number;
    listening_issue_count: number;
    execution_ready_for_review: boolean;
    warning_count: number;
  };
  recommended_next_step: string;
  validation: WorkstationValidation;
  session_manifest: {
    stem_count: number;
    reference_count: number;
    session_type: string;
    track_count: number;
  };
  mix_plan: {
    phase_count: number;
    risk_summary: string[];
  };
  render_plan: {
    profile_count: number;
    review_candidate_slug?: string;
  };
  listening_report: {
    next_actions: string[];
    focus_flags?: string[];
  };
  execution_plan: {
    blockers: string[];
    dependency_warnings?: Array<{ slug: string; severity: string; detail: string }>;
    recommended_next_step?: string;
  };
};

type WorkstationRuntimeStatus = {
  status: string;
  worker_slug: string;
  runtime: {
    drain_requested: boolean;
    current_task_id?: string | null;
    last_status: string;
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
  host_machine_type: "mac-mini" | "mac-studio" | "macbook-pro" | "windows-pc" | "other";
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
    display_name: string;
    platform: string;
    default_daw: string;
    supported_daws: string[];
    adapter_capabilities: string[];
    dry_run_daw: boolean;
    reaper_binary_path: string;
    protools_app_path: string;
    soundflow_cli_path: string;
    notes: string;
  };
  module_settings: ModuleSettings;
  onboarding_complete: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type WorkspaceStatus = {
  connection_center: Array<{
    slug: string;
    name: string;
    status: "ready" | "partial" | "needs-attention" | "scaffolded";
    configured: boolean;
    kind: string;
    target?: string;
    required_fields: string[];
    steps: string[];
    detail: string;
  }>;
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
  jobHistory: Array<{
    id: string;
    module: string;
    action: string;
    status: string;
    project_id?: string | null;
    requested_by?: string | null;
    approved_by?: string | null;
    created_at: string;
    updated_at?: string;
  }>;
  projects: ProjectRecord[];
  leads: Array<{
    id: string;
    project_id?: string | null;
    source: string;
    raw_input?: string | null;
    normalized?: {
      artist_name?: string;
      service_requested?: string;
      budget_signal?: string;
      urgency?: string;
    } | null;
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
  workstationProfile: WorkstationProfile | null;
  sessionManifestPreview: SessionManifestPreview | null;
  mixPlanPreview: MixPlanPreview | null;
  renderPlanPreview: RenderPlanPreview | null;
  listeningReportPreview: ListeningReportPreview | null;
  executionPlanPreview: ExecutionPlanPreview | null;
  loadState: "loading" | "ready" | "error";
  error: string | null;
};

type TabId = "overview" | "operations" | "automation" | "context" | "settings";

type WorkflowId = "start-day" | "approvals" | "recover-runtime" | "manage-automation" | "update-setup";
type SettingsSectionId = "identity" | "storage" | "voice" | "integrations" | "worker" | "modules";

type ConciergeActionId =
  | "refresh"
  | "goto-settings"
  | "goto-operations"
  | "goto-automation"
  | "goto-context"
  | "run-worker-smoke"
  | "drain-worker"
  | "resume-worker"
  | "test-alerts"
  | "reseed-defaults"
  | "apply-operator-baseline"
  | "open-setup-editor";

type ConciergeTurn = {
  role: "assistant" | "user";
  text: string;
  actions?: Array<{ id: ConciergeActionId; label: string }>;
};

type ConciergeResponse = {
  status: string;
  mode: "llm" | "fallback";
  reply: string;
  actions: Array<{ id: ConciergeActionId; label: string }>;
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

async function loadDashboardData(): Promise<DashboardData> {
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
      fetchJson<AuditEntry[]>(`${API.projectState}/audit-log/?limit=12`),
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
    jobHistory: [],
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
      connection_center: [],
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
    workstationProfile: null,
    sessionManifestPreview: null,
    mixPlanPreview: null,
    renderPlanPreview: null,
    listeningReportPreview: null,
    executionPlanPreview: null,
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
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("identity");
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
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [projectDetailState, setProjectDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedWorkerSlug, setSelectedWorkerSlug] = useState<string>("");
  const [workstationPlugins, setWorkstationPlugins] = useState<WorkstationPluginInventory | null>(null);
  const [workstationPluginsState, setWorkstationPluginsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [workstationValidation, setWorkstationValidation] = useState<WorkstationValidation | null>(null);
  const [workstationValidationState, setWorkstationValidationState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [workstationRuntime, setWorkstationRuntime] = useState<WorkstationRuntimeStatus | null>(null);
  const [workstationRuntimeState, setWorkstationRuntimeState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [workstationRuntimePending, setWorkstationRuntimePending] = useState<"drain" | "resume" | null>(null);
  const [workstationRuntimeMessage, setWorkstationRuntimeMessage] = useState<string | null>(null);
  const [workstationRuntimeError, setWorkstationRuntimeError] = useState<string | null>(null);
  const [workstationSmoke, setWorkstationSmoke] = useState<WorkstationSmokeReport | null>(null);
  const [workstationSmokePending, setWorkstationSmokePending] = useState(false);
  const [workstationSmokeMessage, setWorkstationSmokeMessage] = useState<string | null>(null);
  const [workstationSmokeError, setWorkstationSmokeError] = useState<string | null>(null);
  const [conciergeInput, setConciergeInput] = useState("");
  const [conciergeTurns, setConciergeTurns] = useState<ConciergeTurn[]>([
    {
      role: "assistant",
      text: "Ask about setup, project status, shared storage, approvals, or runtime issues. This assistant uses live control-room state and falls back to explicit setup guidance if Ollama is unavailable.",
      actions: [
        { id: "run-worker-smoke", label: "Run worker smoke" },
        { id: "goto-settings", label: "Review setup" },
        { id: "goto-operations", label: "Show live ops" },
      ],
    },
  ]);
  const [conciergeMode, setConciergeMode] = useState<"llm" | "fallback">("llm");
  const [conciergePending, setConciergePending] = useState(false);
  const [conciergeError, setConciergeError] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState("");
  const [artifactActionMessage, setArtifactActionMessage] = useState<string | null>(null);
  const [artifactActionError, setArtifactActionError] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);
  const [artifactPreviewState, setArtifactPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reviewSavePending, setReviewSavePending] = useState<"listening" | "render" | null>(null);
  const [reviewSaveMessage, setReviewSaveMessage] = useState<string | null>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [showAllRules, setShowAllRules] = useState(false);

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
  const workspaceSettings = normalizeWorkspaceSettings(data.workspace.settings);
  const readinessSummary = data.workspace.readiness_summary;
  const connectionCenter = data.workspace.connection_center;
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
  const workerCapabilities = Array.from(new Set(data.workers.flatMap((worker) => asArray(worker.capabilities))));
  const readyConnectionCount = connectionCenter.filter((item) => item.status === "ready").length;
  const pendingConnections = connectionCenter.filter((item) => item.status !== "ready");
  const topPendingConnection = pendingConnections[0] ?? null;
  const operatorFocusItems = [
    activeAlertCount
      ? {
          title: "Runtime alerts need review",
          detail: `${activeAlertCount} active alert${activeAlertCount === 1 ? "" : "s"} across worker leases, approvals, or runtime thresholds.`,
          action: "Open Operations",
          tab: "operations" as TabId,
          tone: "warn",
        }
      : null,
    data.approvals.length
      ? {
          title: "Approval queue needs action",
          detail: `${data.approvals.length} approval item${data.approvals.length === 1 ? "" : "s"} waiting for an operator decision.`,
          action: "Review approvals",
          tab: "operations" as TabId,
          tone: "warn",
        }
      : null,
    topPendingConnection
      ? {
          title: `${topPendingConnection.name} still needs setup`,
          detail: topPendingConnection.steps[0] ?? topPendingConnection.detail,
          action: "Finish setup",
          tab: "settings" as TabId,
          tone: "watch",
        }
      : null,
    failedTaskCount
      ? {
          title: "Task recovery is available",
          detail: `${failedTaskCount} failed worker task${failedTaskCount === 1 ? "" : "s"} can be requeued or inspected from Operations.`,
          action: "Open recovery",
          tab: "operations" as TabId,
          tone: "watch",
        }
      : {
          title: "Platform is stable",
          detail: "No failed tasks are present. The next high-value move is validating connections or running a worker smoke.",
          action: "Check setup",
          tab: "settings" as TabId,
          tone: "ok",
        },
  ].filter(Boolean) as Array<{ title: string; detail: string; action: string; tab: TabId; tone: "ok" | "warn" | "watch" }>;
  const settingsSections: Array<{ id: SettingsSectionId; label: string; summary: string }> = [
    { id: "identity", label: "Identity", summary: "Studio name, host type, and front door." },
    { id: "storage", label: "Storage", summary: "Projects, approvals, deliveries, and stems." },
    { id: "voice", label: "Voice", summary: "Style seed, tone, and reference files." },
    { id: "integrations", label: "Integrations", summary: "Alerts, Gmail, n8n, and social posture." },
    { id: "worker", label: "Worker", summary: "Optional DAW worker and execution defaults." },
    { id: "modules", label: "Modules", summary: "Lead, inbox, content, QC, revision, and delivery tuning." },
  ];
  const remainingBuildGaps = [
    {
      title: "Gmail send activation",
      state: workspaceSettings.integrations.gmail_send ? "ready" : "watch",
      detail: workspaceSettings.integrations.gmail_send
        ? "Send-side Gmail integration is flagged on. Final validation still depends on real OAuth credentials in n8n."
        : "Approval-router email send is scaffolded but still needs Gmail send OAuth and n8n credential activation.",
    },
    {
      title: "Social publishing credentials",
      state: workspaceSettings.integrations.instagram || workspaceSettings.integrations.facebook ? "watch" : "blocked",
      detail:
        workspaceSettings.integrations.instagram || workspaceSettings.integrations.facebook
          ? "Social posting credentials are partly configured. Keep publishing approval-gated until real account validation is done."
          : "Instagram and Facebook posting remain scaffolded until real studio account tokens are provided.",
    },
    {
      title: "Pro Tools / SoundFlow live pass",
      state: workerCapabilities.includes("execute-soundflow") ? "watch" : "blocked",
      detail: workerCapabilities.includes("execute-soundflow")
        ? "The execution surface exists, but it still needs a real workstation validation pass with SoundFlow and Pro Tools installed."
        : "SoundFlow execution is not yet advertised by a live worker runtime.",
    },
    {
      title: "WaveLab mastering path",
      state: workstationValidation?.checks.some((check) => check.slug === "wavelab-readiness" && check.status === "ready") ? "watch" : "blocked",
      detail: workstationValidation?.checks.some((check) => check.slug === "wavelab-readiness" && check.status === "ready")
        ? "WaveLab is detected well enough for setup review, but mastering execution still needs live validation."
        : "WaveLab posture is documented and detected where present, but no validated mastering runtime exists yet.",
    },
    {
      title: "Windows worker proof",
      state: data.workers.some((worker) => worker.platform === "windows") ? "watch" : "blocked",
      detail: data.workers.some((worker) => worker.platform === "windows")
        ? "A Windows worker is registered; runtime proof still needs a real DAW validation pass."
        : "Cross-platform path translation and validation are built, but no live Windows worker has been proven yet.",
    },
  ];
  const selectedServiceHighlights = serviceStatusHighlights(selectedServiceStatus);
  const selectedServiceProxyUrl = selectedService ? `${frontDoorUrl}${serviceProxyBase[selectedService.key] ?? ""}` : frontDoorUrl;
  const visibleApprovals = data.approvals.slice(0, 8);
  const visibleRules = showAllRules ? data.rules : data.rules.slice(0, 10);
  const normalizedAuditFilter = auditFilter.trim().toLowerCase();
  const filteredAuditLog = data.auditLog.filter((entry) => {
    if (!normalizedAuditFilter) return true;
    return [entry.action, entry.actor, entry.project_id ?? "", entry.job_id ?? "", entry.created_at]
      .join(" ")
      .toLowerCase()
      .includes(normalizedAuditFilter);
  });
  const latestStyleProfile = data.styleProfiles[0] ?? null;
  const voicePreview = studioVoicePreview(workspaceSettings, latestStyleProfile);
  const deliveryHistory = buildDeliveryHistory(projectDetail);
  const workstationProfile = data.workstationProfile;
  const selectedProject = data.projects.find((project) => project.id === selectedProjectId) ?? data.projects[0] ?? null;
  const selectedWorker = data.workers.find((worker) => worker.slug === selectedWorkerSlug) ?? data.workers[0] ?? null;

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
      setWorkspaceDraft(normalizeWorkspaceSettings(data.workspace.settings));
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
    if (!selectedProjectId && data.projects[0]?.id) {
      setSelectedProjectId(data.projects[0].id);
    }
  }, [data.projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedWorkerSlug && data.workers[0]?.slug) {
      setSelectedWorkerSlug(data.workers[0].slug);
    }
  }, [data.workers, selectedWorkerSlug]);

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

    async function loadProjectDetail() {
      if (!selectedProject?.id) {
        setProjectDetail(null);
        setProjectDetailState("idle");
        return;
      }
      setProjectDetailState("loading");
      try {
        const payload = await fetchJson<ProjectDetail>(`${API.projectState}/projects/${selectedProject.id}/detail`);
        if (!active) return;
        setProjectDetail(payload);
        setProjectDetailState("ready");
      } catch {
        if (!active) return;
        setProjectDetail(null);
        setProjectDetailState("error");
      }
    }

    void loadProjectDetail();
    return () => {
      active = false;
    };
  }, [selectedProject?.id]);

  useEffect(() => {
    setArtifactPreview(null);
    setArtifactPreviewState("idle");
    setArtifactActionMessage(null);
    setArtifactActionError(null);
  }, [selectedProject?.id]);

  useEffect(() => {
    let active = true;

    async function loadWorkstationPlugins() {
      if (!selectedWorker?.slug) {
        setWorkstationPlugins(null);
        setWorkstationPluginsState("idle");
        return;
      }
      setWorkstationPluginsState("loading");
      try {
        const payload = await fetchJson<WorkstationPluginInventory>(`${API.projectState}/workers/${selectedWorker.slug}/plugins`);
        if (!active) return;
        setWorkstationPlugins(payload);
        setWorkstationPluginsState("ready");
      } catch {
        if (!active) return;
        setWorkstationPlugins(null);
        setWorkstationPluginsState("error");
      }
    }

    void loadWorkstationPlugins();
    return () => {
      active = false;
    };
  }, [selectedWorker?.slug]);

  async function refreshWorkstationValidation() {
    setWorkstationValidationState("loading");
    try {
      const payload = await fetchJson<WorkstationValidation>(`${API.studioWorker}/workstation/validate`);
      setWorkstationValidation(payload);
      setWorkstationValidationState("ready");
      return payload;
    } catch (error) {
      setWorkstationValidation(null);
      setWorkstationValidationState("error");
      throw error;
    }
  }

  async function refreshWorkstationRuntime() {
    setWorkstationRuntimeState("loading");
    try {
      const payload = await fetchJson<WorkstationRuntimeStatus>(`${API.studioWorker}/runtime`);
      setWorkstationRuntime(payload);
      setWorkstationRuntimeState("ready");
      return payload;
    } catch (error) {
      setWorkstationRuntime(null);
      setWorkstationRuntimeState("error");
      throw error;
    }
  }

  useEffect(() => {
    let active = true;

    async function loadWorkstationValidation() {
      setWorkstationValidationState("loading");
      try {
        const payload = await fetchJson<WorkstationValidation>(`${API.studioWorker}/workstation/validate`);
        if (!active) return;
        setWorkstationValidation(payload);
        setWorkstationValidationState("ready");
      } catch {
        if (!active) return;
        setWorkstationValidation(null);
        setWorkstationValidationState("error");
      }
    }

    void loadWorkstationValidation();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadWorkstationRuntime() {
      setWorkstationRuntimeState("loading");
      try {
        const payload = await fetchJson<WorkstationRuntimeStatus>(`${API.studioWorker}/runtime`);
        if (!active) return;
        setWorkstationRuntime(payload);
        setWorkstationRuntimeState("ready");
      } catch {
        if (!active) return;
        setWorkstationRuntime(null);
        setWorkstationRuntimeState("error");
      }
    }

    void loadWorkstationRuntime();
    return () => {
      active = false;
    };
  }, []);

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

  async function runWorkstationSmoke() {
    setWorkstationSmokePending(true);
    setWorkstationSmokeMessage(null);
    setWorkstationSmokeError(null);
    try {
      const response = await fetch(`${API.studioWorker}/workstation/dry-run-smoke`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Smoke run failed with ${response.status}`);
      }
      const payload = (await response.json()) as WorkstationSmokeReport;
      setWorkstationSmoke(payload);
      setWorkstationSmokeMessage(
        payload.result === "pass"
          ? "Workstation dry-run smoke passed. Preview chain is ready for operator-reviewed execution."
          : "Workstation dry-run smoke completed with review items. Inspect blockers and warnings before live DAW actions.",
      );
      await refreshWorkstationValidation();
    } catch (error) {
      setWorkstationSmokeError(error instanceof Error ? error.message : "Unable to run workstation smoke.");
    } finally {
      setWorkstationSmokePending(false);
    }
  }

  async function updateWorkstationRuntime(action: "drain" | "resume") {
    setWorkstationRuntimePending(action);
    setWorkstationRuntimeMessage(null);
    setWorkstationRuntimeError(null);
    try {
      const response = await fetch(`${API.studioWorker}/runtime/${action}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Runtime ${action} failed with ${response.status}`);
      }
      const payload = (await response.json()) as WorkstationRuntimeStatus;
      setWorkstationRuntime(payload);
      setWorkstationRuntimeMessage(action === "drain" ? "Worker is now draining and will stop claiming new tasks." : "Worker polling resumed.");
      await refreshWorkstationValidation();
      await refreshWorkstationRuntime();
    } catch (error) {
      setWorkstationRuntimeError(error instanceof Error ? error.message : `Unable to ${action} worker runtime.`);
    } finally {
      setWorkstationRuntimePending(null);
    }
  }

  async function runConciergeAction(action: ConciergeActionId) {
    switch (action) {
      case "refresh":
        await refreshData();
        return "Control room refreshed.";
      case "goto-settings":
        setActiveTab("settings");
        return "Opened Settings.";
      case "goto-operations":
        setActiveTab("operations");
        return "Opened Operations.";
      case "goto-automation":
        setActiveTab("automation");
        return "Opened Automation.";
      case "goto-context":
        setActiveTab("context");
        return "Opened Context.";
      case "run-worker-smoke":
        await runWorkstationSmoke();
        return "Ran the workstation dry-run smoke.";
      case "drain-worker":
        await updateWorkstationRuntime("drain");
        return "Worker drain requested.";
      case "resume-worker":
        await updateWorkstationRuntime("resume");
        return "Worker polling resumed.";
      case "test-alerts":
        await runAlertAction("test");
        return "Test alert dispatched.";
      case "reseed-defaults":
        await reseedAutomationDefaults();
        return "Automation defaults reseeded.";
      case "apply-operator-baseline":
        await applyStarterPack("operator-baseline");
        return "Applied the operator-baseline starter pack.";
      case "open-setup-editor":
        setActiveTab("settings");
        setEditingWorkspaceSetup(true);
        setWorkspaceDraft(workspaceSettings);
        setSettingsSection("identity");
        return "Opened the setup editor.";
    }
  }

  function buildFallbackConciergeReply(message: string): ConciergeTurn {
    const lower = message.trim().toLowerCase();
    const pendingConnections = connectionCenter.filter((item) => item.status !== "ready");
    const topPending = pendingConnections[0];

    if (!lower) {
      return { role: "assistant", text: "Ask about setup, alerts, approvals, automation, workers, projects, or what is still missing." };
    }
    if (/(hello|hi|hey|status|what's up|whats up)/.test(lower)) {
      return {
        role: "assistant",
        text: `The assistant backend is unavailable, so this is local fallback guidance. The control plane is ${data.loadState}, ${healthyCount}/${data.services.length} services are healthy, ${activeAlertCount} live alert thresholds are active, and ${pendingConnections.length} connection areas still need attention.`,
        actions: [
          { id: "refresh", label: "Refresh" },
          { id: "goto-operations", label: "Open operations" },
          { id: "goto-settings", label: "Open settings" },
        ],
      };
    }
    if (/(missing|gap|left|remain|roadmap|unfinished|feature)/.test(lower)) {
      return {
        role: "assistant",
        text: `The assistant backend is unavailable, so this is local fallback guidance. The main remaining product gaps are ${remainingBuildGaps
          .filter((item) => item.state !== "ready")
          .map((item) => item.title)
          .join(", ")}. The first connection that still needs direct setup is ${topPending?.name ?? "none right now"}.`,
        actions: [
          { id: "goto-settings", label: "Review setup" },
          { id: "goto-automation", label: "Review automation" },
        ],
      };
    }
    if (/(script|scripting|soundflow|pro tools|wavelab|reascript|reaper)/.test(lower)) {
      return {
        role: "assistant",
        text: "The assistant backend is unavailable, so this is local fallback guidance. The remaining scripting work is mostly live-runtime proof: SoundFlow and Pro Tools still need a real workstation validation pass, WaveLab remains a documented mastering bridge without live proof, and Windows DAW runtime still needs a real workstation. Reaper-first execution and bounded dry-run rehearsal are already in place.",
        actions: [
          { id: "run-worker-smoke", label: "Run worker smoke" },
          { id: "goto-context", label: "Review projects and artifacts" },
        ],
      };
    }
    if (/(connect|integration|gmail|instagram|facebook|n8n|oauth)/.test(lower)) {
      const matching =
        connectionCenter.find((item) => lower.includes(item.slug.replace(/-/g, " "))) ??
        connectionCenter.find((item) => lower.includes(item.slug)) ??
        topPending;
      return {
        role: "assistant",
        text: matching
          ? `The assistant backend is unavailable, so this is local fallback guidance. ${matching.name} is ${matching.status}. ${matching.detail} Next: ${matching.steps.slice(0, 2).join(" ")}`
          : "The connection center can guide front door, n8n, Gmail, social, and worker setup.",
        actions: [
          { id: "goto-settings", label: "Open connection center" },
          ...(matching?.slug === "n8n" ? [{ id: "apply-operator-baseline" as ConciergeActionId, label: "Apply operator baseline" }] : []),
        ],
      };
    }
    if (/(smoke|validate worker|validate setup|dry run)/.test(lower)) {
      return {
        role: "assistant",
        text: "The assistant backend is unavailable, so this is local fallback guidance. The safest next step is the workstation dry-run smoke. It rehearses manifest, mix, listening, render, and execution planning against a disposable session without touching a real project.",
        actions: [{ id: "run-worker-smoke", label: "Run worker smoke" }],
      };
    }
    if (/(drain|pause worker|maintenance)/.test(lower)) {
      return {
        role: "assistant",
        text: "The assistant backend is unavailable, so this is local fallback guidance. Use drain before maintenance so the worker stops claiming new tasks without killing in-flight process state.",
        actions: [{ id: workstationRuntime?.runtime.drain_requested ? "resume-worker" : "drain-worker", label: workstationRuntime?.runtime.drain_requested ? "Resume worker" : "Drain worker" }],
      };
    }
    if (/(alert|test alert|notify)/.test(lower)) {
      return {
        role: "assistant",
        text: `The assistant backend is unavailable, so this is local fallback guidance. There are ${activeAlertCount} active runtime alerts. You can send a test alert now or jump to Operations to inspect the live alert feed.`,
        actions: [
          { id: "test-alerts", label: "Send test alert" },
          { id: "goto-operations", label: "Open operations" },
        ],
      };
    }
    if (/(project|artifact|context|style|rag|knowledge|share|storage)/.test(lower)) {
      return {
        role: "assistant",
        text: "The assistant backend is unavailable, so this is local fallback guidance. The control room is storage-aware through shared paths, style source files, projects, leads, review artifacts, and worker posture. The next step for deeper RAG is indexing shared files and artifact text into a retrieval store.",
        actions: [
          { id: "goto-context", label: "Open context" },
          { id: "goto-settings", label: "Review shared paths" },
        ],
      };
    }
    if (/(delivery|deliverable|render history|package)/.test(lower)) {
      return {
        role: "assistant",
        text: "The assistant backend is unavailable, so this is local fallback guidance. Delivery history is surfaced from the project review stack. Use Context to review renders, manifests, and delivery artifacts from one control surface.",
        actions: [
          { id: "goto-context", label: "Open project review" },
          { id: "goto-operations", label: "Open live ops" },
        ],
      };
    }
    return {
      role: "assistant",
      text: `The assistant backend is unavailable, so this is local fallback guidance. I can still point you to setup, integrations, workers, alerts, approvals, automation posture, and what is still missing. Right now the most useful next action is ${topPending ? `to work through ${topPending.name}` : "to review Operations for live state"}.`,
      actions: [
        { id: "goto-settings", label: "Open settings" },
        { id: "goto-operations", label: "Open operations" },
      ],
    };
  }

  async function submitConciergePrompt(prompt: string) {
    const text = prompt.trim();
    if (!text) return;
    setConciergePending(true);
    setConciergeError(null);
    setConciergeTurns((current) => [...current, { role: "user", text }]);
    try {
      const response = await fetch(`${API.openclaw}/concierge/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok) {
        throw new Error(`concierge returned ${response.status}`);
      }
      const payload = (await response.json()) as ConciergeResponse;
      setConciergeMode(payload.mode ?? "fallback");
      setConciergeTurns((current) => [...current, { role: "assistant", text: payload.reply, actions: payload.actions }]);
      setConciergeInput("");
    } catch (error) {
      setConciergeMode("fallback");
      const reply = buildFallbackConciergeReply(text);
      setConciergeTurns((current) => [...current, reply]);
      setConciergeError(error instanceof Error ? error.message : "Unable to generate concierge response.");
    } finally {
      setConciergePending(false);
    }
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
      const normalizedDraft = normalizeWorkspaceSettings(workspaceDraft);
      const payload = {
        ...normalizedDraft,
        studio_name: normalizedDraft.studio_name.trim(),
        deployment_mode: normalizedDraft.deployment_mode,
        public_base_url: normalizedDraft.public_base_url.trim(),
        https_mode: normalizedDraft.https_mode,
        operator_name: normalizedDraft.operator_name.trim() || operatorName,
        shared_paths: {
          ...normalizedDraft.shared_paths,
          projects: normalizedDraft.shared_paths.projects.trim(),
          deliveries: normalizedDraft.shared_paths.deliveries.trim(),
          draft_queue: normalizedDraft.shared_paths.draft_queue.trim(),
          approval_queue: normalizedDraft.shared_paths.approval_queue.trim(),
          incoming_stems: normalizedDraft.shared_paths.incoming_stems.trim(),
        },
        alert_destinations: {
          ...normalizedDraft.alert_destinations,
          webhook_url: normalizedDraft.alert_destinations.webhook_url.trim(),
          email_to: normalizedDraft.alert_destinations.email_to.map((email) => email.trim()).filter(Boolean),
        },
        style_seed: {
          ...normalizedDraft.style_seed,
          name: normalizedDraft.style_seed.name.trim(),
          raw_text: normalizedDraft.style_seed.raw_text.trim(),
          source_paths: normalizedDraft.style_seed.source_paths.map((path) => path.trim()).filter(Boolean),
        },
        worker: {
          ...normalizedDraft.worker,
          worker_slug: normalizedDraft.worker.worker_slug.trim(),
          worker_api_base_url: normalizedDraft.worker.worker_api_base_url.trim(),
          display_name: normalizedDraft.worker.display_name.trim(),
          supported_daws: normalizedDraft.worker.supported_daws.map((item) => item.trim()).filter(Boolean),
          adapter_capabilities: normalizedDraft.worker.adapter_capabilities.map((item) => item.trim()).filter(Boolean),
          reaper_binary_path: normalizedDraft.worker.reaper_binary_path.trim(),
          protools_app_path: normalizedDraft.worker.protools_app_path.trim(),
          soundflow_cli_path: normalizedDraft.worker.soundflow_cli_path.trim(),
          notes: normalizedDraft.worker.notes.trim(),
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
      setWorkspaceDraft(normalizeWorkspaceSettings(payload));
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
    if (!window.confirm(`Apply ${slug} to the live automation posture? This can disable rules outside the selected pack.`)) {
      return;
    }
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
    if (!window.confirm("Reseed the default automation posture? This can overwrite the current live rule mix.")) {
      return;
    }
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

  async function handleTaskRecovery(taskId: string, action: "release" | "requeue" | "cancel" | "stop") {
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
      setTaskActionMessage(
        `${action === "release" ? "Released" : action === "requeue" ? "Requeued" : action === "stop" ? "Stopped" : "Cancelled"} worker task ${taskId}.`,
      );
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

  async function copyArtifactValue(value: string, label: string) {
    setArtifactActionMessage(null);
    setArtifactActionError(null);
    try {
      await navigator.clipboard.writeText(value);
      setArtifactActionMessage(`${label} copied.`);
    } catch (error) {
      setArtifactActionError(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}`);
    }
  }

  async function previewArtifact(projectId: string, artifactId: number) {
    setArtifactActionMessage(null);
    setArtifactActionError(null);
    setArtifactPreviewState("loading");
    try {
      const payload = await fetchJson<ArtifactPreview>(`${API.projectState}/projects/${projectId}/artifacts/${artifactId}/preview`);
      setArtifactPreview(payload);
      setArtifactPreviewState("ready");
    } catch (error) {
      setArtifactPreview(null);
      setArtifactPreviewState("error");
      setArtifactActionError(error instanceof Error ? error.message : "Unable to preview artifact");
    }
  }

  async function saveListeningReview() {
    if (!selectedProject?.id || !data.listeningReportPreview) return;
    setReviewSavePending("listening");
    setReviewSaveMessage(null);
    setReviewSaveError(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Actor": operatorName,
      };
      if (operatorToken) headers["X-Operator-Token"] = operatorToken;
      const response = await fetch(`${API.projectState}/projects/${selectedProject.id}/listening-reports`, {
        method: "POST",
        headers,
        body: JSON.stringify(data.listeningReportPreview),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Save failed with ${response.status}`);
      }
      setReviewSaveMessage("Listening review saved to the selected project.");
      await refreshData();
    } catch (error) {
      setReviewSaveError(error instanceof Error ? error.message : "Unable to save listening review");
    } finally {
      setReviewSavePending(null);
    }
  }

  async function saveRenderReview() {
    if (!selectedProject?.id || !data.renderPlanPreview) return;
    setReviewSavePending("render");
    setReviewSaveMessage(null);
    setReviewSaveError(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Actor": operatorName,
      };
      if (operatorToken) headers["X-Operator-Token"] = operatorToken;
      const response = await fetch(`${API.projectState}/projects/${selectedProject.id}/render-reviews`, {
        method: "POST",
        headers,
        body: JSON.stringify(data.renderPlanPreview),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Save failed with ${response.status}`);
      }
      setReviewSaveMessage("Render review saved to the selected project.");
      await refreshData();
    } catch (error) {
      setReviewSaveError(error instanceof Error ? error.message : "Unable to save render review");
    } finally {
      setReviewSavePending(null);
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
  const tabBadgeCounts: Record<string, number> = {
    operations: data.approvals.length + activeAlertCount,
    settings: onboardingMissingCount,
  };
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
      detail: `${workspaceSettings.operator_name || "owner"} · ${workspaceSettings.host_machine_type} · ${workspaceSettings.deployment_mode === "control_plane_plus_worker" ? "control plane + worker" : "single machine"}`,
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
  const healthyStudioWorker = data.workers.find((worker) => worker.slug === workspaceSettings.worker.worker_slug)
    ?? data.workers.find((worker) => worker.status === "idle" || worker.status === "busy")
    ?? data.workers[0]
    ?? null;
  const workstationReadiness = [
    {
      label: "Shared projects mount",
      state: workspaceSettings.shared_paths.projects ? "ready" : "watch",
      detail: workspaceSettings.shared_paths.projects || "Set a shared projects path in workspace settings.",
    },
    {
      label: "Execution node",
      state: healthyStudioWorker ? "ready" : workspaceSettings.worker.enabled ? "watch" : "ready",
      detail: healthyStudioWorker
        ? `${healthyStudioWorker.display_name} · ${healthyStudioWorker.status}`
        : workspaceSettings.worker.enabled
          ? "Worker posture is enabled but no node has registered yet."
          : "Single-machine mode is active. A remote worker remains optional.",
    },
    {
      label: "Default DAW",
      state: workerCapabilities.includes("execute-soundflow") || workerCapabilities.includes("execute-reascript") ? "ready" : "watch",
      detail: `${workspaceSettings.module_settings.revision_parser.default_daw} · ${workerCapabilities.length ? workerCapabilities.join(", ") : "no execution capabilities registered"}`,
    },
    {
      label: "Delivery path",
      state: workspaceSettings.shared_paths.deliveries ? "ready" : "watch",
      detail: workspaceSettings.shared_paths.deliveries || "Set a delivery path for package outputs and reports.",
    },
  ];
  const dawCapabilityCards = [
    {
      name: "SoundFlow Execution",
      state: workerCapabilities.includes("execute-soundflow") ? "ready" : "watch",
      detail: workerCapabilities.includes("execute-soundflow")
        ? "A registered worker can claim Pro Tools execution tasks."
        : "Ready for Pro Tools automation once a worker or local execution node advertises execute-soundflow.",
    },
    {
      name: "ReaScript Execution",
      state: workerCapabilities.includes("execute-reascript") ? "ready" : "watch",
      detail: workerCapabilities.includes("execute-reascript")
        ? "A registered worker can claim Reaper execution tasks."
        : "Ready for Reaper automation once a worker or local execution node advertises execute-reascript.",
    },
    {
      name: "Session Prep Surface",
      state: workerCapabilities.includes("session-prep") || data.services.some((service) => service.key === "session-prep" && service.state === "healthy") ? "ready" : "watch",
      detail: "Session import and prep checks are available for future manifest surfacing.",
    },
    {
      name: "Mix Planning Surface",
      state: data.services.some((service) => service.key === "mix-planner" && service.state === "healthy") ? "ready" : "watch",
      detail: "Mix planner is online and ready for future live plan snapshots in the control room.",
    },
  ];
  const dawReviewSurfaceCards = [
    {
      title: "Session Prep Reports",
      state: data.services.some((service) => service.key === "session-prep" && service.state === "healthy") ? "ready" : "watch",
      detail: "Session manifests and prep artifacts are available in Context once a project has been prepared or selected for review.",
    },
    {
      title: "Mix Planning",
      state: data.services.some((service) => service.key === "mix-planner" && service.state === "healthy") ? "ready" : "watch",
      detail: "Mix-plan previews, execution warnings, and revision intent are already surfaced through worker previews and project review.",
    },
    {
      title: "Listening + QC Review",
      state: data.services.some((service) => service.key === "audio-qc" && service.state === "healthy") ? "ready" : "watch",
      detail: "Listening reports, render reviews, and QC summaries are persisted in project review as soon as they are generated or saved.",
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

      <PrimaryTabStrip tabs={primaryTabs} activeTab={activeTab} onSelect={(tabId) => setActiveTab(tabId as TabId)} badgeCounts={tabBadgeCounts} />

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
          <section className="overview-lead-grid">
            <article className="panel focus-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Today</p>
                  <h2>Operator focus</h2>
                </div>
                <span className={`status-pill ${activeAlertCount || data.approvals.length ? "warn" : "ok"}`}>
                  {activeAlertCount || data.approvals.length ? "action needed" : "steady"}
                </span>
              </div>
              <p className="panel-note">
                Start here. This panel keeps the first screen anchored on what needs attention now instead of every subsystem at once.
              </p>
              <div className="focus-list">
                {operatorFocusItems.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    className={`focus-item focus-${item.tone}`}
                    onClick={() => setActiveTab(item.tab)}
                  >
                    <div className="workflow-header">
                      <strong>{item.title}</strong>
                      <span className={`status-pill ${item.tone === "ok" ? "ok" : "warn"}`}>{item.action}</span>
                    </div>
                    <p className="panel-note">{item.detail}</p>
                  </button>
                ))}
              </div>
            </article>
            <article className="panel assistant-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Concierge</p>
                  <h2>Control Room Assistant</h2>
                </div>
                <div className="header-actions">
                  <span className={`status-pill ${conciergeMode === "llm" ? "ok" : "warn"}`}>{conciergeMode === "llm" ? "llm live" : "fallback mode"}</span>
                  <span className="count-pill">{conciergeTurns.length} turns</span>
                </div>
              </div>
              <p className="panel-note">
                Ask about setup, missing features, shared storage posture, integrations, approvals, or project state. Replies come from live control-room context and Ollama when available.
              </p>
              <div className="table-stack top-gap">
                {conciergeTurns.slice(-6).map((turn, index) => (
                  <div key={`${turn.role}-${index}`} className="table-row">
                    <div className="row-main">
                      <strong>{turn.role === "assistant" ? "control room" : operatorName || "operator"}</strong>
                      <div className="muted">{turn.text}</div>
                      {turn.actions?.length ? (
                        <div className="action-row top-gap">
                          {turn.actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              className="action-button"
                              onClick={() => void runConciergeAction(action.id)}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="wizard-footer-actions top-gap">
                <input
                  value={conciergeInput}
                  onChange={(event) => setConciergeInput(event.target.value)}
                  placeholder="What is still missing? Run worker smoke. How do I finish Gmail?"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submitConciergePrompt(conciergeInput);
                    }
                  }}
                />
                <button className="action-button ok" type="button" disabled={conciergePending} onClick={() => void submitConciergePrompt(conciergeInput)}>
                  {conciergePending ? "thinking" : "send"}
                </button>
              </div>
              {conciergeError ? <p className="feedback bad">{conciergeError}</p> : null}
            </article>
          </section>

          <section className="overview-support-grid">
            <article className="panel panel-span-12">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Guided actions</p>
                  <h2>Primary operator workflows</h2>
                </div>
                <span className="count-pill">{workflowPlaybooks.length} lanes</span>
              </div>
              {conciergeMode === "fallback" ? (
                <AlertBanner
                  tone="warn"
                  title="Assistant is running in fallback mode"
                  detail="The UI is still usable, but answers are coming from deterministic local guidance because the concierge backend is unavailable."
                />
              ) : null}
              <div className="workflow-strip" aria-label="Guided operator workflows">
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
              </div>
            </article>
          </section>

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
                  <p className="section-kicker">DAW Foundation</p>
                  <h2>Workstation Capability</h2>
                </div>
                <span className="count-pill">{workerCapabilities.length} capabilities</span>
              </div>
              <div className="foundation-grid">
                <div className="foundation-column">
                  <div className="panel-header compact-header">
                    <div>
                      <span className="metric-label">Readiness</span>
                      <strong>Workstation posture</strong>
                    </div>
                  </div>
                  <div className="readiness-mini-grid">
                    {workstationReadiness.map((item) => (
                      <div key={item.label} className={`mini-card foundation-card ${item.state}`}>
                        <div className="workflow-header">
                          <span className="metric-label">{item.label}</span>
                          <span className={`status-pill ${item.state === "ready" ? "ok" : "warn"}`}>
                            {item.state === "ready" ? "ready" : "watch"}
                          </span>
                        </div>
                        <strong>{item.label}</strong>
                        <p className="panel-note">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="foundation-column">
                  <div className="panel-header compact-header">
                    <div>
                      <span className="metric-label">Capabilities</span>
                      <strong>DAW execution surfaces</strong>
                    </div>
                  </div>
                  <div className="module-grid">
                    {dawCapabilityCards.map((item) => (
                      <div key={item.name} className={`mini-card module-card foundation-capability-card ${item.state}`}>
                        <span className="metric-label">daw capability</span>
                        <strong>{item.name}</strong>
                        <p className="panel-note">{item.detail}</p>
                        <span className={`status-pill ${item.state === "ready" ? "ok" : "warn"}`}>
                          {item.state === "ready" ? "available" : "needs worker"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="foundation-column">
                  <div className="panel-header compact-header">
                    <div>
                      <span className="metric-label">Production Coverage</span>
                      <strong>Review surfaces</strong>
                    </div>
                  </div>
                  <div className="status-grid">
                    {dawReviewSurfaceCards.map((item) => (
                      <div key={item.title} className={`mini-card status-card ${item.state}`}>
                        <div className="workflow-header">
                          <span className="metric-label">{item.title}</span>
                          <span className={`status-pill ${item.state === "ready" ? "ok" : "warn"}`}>
                            {item.state === "ready" ? "live" : "watch"}
                          </span>
                        </div>
                        <strong>{item.title}</strong>
                        <p className="panel-note">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
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
            <article className="panel panel-span-12">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">DAW Foundation</p>
                  <h2>DAW Live Preview</h2>
                </div>
                <span className={`status-pill ${workstationProfile?.ready ? "ok" : "warn"}`}>
                  {workstationProfile ? (workstationProfile.ready ? "ready to stage" : "needs setup") : "worker offline"}
                </span>
              </div>
              <div className="workspace-grid nested-grid">
                <div className="panel-span-4">
                  <div className="mini-card">
                    <span className="metric-label">Workstation posture</span>
                    <strong>{workstationProfile?.deployment_mode ?? "unavailable"}</strong>
                    <p className="panel-note">{workstationProfile?.host ?? "No studio-worker profile is reachable yet."}</p>
                    <div className="summary-pill-row">
                      <span className="summary-pill">{workstationProfile?.platform ?? "macos"}</span>
                      <span className="summary-pill">{workstationProfile?.dry_run_daw ? "dry run" : "live execution"}</span>
                    </div>
                  </div>
                </div>
                <div className="panel-span-4">
                  <div className="mini-card">
                    <span className="metric-label">Session manifest preview</span>
                    <strong>
                      {data.sessionManifestPreview ? `${data.sessionManifestPreview.stem_count} stems · ${data.sessionManifestPreview.reference_count} refs` : "preview unavailable"}
                    </strong>
                    <p className="panel-note">{data.sessionManifestPreview?.project_root ?? workspaceSettings.shared_paths.projects}</p>
                    <div className="summary-pill-row">
                      <span className="summary-pill">
                        {data.sessionManifestPreview?.readiness.ready_for_planning ? "ready for planning" : "waiting for session data"}
                      </span>
                      {data.sessionManifestPreview ? <span className="summary-pill">{Math.round(data.sessionManifestPreview.readiness.confidence_score * 100)}% confidence</span> : null}
                    </div>
                  </div>
                </div>
                <div className="panel-span-4">
                  <div className="mini-card">
                    <span className="metric-label">Mix and listening previews</span>
                    <strong>
                      {data.mixPlanPreview ? `${data.mixPlanPreview.phases.length} plan phases` : "plan unavailable"}
                    </strong>
                    <p className="panel-note">
                      {data.renderPlanPreview ? `${data.renderPlanPreview.profile_count} render profiles staged.` : "Render preview unavailable."}
                    </p>
                    <div className="summary-pill-row">
                      {(data.mixPlanPreview?.priorities ?? []).slice(0, 3).map((item) => (
                        <span key={item} className="summary-pill">
                          {item}
                        </span>
                      ))}
                      {data.executionPlanPreview ? <span className="summary-pill">{data.executionPlanPreview.ready_for_operator_review ? "operator review ready" : "blocked"}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
              <div className="workspace-grid nested-grid top-gap">
                <div className="panel-span-4 table-stack">
                  {(workstationProfile?.daws ?? []).length ? (
                    workstationProfile!.daws.map((daw) => (
                      <div key={daw.slug} className="table-row">
                        <div className="row-main">
                          <strong>{daw.slug}</strong>
                          <div className="muted">{daw.notes}</div>
                          {daw.binary_path ? <div className="muted">{daw.binary_path}</div> : null}
                        </div>
                        <div className="row-meta">
                          <span className={`status-pill ${daw.automation_ready ? "ok" : daw.installed ? "warn" : "bad"}`}>
                            {daw.automation_ready ? "automation ready" : daw.installed ? "installed" : "missing"}
                          </span>
                          <span className="muted">{daw.execution_mode}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">No workstation profile yet. The control plane can still build plans before a real DAW node is attached.</p>
                  )}
                </div>
                <div className="panel-span-4 table-stack">
                  {data.sessionManifestPreview ? (
                    <>
                      <div className="table-row">
                        <div className="row-main">
                          <strong>{data.sessionManifestPreview.session_details.session_type}</strong>
                          <div className="muted">
                            {data.sessionManifestPreview.session_details.track_count} tracks · {data.sessionManifestPreview.session_details.marker_count} markers
                          </div>
                          <div className="muted">{data.sessionManifestPreview.session_details.primary_session_file ?? "No primary session file yet."}</div>
                        </div>
                      </div>
                      {data.sessionManifestPreview.session_details.track_names.slice(0, 4).map((name) => (
                        <div key={name} className="table-row">
                          <div className="row-main">
                            <strong>{name}</strong>
                            <div className="muted">Session track</div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="empty-state">Session introspection will appear here once a DAW session file is reachable.</p>
                  )}
                </div>
                <div className="panel-span-4 table-stack">
                  {data.mixPlanPreview ? (
                    <>
                      {data.mixPlanPreview.phases.map((phase) => (
                        <div key={phase.slug} className="table-row">
                          <div className="row-main">
                            <strong>{phase.title}</strong>
                            <div className="muted">{phase.actions.join(" · ")}</div>
                          </div>
                        </div>
                      ))}
                      {(data.mixPlanPreview.dependency_warnings ?? []).map((warning) => (
                        <div key={warning.slug} className="table-row compact-row">
                          <div className="row-main">
                            <strong>{warning.slug}</strong>
                            <div className="muted">{warning.detail}</div>
                          </div>
                          <div className="row-meta">
                            <span className={`status-pill ${warning.severity === "warn" ? "warn" : "muted"}`}>{warning.severity}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="empty-state">Mix-plan previews will appear here once the worker preview endpoint is reachable.</p>
                  )}
                </div>
                <div className="panel-span-4 table-stack">
                  {data.renderPlanPreview ? (
                    <>
                      {data.renderPlanPreview.profiles.map((profile) => (
                        <div key={profile.slug} className="table-row">
                          <div className="row-main">
                            <strong>{profile.label}</strong>
                            <div className="muted">{profile.filename}</div>
                            <div className="muted">{profile.sample_rate} Hz · {profile.bit_depth}-bit · {profile.target}</div>
                            <div className="muted">{profile.review_gate ?? "internal-review"} · {profile.qc_required ? "qc required" : "qc optional"} · {profile.listening_required ? "listening required" : "listening optional"}</div>
                          </div>
                          <div className="row-meta">
                            <span className={`status-pill ${profile.slug === data.renderPlanPreview?.review_candidate_slug ? "ok" : "muted"}`}>
                              {profile.slug === data.renderPlanPreview?.review_candidate_slug ? "candidate" : "supporting"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {selectedProject?.id ? (
                        <div className="action-row">
                          <button className="action-button" type="button" disabled={reviewSavePending === "render"} onClick={saveRenderReview}>
                            {reviewSavePending === "render" ? "saving" : "save render review"}
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="empty-state">Render profiles will appear here once preview generation is available.</p>
                  )}
                </div>
                <div className="panel-span-4 table-stack">
                  {data.listeningReportPreview ? (
                    <>
                      <div className="table-row">
                        <div className="row-main">
                          <strong>Listening summary</strong>
                          <div className="muted">
                            {data.listeningReportPreview.summary.qc_hard_fail_count} hard fails · {data.listeningReportPreview.summary.qc_warning_count} warnings
                          </div>
                          <div className="muted">Reference alignment: {data.listeningReportPreview.summary.reference_alignment}</div>
                          {(data.listeningReportPreview.summary.focus_flags ?? []).length ? (
                            <div className="summary-pill-row top-gap">
                              {(data.listeningReportPreview.summary.focus_flags ?? []).map((flag) => <span key={flag} className="summary-pill">{flag}</span>)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {data.listeningReportPreview.checks.map((check) => (
                        <div key={check.slug} className="table-row">
                          <div className="row-main">
                            <strong>{check.slug}</strong>
                            <div className="muted">{check.detail}</div>
                          </div>
                          <div className="row-meta">
                            <span className={`status-pill ${check.status === "attention" ? "bad" : "warn"}`}>{check.status}</span>
                          </div>
                        </div>
                      ))}
                      {selectedProject?.id ? (
                        <div className="action-row">
                          <button className="action-button" type="button" disabled={reviewSavePending === "listening"} onClick={saveListeningReview}>
                            {reviewSavePending === "listening" ? "saving" : "save listening review"}
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="empty-state">Listening heuristics will appear here once preview generation is available.</p>
                  )}
                </div>
                <div className="panel-span-4 table-stack">
                  {data.executionPlanPreview ? (
                    <>
                      <div className="table-row">
                        <div className="row-main">
                          <strong>Execution plan</strong>
                          <div className="muted">{data.executionPlanPreview.recommended_next_step}</div>
                          <div className="muted">
                            {data.executionPlanPreview.blockers.length ? data.executionPlanPreview.blockers.join(" · ") : "No blocking conditions in preview mode."}
                          </div>
                        </div>
                        <div className="row-meta">
                          <span className={`status-pill ${data.executionPlanPreview.ready_for_operator_review ? "ok" : "warn"}`}>
                            {data.executionPlanPreview.ready_for_operator_review ? "review ready" : "blocked"}
                          </span>
                        </div>
                      </div>
                      {data.executionPlanPreview.phases.map((phase) => (
                        <div key={phase.slug} className="table-row">
                          <div className="row-main">
                            <strong>{phase.title}</strong>
                            <div className="muted">{phase.summary}</div>
                          </div>
                          <div className="row-meta">
                            <span className={`status-pill ${phase.status === "ready" ? "ok" : phase.status === "watch" ? "warn" : "bad"}`}>{phase.status}</span>
                          </div>
                        </div>
                      ))}
                      {(data.executionPlanPreview.dependency_warnings ?? []).map((warning) => (
                        <div key={warning.slug} className="table-row compact-row">
                          <div className="row-main">
                            <strong>{warning.slug}</strong>
                            <div className="muted">{warning.detail}</div>
                          </div>
                          <div className="row-meta">
                            <span className={`status-pill ${warning.severity === "warn" ? "warn" : "muted"}`}>{warning.severity}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="empty-state">Execution-loop posture will appear here once all DAW preview surfaces are reachable.</p>
                  )}
                </div>
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
          <ApprovalQueue
            approvals={data.approvals}
            visibleApprovals={visibleApprovals}
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
                    {(workstationValidation?.checks ?? []).map((check) => (
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
                <div className="header-actions">
                  <input
                    value={auditFilter}
                    onChange={(event) => setAuditFilter(event.target.value)}
                    placeholder="filter actor, action, project, or job"
                  />
                  <span className="count-pill">{filteredAuditLog.length}</span>
                </div>
              </div>
              <div className="table-stack">
                {filteredAuditLog.length ? (
                  filteredAuditLog.map((entry) => (
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
                  <h2>Automation Health</h2>
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
                <div className="header-actions">
                  <span className="count-pill">showing {visibleRules.length} of {data.rules.length}</span>
                  {data.rules.length > 10 ? (
                    <button className="action-button subtle" type="button" onClick={() => setShowAllRules((current) => !current)}>
                      {showAllRules ? "show less" : "show all"}
                    </button>
                  ) : null}
                </div>
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
        <ContextTab
          data={data}
          contextCards={contextCards}
          latestStyleProfile={latestStyleProfile}
          voicePreview={voicePreview}
          workspaceSettings={workspaceSettings}
          styleSourceCount={styleSourceCount}
          styleRescanPending={styleRescanPending}
          rescanStyleSources={rescanStyleSources}
          workstationPlugins={workstationPlugins}
          workstationPluginsState={workstationPluginsState}
          workstationProfile={workstationProfile}
          selectedWorker={selectedWorker}
          setSelectedWorkerSlug={setSelectedWorkerSlug}
          selectedProject={selectedProject}
          setSelectedProjectId={setSelectedProjectId}
          projectDetail={projectDetail}
          projectDetailState={projectDetailState}
          artifactPreview={artifactPreview}
          artifactPreviewState={artifactPreviewState}
          artifactActionMessage={artifactActionMessage}
          artifactActionError={artifactActionError}
          previewArtifact={previewArtifact}
          copyArtifactValue={copyArtifactValue}
          deliveryHistory={deliveryHistory}
          reviewSaveMessage={reviewSaveMessage}
          reviewSaveError={reviewSaveError}
          summarizeTime={summarizeTime}
          fileLabel={fileLabel}
          apiProjectStateBase={API.projectState}
        />
      ) : null}

      {!isInitialLoad && activeTab === "settings" ? (
        <SettingsTab
          data={data}
          onboardingRequired={onboardingRequired}
          onboardingMissingCount={onboardingMissingCount}
          editingWorkspaceSetup={editingWorkspaceSetup}
          setEditingWorkspaceSetup={setEditingWorkspaceSetup}
          workspaceSettings={workspaceSettings}
          workspaceDraft={workspaceDraft}
          setWorkspaceDraft={setWorkspaceDraft}
          settingsSection={settingsSection}
          setSettingsSection={setSettingsSection}
          settingsSections={settingsSections}
          humanizeMissingField={humanizeMissingField}
          connectionCenter={connectionCenter}
          settingsPills={settingsPills}
          onboardingStepCount={onboardingStepCount}
          refreshData={refreshData}
          saveWorkspaceSettings={saveWorkspaceSettings}
          onboardingSaving={onboardingSaving}
          onboardingMessage={onboardingMessage}
          onboardingError={onboardingError}
          frontDoorUrl={frontDoorUrl}
          frontDoorMode={frontDoorMode}
          integrationReadinessLabel={integrationReadinessLabel}
          alertEmailCount={alertEmailCount}
          workerPostureLabel={workerPostureLabel}
          moduleEnabledCount={moduleEnabledCount}
          moduleSettings={moduleSettings}
          styleSourceCount={styleSourceCount}
          integrationFlags={integrationFlags}
          styleRescanPending={styleRescanPending}
          rescanStyleSources={rescanStyleSources}
          parseDelimitedList={parseDelimitedList}
          setOperatorName={setOperatorName}
        />
      ) : null}
    </main>
  );
}
