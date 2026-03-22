import { useMemo, useState } from "react";

import type { DashboardData } from "../types";
import { API } from "./useDashboardData";

type UseAutomationStateOptions = {
  data: DashboardData;
  refreshData: () => Promise<unknown>;
};

export function useAutomationState({ data, refreshData }: UseAutomationStateOptions) {
  const [starterPackPending, setStarterPackPending] = useState<string | null>(null);
  const [starterPackMessage, setStarterPackMessage] = useState<string | null>(null);
  const [starterPackError, setStarterPackError] = useState<string | null>(null);
  const [expandedStarterPackSlug, setExpandedStarterPackSlug] = useState<string | null>(null);
  const [maintenancePending, setMaintenancePending] = useState<"reseed" | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [showAllRules, setShowAllRules] = useState(false);

  const enabledRuleCount = data.rules.filter((rule) => rule.enabled).length;
  const visibleRules = showAllRules ? data.rules : data.rules.slice(0, 10);
  const activeStarterPack = data.starterPacks.find(
    (pack) => pack.rule_slugs.length && pack.rule_slugs.every((slug) => data.rules.some((rule) => rule.slug === slug && rule.enabled)),
  );
  const credentialWarnings = useMemo(() => {
    const settings = data.workspace.settings;
    const warnings: Array<{ id: string; title: string; detail: string }> = [];
    if (!settings.integrations.gmail_readonly || !settings.integrations.gmail_send) {
      warnings.push({
        id: "gmail",
        title: "Gmail automation credentials are incomplete",
        detail: "Inbox read/send flows are scaffolded, but one or more Gmail integration flags are still off in workspace settings.",
      });
    }
    if (!settings.integrations.instagram && !settings.integrations.facebook) {
      warnings.push({
        id: "social",
        title: "Publishing credentials are not configured",
        detail: "Content drafting is available, but social publishing should remain operator-reviewed until Instagram or Facebook credentials are wired.",
      });
    }
    if (data.services.some((service) => service.key === "ollama" && service.state !== "healthy")) {
      warnings.push({
        id: "llm-runtime",
        title: "LLM runtime is not healthy",
        detail: "Drafting and assistant flows will fall back or degrade while the model runtime is unavailable.",
      });
    }
    const llmProvider = (data.workerHealth?.llm_provider as string | undefined) ?? "ollama";
    const llmKeyOk = (data.workerHealth?.llm_api_key_configured as boolean | undefined) ?? true;
    if (llmProvider !== "ollama" && !llmKeyOk) {
      warnings.push({
        id: "llm-api-key",
        title: `LLM provider is "${llmProvider}" but no API key is configured`,
        detail: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the worker environment to enable cloud LLM flows.",
      });
    }
    return warnings;
  }, [data]);

  async function applyStarterPack(slug: string) {
    if (!window.confirm(`Apply ${slug} to the live automation posture? This can disable rules outside the selected pack.`)) return;
    setStarterPackPending(slug);
    setStarterPackMessage(null);
    setStarterPackError(null);
    try {
      const response = await fetch(`${API.openclaw}/starter-packs/${slug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ exclusive: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Starter pack apply failed with ${response.status}`);
      }
      const payload = (await response.json()) as { applied_pack?: { name?: string }; active_rule_count?: number };
      setStarterPackMessage(`${payload.applied_pack?.name ?? slug} applied. ${payload.active_rule_count ?? 0} rule(s) are now active.`);
      await refreshData();
    } catch (error) {
      setStarterPackError(error instanceof Error ? error.message : "Unable to apply starter pack");
    } finally {
      setStarterPackPending(null);
    }
  }

  async function reseedAutomationDefaults() {
    if (!window.confirm("Reseed the default automation posture? This can overwrite the current live rule mix.")) return;
    setMaintenancePending("reseed");
    setMaintenanceMessage(null);
    setMaintenanceError(null);
    try {
      const response = await fetch(`${API.openclaw}/bootstrap/defaults`, { method: "POST", headers: { Accept: "application/json" } });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `Bootstrap reseed failed with ${response.status}`);
      }
      const payload = (await response.json()) as { seeded_rule_count?: number; starter_pack_count?: number; playbook_count?: number };
      setMaintenanceMessage(`Reseeded ${payload.seeded_rule_count ?? 0} rules, ${payload.starter_pack_count ?? 0} starter packs, and ${payload.playbook_count ?? 0} playbooks.`);
      await refreshData();
    } catch (error) {
      setMaintenanceError(error instanceof Error ? error.message : "Unable to reseed automation defaults");
    } finally {
      setMaintenancePending(null);
    }
  }

  return {
    enabledRuleCount,
    visibleRules,
    activeStarterPack,
    starterPackPending,
    starterPackMessage,
    starterPackError,
    expandedStarterPackSlug,
    setExpandedStarterPackSlug,
    maintenancePending,
    maintenanceMessage,
    maintenanceError,
    showAllRules,
    setShowAllRules,
    applyStarterPack,
    reseedAutomationDefaults,
    credentialWarnings,
  };
}
