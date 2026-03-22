import { useEffect, useRef, useState } from "react";

import {
  API,
  CONCIERGE_TURNS_KEY,
  DEFAULT_CONCIERGE_TURNS,
  OPERATOR_NAME_KEY,
  OPERATOR_TOKEN_KEY,
  asArray,
  bootstrapStatusLabel,
  browserProtocol,
  buildDeliveryHistory,
  defaultWorkspaceSettings,
  fileLabel,
  frontDoorServiceUrl,
  frontDoorUrl,
  fetchJson,
  groupByZone,
  humanizeMissingField,
  loadDashboardData,
  loadStoredConciergeTurns,
  normalizeWorkspaceSettings,
  n8nWorkflowUrl,
  parseDelimitedList,
  primaryMode,
  primaryTabs,
  serviceCatalog,
  serviceDependencyHints,
  serviceLabel,
  serviceManagedIn,
  servicePrimaryTab,
  serviceProxyBase,
  serviceRecommendedAction,
  serviceSettingsSummary,
  serviceStatusApi,
  serviceStatusHighlights,
  statusTone,
  studioVoicePreview,
  summarizeTime,
  supportSurface,
  workflowTone,
  zoneAccent,
  zoneDescriptions,
} from "../appCore";
import type {
  AlertActionResponse,
  ArtifactPreview,
  ConciergeActionId,
  ConciergeResponse,
  ConciergeTurn,
  DashboardData,
  ProjectDetail,
  ServiceStatusPayload,
  SettingsSectionId,
  TabId,
  WorkflowId,
  WorkstationPluginInventory,
  WorkstationRuntimeStatus,
  WorkstationSmokeReport,
  WorkstationValidation,
  WorkspaceSettings,
} from "../types";

