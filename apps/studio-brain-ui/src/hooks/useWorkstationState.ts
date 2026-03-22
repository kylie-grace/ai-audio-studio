import { useEffect, useState } from "react";

import type { WorkstationRuntimeStatus, WorkstationSmokeReport, WorkstationValidation } from "../types";
import { API, fetchJson } from "./useDashboardData";

export function useWorkstationState(refreshData: () => Promise<unknown>) {
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
    void refreshWorkstationValidation().catch(() => null);
    void refreshWorkstationRuntime().catch(() => null);
  }, []);

  async function runWorkstationSmoke() {
    setWorkstationSmokePending(true);
    setWorkstationSmokeMessage(null);
    setWorkstationSmokeError(null);
    try {
      const response = await fetch(`${API.studioWorker}/workstation/dry-run-smoke`, { method: "POST", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Smoke run failed with ${response.status}`);
      const payload = (await response.json()) as WorkstationSmokeReport;
      setWorkstationSmoke(payload);
      setWorkstationSmokeMessage(payload.result === "pass" ? "Workstation dry-run smoke passed. Preview chain is ready for operator-reviewed execution." : "Workstation dry-run smoke completed with review items. Inspect blockers and warnings before live DAW actions.");
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
      const response = await fetch(`${API.studioWorker}/runtime/${action}`, { method: "POST", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Runtime ${action} failed with ${response.status}`);
      const payload = (await response.json()) as WorkstationRuntimeStatus;
      setWorkstationRuntime(payload);
      setWorkstationRuntimeMessage(action === "drain" ? "Worker is now draining and will stop claiming new tasks." : "Worker polling resumed.");
      await refreshWorkstationValidation();
      await refreshWorkstationRuntime();
      await refreshData();
    } catch (error) {
      setWorkstationRuntimeError(error instanceof Error ? error.message : `Unable to ${action} worker runtime.`);
    } finally {
      setWorkstationRuntimePending(null);
    }
  }

  return {
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
    refreshWorkstationValidation,
    refreshWorkstationRuntime,
    runWorkstationSmoke,
    updateWorkstationRuntime,
  };
}
