import { useEffect, useState } from "react";

import type { ArtifactPreview, DashboardData, ProjectDetail, WorkstationPluginInventory } from "../types";
import { API, fetchJson } from "./useDashboardData";

type UseProjectContextOptions = {
  data: DashboardData;
  operatorName: string;
  operatorToken: string;
  refreshData: () => Promise<unknown>;
};

export function useProjectContext({ data, operatorName, operatorToken, refreshData }: UseProjectContextOptions) {
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [projectDetailState, setProjectDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedWorkerSlug, setSelectedWorkerSlug] = useState("");
  const [workstationPlugins, setWorkstationPlugins] = useState<WorkstationPluginInventory | null>(null);
  const [workstationPluginsState, setWorkstationPluginsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [artifactActionMessage, setArtifactActionMessage] = useState<string | null>(null);
  const [artifactActionError, setArtifactActionError] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreview | null>(null);
  const [artifactPreviewState, setArtifactPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [reviewSavePending, setReviewSavePending] = useState<"listening" | "render" | null>(null);
  const [reviewSaveMessage, setReviewSaveMessage] = useState<string | null>(null);
  const [reviewSaveError, setReviewSaveError] = useState<string | null>(null);

  const selectedProject = data.projects.find((project) => project.id === selectedProjectId) ?? data.projects[0] ?? null;
  const selectedWorker = data.workers.find((worker) => worker.slug === selectedWorkerSlug) ?? data.workers[0] ?? null;

  function pickDefaultProjectId() {
    const activeProject = data.projects.find((project) => project.status === "active");
    return activeProject?.id ?? data.projects[0]?.id ?? "";
  }

  useEffect(() => {
    if (!data.projects.length) {
      if (selectedProjectId) setSelectedProjectId("");
      return;
    }
    if (selectedProjectId && data.projects.some((project) => project.id === selectedProjectId)) return;
    const nextProjectId = pickDefaultProjectId();
    if (nextProjectId && nextProjectId !== selectedProjectId) setSelectedProjectId(nextProjectId);
  }, [data.projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedWorkerSlug && data.workers[0]?.slug) setSelectedWorkerSlug(data.workers[0].slug);
  }, [data.workers, selectedWorkerSlug]);

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

  useEffect(() => {
    setArtifactPreview(null);
    setArtifactPreviewState("idle");
    setArtifactActionMessage(null);
    setArtifactActionError(null);
  }, [selectedProject?.id]);

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
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Actor": operatorName };
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
      const headers: Record<string, string> = { "Content-Type": "application/json", "X-Actor": operatorName };
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

  return {
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    projectDetail,
    projectDetailState,
    selectedWorker,
    selectedWorkerSlug,
    setSelectedWorkerSlug,
    workstationPlugins,
    workstationPluginsState,
    artifactActionMessage,
    artifactActionError,
    artifactPreview,
    artifactPreviewState,
    previewArtifact,
    copyArtifactValue,
    reviewSavePending,
    reviewSaveMessage,
    reviewSaveError,
    saveListeningReview,
    saveRenderReview,
  };
}