export function useDashboardModel() {
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
  const [approvedJobIds, setApprovedJobIds] = useState<string[]>([]);
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
  const [expandedStarterPackSlug, setExpandedStarterPackSlug] = useState<string | null>(null);
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
  const [conciergeTurns, setConciergeTurns] = useState<ConciergeTurn[]>(() => loadStoredConciergeTurns());
  const [conciergeMode, setConciergeMode] = useState<"llm" | "fallback">("llm");
  const [conciergePending, setConciergePending] = useState(false);
  const [conciergeError, setConciergeError] = useState<string | null>(null);
  const [approvalArrivalMessage, setApprovalArrivalMessage] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [artifactActionMessage, setArtifactActionMessage] = useState<string | null>(null);
  const [artifactActionError, setArtifactActionError] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);
  const [artifactPreviewState, setArtifactPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reviewSavePending, setReviewSavePending] = useState<"listening" | "render" | null>(null);
  const [reviewSaveMessage, setReviewSaveMessage] = useState<string | null>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);
  const [showAllRules, setShowAllRules] = useState(false);
  const previousApprovalIdsRef = useRef<string[]>([]);

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
  const lufsTargetMap: Record<string, number> = {
    streaming: -14,
    broadcast: -23,
    cinema: -27,
    cd: -9,
  };
  const configuredLufsTarget = lufsTargetMap[String(workspaceSettings.module_settings.audio_qc.default_target ?? "streaming")] ?? -14;

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
    window.sessionStorage.setItem(CONCIERGE_TURNS_KEY, JSON.stringify(conciergeTurns.slice(-8)));
  }, [conciergeTurns]);

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
    setApprovedJobIds((current) => current.filter((jobId) => data.approvals.some((job) => job.id === jobId)));
  }, [data.approvals]);

  useEffect(() => {
    const currentIds = data.approvals.map((job) => job.id);
    if (!previousApprovalIdsRef.current.length) {
      previousApprovalIdsRef.current = currentIds;
      return;
    }
    const newApprovals = data.approvals.filter((job) => !previousApprovalIdsRef.current.includes(job.id));
    if (newApprovals.length) {
      const lead = newApprovals[0];
      setApprovalArrivalMessage(`New approval waiting: ${lead.module} ${lead.action}.`);
    }
    previousApprovalIdsRef.current = currentIds;
  }, [data.approvals]);

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
        const nextData = await loadDashboardData(auditDateFrom, auditDateTo);
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
  }, [auditDateFrom, auditDateTo]);

  async function refreshData() {
    const nextData = await loadDashboardData(auditDateFrom, auditDateTo);
    setData(nextData);
    setSelectedServiceKey((current) => {
      if (nextData.services.some((service) => service.key === current)) return current;
      return nextData.services[0]?.key ?? current;
    });
  }

  function setAuditDateRange(dateFrom: string, dateTo: string) {
    setAuditDateFrom(dateFrom);
    setAuditDateTo(dateTo);
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
    setConciergeTurns((current) => [...current, { role: "user" as const, text }].slice(-8));
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
      setConciergeTurns((current) => [...current, { role: "assistant" as const, text: payload.reply, actions: payload.actions }].slice(-8));
      setConciergeInput("");
    } catch (error) {
      setConciergeMode("fallback");
      const reply = buildFallbackConciergeReply(text);
      setConciergeTurns((current) => [...current, reply].slice(-8));
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
      if (decision === "approve") {
        setApprovedJobIds((current) => (current.includes(jobId) ? current : [...current, jobId]));
      }
      setActionMessage(
        decision === "approve"
          ? `Approved ${jobId} and queued it for execution or routing.`
          : `Rejected ${jobId}.`,
      );
      if (decision === "reject") {
        setRejectReasons((current) => ({ ...current, [jobId]: "" }));
      }
      if (decision === "approve") {
        window.setTimeout(() => {
          void refreshData();
        }, 1200);
      } else {
        await refreshData();
      }
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

  const credentialWarnings = [
    !workspaceSettings.integrations.gmail_readonly || !workspaceSettings.integrations.gmail_send
      ? {
          id: "gmail",
          title: "Gmail automation credentials are incomplete",
          detail:
            "Inbox read/send flows are scaffolded, but one or more Gmail integration flags are still off in workspace settings.",
        }
      : null,
    !workspaceSettings.integrations.instagram && !workspaceSettings.integrations.facebook
      ? {
          id: "social",
          title: "Publishing credentials are not configured",
          detail:
            "Content drafting is available, but social publishing should remain operator-reviewed until Instagram or Facebook credentials are wired.",
        }
      : null,
    data.services.some((service) => service.key === "ollama" && service.state !== "healthy")
      ? {
          id: "llm-runtime",
          title: "LLM runtime is not healthy",
          detail:
            "Drafting and assistant flows will fall back or degrade while the model runtime is unavailable.",
        }
      : null,
  ].filter(Boolean);


  return {
    API,
    data,
    operatorName,
    setOperatorName,
    operatorToken,
    setOperatorToken,
    actionMessage,
    actionError,
    pendingJobId,
    approvedJobIds,
    pendingTaskActionId,
    rejectReasons,
    setRejectReasons,
    workspaceDraft,
    setWorkspaceDraft,
    editingWorkspaceSetup,
    setEditingWorkspaceSetup,
    settingsSection,
    setSettingsSection,
    onboardingSaving,
    onboardingMessage,
    onboardingError,
    alertActionPending,
    alertActionMessage,
    alertActionError,
    starterPackPending,
    starterPackMessage,
    starterPackError,
    expandedStarterPackSlug,
    setExpandedStarterPackSlug,
    maintenancePending,
    maintenanceMessage,
    maintenanceError,
    taskActionMessage,
    taskActionError,
    activeTab,
    setActiveTab,
    selectedServiceKey,
    setSelectedServiceKey,
    serviceInspectorMessage,
    serviceInspectorError,
    selectedServiceStatus,
    selectedServiceStatusState,
    styleRescanPending,
    selectedProjectId,
    setSelectedProjectId,
    projectDetail,
    projectDetailState,
    selectedWorkerSlug,
    setSelectedWorkerSlug,
    workstationPlugins,
    workstationPluginsState,
    workstationValidation,
    workstationValidationState,
    workstationRuntime,
    workstationRuntimeState,
    workstationRuntimePending,
    workstationRuntimeMessage,
    workstationRuntimeError,
    workstationSmoke,
    workstationSmokePending,
    workstationSmokeMessage,
    workstationSmokeError,
    conciergeInput,
    setConciergeInput,
    conciergeTurns,
    conciergeMode,
    conciergePending,
    conciergeError,
    approvalArrivalMessage,
    setApprovalArrivalMessage,
    auditFilter,
    setAuditFilter,
    auditDateFrom,
    auditDateTo,
    artifactActionMessage,
    artifactActionError,
    artifactPreview,
    artifactPreviewState,
    reviewSavePending,
    reviewSaveMessage,
    reviewSaveError,
    showAllRules,
    setShowAllRules,
    healthyCount,
    isInitialLoad,
    optionalOfflineCount,
    activeTaskCount,
    failedTaskCount,
    enabledRuleCount,
    n8nUrl,
    secureHint,
    configuredAlertCount,
    activeAlertCount,
    serviceZones,
    selectedService,
    zoneSummaries,
    workspaceSettings,
    readinessSummary,
    connectionCenter,
    styleSourceCount,
    alertEmailCount,
    displayedFrontDoor,
    activeStarterPack,
    integrationFlags,
    moduleSettings,
    moduleEnabledCount,
    workerCapabilities,
    readyConnectionCount,
    pendingConnections,
    topPendingConnection,
    operatorFocusItems,
    settingsSections,
    remainingBuildGaps,
    selectedServiceHighlights,
    selectedServiceProxyUrl,
    visibleApprovals,
    visibleRules,
    filteredAuditLog,
    latestStyleProfile,
    voicePreview,
    deliveryHistory,
    workstationProfile,
    selectedProject,
    selectedWorker,
    configuredLufsTarget,
    refreshData,
    setAuditDateRange,
    runWorkstationSmoke,
    updateWorkstationRuntime,
    runConciergeAction,
    submitConciergePrompt,
    handleApproval,
    saveWorkspaceSettings,
    runAlertAction,
    applyStarterPack,
    reseedAutomationDefaults,
    handleTaskRecovery,
    retireWorker,
    previewArtifact,
    copyArtifactValue,
    saveListeningReview,
    saveRenderReview,
    copyServiceField,
    rescanStyleSources,
    onboardingRequired,
    onboardingMissingCount,
    onboardingStepCount,
    tabBadgeCounts,
    settingsPills,
    frontDoorMode,
    integrationReadinessLabel,
    workerPostureLabel,
    contextCards,
    supportHealthCards,
    workstationReadiness,
    dawCapabilityCards,
    dawReviewSurfaceCards,
    workflowPlaybooks,
    credentialWarnings,
    bootstrapStatusLabel,
    workflowTone,
    primaryTabs,
    supportSurface,
    zoneAccent,
    zoneDescriptions,
    statusTone,
    serviceLabel,
    serviceSettingsSummary,
    serviceDependencyHints,
    serviceManagedIn,
    servicePrimaryTab,
    serviceRecommendedAction,
    summarizeTime,
    humanizeMissingField,
    parseDelimitedList,
    fileLabel,
    n8nWorkflowUrl,
    frontDoorUrl,
  };
}
