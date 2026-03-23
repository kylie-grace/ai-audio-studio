import { useEffect, useState } from "react";

import type { ConciergeActionId, ConciergeResponse, ConciergeTurn, DashboardData, TabId, WorkstationRuntimeStatus } from "../types";
import { API, CONCIERGE_TURNS_KEY, loadStoredConciergeTurns } from "./useDashboardData";

type GapItem = { title: string; state: string; detail: string };
type ConnectionItem = { name: string; slug: string; status: string; detail: string; steps: string[] };

type UseConciergeModeOptions = {
  data: DashboardData;
  connectionCenter: ConnectionItem[];
  remainingBuildGaps: GapItem[];
  activeAlertCount: number;
  healthyCount: number;
  runAlertAction: (action: "test" | "dispatch") => Promise<void>;
  runWorkstationSmoke: () => Promise<void>;
  updateWorkstationRuntime: (action: "drain" | "resume") => Promise<void>;
  workstationRuntime: WorkstationRuntimeStatus | null;
  applyStarterPack: (slug: string) => Promise<void>;
  reseedAutomationDefaults: () => Promise<void>;
  refreshData: () => Promise<unknown>;
  setActiveTab: (tab: TabId) => void;
  openSetupEditor: () => void;
};

export function useConciergeMode(options: UseConciergeModeOptions) {
  const {
    data,
    connectionCenter,
    remainingBuildGaps,
    activeAlertCount,
    healthyCount,
    runAlertAction,
    runWorkstationSmoke,
    updateWorkstationRuntime,
    workstationRuntime,
    applyStarterPack,
    reseedAutomationDefaults,
    refreshData,
    setActiveTab,
    openSetupEditor,
  } = options;
  const [conciergeInput, setConciergeInput] = useState("");
  const [conciergeTurns, setConciergeTurns] = useState<ConciergeTurn[]>(() => loadStoredConciergeTurns());
  const [conciergeMode, setConciergeMode] = useState<"llm" | "fallback">("llm");
  const [conciergePending, setConciergePending] = useState(false);
  const [conciergeError, setConciergeError] = useState<string | null>(null);
  const suggestedPrompts = [
    remainingBuildGaps.some((item) => item.state !== "ready") ? `What should I fix first in ${remainingBuildGaps.find((item) => item.state !== "ready")?.title ?? "setup"}?` : "What should I do first?",
    connectionCenter.some((item) => item.status !== "ready") ? "Which connection should I finish next?" : "Is the control room ready for a novice?",
    data.runtimeRecovery.summary.failed_task_count || data.runtimeRecovery.summary.expired_claim_count
      ? "How do I recover stuck runtime?"
      : "What is the safest next action?",
  ].filter((prompt, index, prompts) => Boolean(prompt) && prompts.indexOf(prompt) === index) as string[];

  useEffect(() => {
    window.sessionStorage.setItem(CONCIERGE_TURNS_KEY, JSON.stringify(conciergeTurns.slice(-8)));
  }, [conciergeTurns]);

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
        openSetupEditor();
        return "Opened the setup editor.";
    }
  }

  function buildFallbackConciergeReply(message: string): ConciergeTurn {
    const lower = message.trim().toLowerCase();
    const pendingConnections = connectionCenter.filter((item) => item.status !== "ready");
    const topPending = pendingConnections[0];
    if (!lower) return { role: "assistant" as const, text: "Ask about setup, alerts, approvals, automation, workers, projects, or what is still missing." };
    if (/(hello|hi|hey|status|what's up|whats up)/.test(lower)) {
      return {
        role: "assistant" as const,
        text: `The assistant backend is unavailable, so this is local fallback guidance. The control plane is ${data.loadState}, ${healthyCount}/${data.services.length} services are healthy, ${activeAlertCount} live alert thresholds are active, and ${pendingConnections.length} connection areas still need attention. If you want a safe starting point, open Settings for setup gaps, Automation for starter packs, or Operations for runtime recovery.`,
        actions: [{ id: "refresh", label: "Refresh" }, { id: "goto-operations", label: "Open operations" }, { id: "goto-settings", label: "Open settings" }],
      };
    }
    if (/(missing|gap|left|remain|roadmap|unfinished|feature)/.test(lower)) {
      return {
        role: "assistant" as const,
        text: `The assistant backend is unavailable, so this is local fallback guidance. The main remaining product gaps are ${remainingBuildGaps.filter((item) => item.state !== "ready").map((item) => item.title).join(", ")}. The first connection that still needs direct setup is ${topPending?.name ?? "none right now"}. Start with Settings, then Automation, then Operations if runtime recovery is needed.`,
        actions: [{ id: "goto-settings", label: "Review setup" }, { id: "goto-automation", label: "Review automation" }, { id: "goto-operations", label: "Open operations" }],
      };
    }
    if (/(connect|integration|gmail|instagram|facebook|n8n|oauth)/.test(lower)) {
      const matching = connectionCenter.find((item) => lower.includes(item.slug.replace(/-/g, " "))) ?? connectionCenter.find((item) => lower.includes(item.slug)) ?? topPending;
      return {
        role: "assistant" as const,
        text: matching
          ? `The assistant backend is unavailable, so this is local fallback guidance. ${matching.name} is ${matching.status}. ${matching.detail} Next: ${matching.steps.slice(0, 2).join(" ")} If Gmail or social is the target, keep outbound flows disabled until credentials are real.`
          : "The connection center can guide front door, n8n, Gmail, social, and worker setup.",
        actions: [{ id: "goto-settings", label: "Open connection center" }],
      };
    }
    if (/(smoke|validate worker|validate setup|dry run)/.test(lower)) {
      return {
        role: "assistant" as const,
        text: "The safest next step is the workstation dry-run smoke. It rehearses manifest, mix, listening, render, and execution planning without touching a real project. If the smoke fails, open Operations first so you can recover runtime before trying live execution.",
        actions: [{ id: "run-worker-smoke", label: "Run worker smoke" }],
      };
    }
    if (/(drain|pause worker|maintenance)/.test(lower)) {
      return {
        role: "assistant" as const,
        text: "Use drain before maintenance so the worker stops claiming new tasks without killing in-flight state. After maintenance, resume polling and refresh Operations to confirm the queue is clear.",
        actions: [{ id: workstationRuntime?.runtime.drain_requested ? "resume-worker" : "drain-worker", label: workstationRuntime?.runtime.drain_requested ? "Resume worker" : "Drain worker" }],
      };
    }
    return {
      role: "assistant" as const,
      text: `The assistant backend is unavailable, so this is local fallback guidance. Right now the most useful next action is ${topPending ? `to work through ${topPending.name}` : "to review Operations for live state"}. If you are unsure, open Settings first, then Automation, then Operations.`,
      actions: [{ id: "goto-settings", label: "Open settings" }, { id: "goto-automation", label: "Open automation" }, { id: "goto-operations", label: "Open operations" }],
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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok) throw new Error(`concierge returned ${response.status}`);
      const payload = (await response.json()) as ConciergeResponse;
      setConciergeMode(payload.mode ?? "fallback");
      setConciergeTurns((current) => [...current, { role: "assistant" as const, text: payload.reply, actions: payload.actions }].slice(-8));
      setConciergeInput("");
    } catch (error) {
      setConciergeMode("fallback");
      setConciergeTurns((current) => [...current, buildFallbackConciergeReply(text)].slice(-8));
      setConciergeError(error instanceof Error ? error.message : "Unable to generate concierge response.");
    } finally {
      setConciergePending(false);
    }
  }

  return {
    conciergeInput,
    setConciergeInput,
    conciergeTurns,
    conciergeMode,
    conciergePending,
    conciergeError,
    suggestedPrompts,
    runConciergeAction,
    submitConciergePrompt,
  };
}
