import { useEffect, useState } from "react";

import type { SettingsSectionId, WorkspaceSettings } from "../types";
import { API, normalizeWorkspaceSettings } from "./useDashboardData";

type UseWorkspaceSetupOptions = {
  workspaceSettings: WorkspaceSettings;
  onboardingRequired: boolean;
  operatorName: string;
  setOperatorName: (value: string) => void;
  refreshData: () => Promise<unknown>;
};

export function useWorkspaceSetup(options: UseWorkspaceSetupOptions) {
  const { workspaceSettings, onboardingRequired, operatorName, setOperatorName, refreshData } = options;
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceSettings>(workspaceSettings);
  const [workspaceDraftHydrated, setWorkspaceDraftHydrated] = useState(false);
  const [editingWorkspaceSetup, setEditingWorkspaceSetup] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("identity");
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardingMessage, setOnboardingMessage] = useState<string | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [styleRescanPending, setStyleRescanPending] = useState(false);

  useEffect(() => {
    if (!workspaceDraftHydrated) {
      setWorkspaceDraft(normalizeWorkspaceSettings(workspaceSettings));
      setWorkspaceDraftHydrated(true);
    }
  }, [workspaceSettings, workspaceDraftHydrated]);

  useEffect(() => {
    if (onboardingRequired) setEditingWorkspaceSetup(true);
  }, [onboardingRequired]);

  function openSetupEditor() {
    setEditingWorkspaceSetup(true);
    setWorkspaceDraft(normalizeWorkspaceSettings(workspaceSettings));
    setSettingsSection("identity");
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
        public_base_url: normalizedDraft.public_base_url.trim(),
        operator_name: normalizedDraft.operator_name.trim() || operatorName,
        shared_paths: {
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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
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

  async function rescanStyleSources() {
    setStyleRescanPending(true);
    setOnboardingError(null);
    setOnboardingMessage(null);
    try {
      const response = await fetch(`${API.crm}/workspace-settings/style-seed/rescan`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Style rescan failed with ${response.status}`);
      const payload = (await response.json()) as { source_count?: number; style_profile_name?: string };
      setOnboardingMessage(`Rescanned ${payload.source_count ?? 0} style source file(s) into ${payload.style_profile_name ?? "the studio profile"}.`);
      await refreshData();
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Unable to rescan style sources");
    } finally {
      setStyleRescanPending(false);
    }
  }

  return {
    workspaceDraft,
    setWorkspaceDraft,
    editingWorkspaceSetup,
    setEditingWorkspaceSetup,
    settingsSection,
    setSettingsSection,
    onboardingSaving,
    onboardingMessage,
    onboardingError,
    styleRescanPending,
    saveWorkspaceSettings,
    rescanStyleSources,
    openSetupEditor,
  };
}
