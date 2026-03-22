export type ServiceState = "healthy" | "degraded" | "offline";

export type ServiceRecord = {
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

export type WorkerNode = {
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

export type PluginInventoryRecord = {
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

export type WorkstationPluginInventory = {
  worker_slug: string;
  plugin_count: number;
  counts_by_format: Record<string, number>;
  plugins: PluginInventoryRecord[];
};

export type OrchestrationRule = {
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

export type RulePack = {
  slug: string;
  name: string;
  description: string;
  rule_count: number;
};

export type StarterPack = {
  slug: string;
  name: string;
  description: string;
  rule_slugs: string[];
  alert_channels: string[];
  rules: OrchestrationRule[];
};

export type Playbook = {
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

export type WorkerTask = {
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

export type ApprovalItem = {
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

export type ProjectRecord = {
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

export type AuditEntry = {
  id?: number | string;
  job_id?: string | null;
  project_id?: string | null;
  actor: string;
  action: string;
  tier: number;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

export type StyleProfile = {
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

export type AlertChannel = {
  slug: string;
  name: string;
  configured: boolean;
  detail: string;
};

export type AlertThreshold = {
  slug: string;
  name: string;
  condition: string;
  severity: string;
};

export type AlertConfig = {
  configured_channel_count: number;
  channels: AlertChannel[];
  thresholds: AlertThreshold[];
};

export type AlertDeliveryResult = {
  channel: string;
  status: string;
  detail: string;
};

export type AlertActionResponse = {
  status?: string;
  event?: RuntimeAlert;
  deliveries?: AlertDeliveryResult[];
  dispatched_count?: number;
  results?: Array<{
    deliveries: AlertDeliveryResult[];
  }>;
};

export type RuntimeAlert = {
  slug: string;
  severity: string;
  detail: string;
};

export type RuntimeAlertSummary = {
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

export type RuntimeRecovery = {
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

export type WorkstationProfile = {
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

export type ProjectDetail = {
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

export type ArtifactPreview = {
  artifact_id: number;
  path: string;
  file_name: string;
  content: string;
};

export type SessionManifestPreview = {
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

export type MixPlanPreview = {
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

export type ListeningReportPreview = {
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

export type RenderPlanPreview = {
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

export type ExecutionPlanPreview = {
  status: string;
  blockers: string[];
  dependency_warnings?: Array<{ slug: string; severity: string; detail: string }>;
  ready_for_operator_review: boolean;
  recommended_next_step: string;
  phases: Array<{ slug: string; title: string; status: string; summary: string }>;
};

export type WorkstationValidation = {
  status: string;
  ready: boolean;
  host: string;
  platform: string;
  blockers: string[];
  checks: Array<{ slug: string; label: string; status: string; detail: string }>;
  recommended_next_step: string;
};

export type WorkstationSmokeReport = {
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

export type WorkstationRuntimeStatus = {
  status: string;
  worker_slug: string;
  runtime: {
    drain_requested: boolean;
    current_task_id?: string | null;
    last_status: string;
  };
};

export type BootstrapStatus = {
  status: string;
  workflow_count: number;
  detail: string;
  updated_at?: string;
};

export type ServiceStatusPayload = Record<string, unknown>;

export type ModuleSettings = {
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

export type WorkspaceSettings = {
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

export type WorkspaceStatus = {
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

export type DashboardData = {
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
  workerHealth: Record<string, unknown> | null;
  workstationProfile: WorkstationProfile | null;
  sessionManifestPreview: SessionManifestPreview | null;
  mixPlanPreview: MixPlanPreview | null;
  renderPlanPreview: RenderPlanPreview | null;
  listeningReportPreview: ListeningReportPreview | null;
  executionPlanPreview: ExecutionPlanPreview | null;
  loadState: "loading" | "ready" | "error";
  error: string | null;
};

export type TabId = "overview" | "operations" | "automation" | "context" | "settings";

export type WorkflowId = "start-day" | "approvals" | "recover-runtime" | "manage-automation" | "update-setup";
export type SettingsSectionId = "identity" | "storage" | "voice" | "integrations" | "worker" | "modules";

export type ConciergeActionId =
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

export type ConciergeTurn = {
  role: "assistant" | "user";
  text: string;
  actions?: Array<{ id: ConciergeActionId; label: string }>;
};

export type ConciergeResponse = {
  status: string;
  mode: "llm" | "fallback";
  reply: string;
  actions: Array<{ id: ConciergeActionId; label: string }>;
};
