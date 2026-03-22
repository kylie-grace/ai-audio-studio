import { useMemo, useState } from "react";

import type { AlertActionResponse, RuntimeAlert } from "../types";
import { API } from "./useDashboardData";

type UseAlertActionsOptions = {
  alerts: RuntimeAlert[];
  refreshData: () => Promise<unknown>;
};

export function useAlertActions({ alerts, refreshData }: UseAlertActionsOptions) {
  const [alertActionPending, setAlertActionPending] = useState<"test" | "dispatch" | null>(null);
  const [alertActionMessage, setAlertActionMessage] = useState<string | null>(null);
  const [alertActionError, setAlertActionError] = useState<string | null>(null);
  const [alertFilters, setAlertFilters] = useState<{ severity?: string }>({});
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        if (dismissedAlerts.includes(alert.slug)) return false;
        if (alertFilters.severity && alert.severity !== alertFilters.severity) return false;
        return true;
      }),
    [alerts, alertFilters, dismissedAlerts],
  );

  function dismissAlert(slug: string) {
    setDismissedAlerts((current) => (current.includes(slug) ? current : [...current, slug]));
  }

  async function runAlertAction(action: "test" | "dispatch") {
    setAlertActionPending(action);
    setAlertActionMessage(null);
    setAlertActionError(null);
    try {
      const response = await fetch(action === "test" ? `${API.openclaw}/alerts/test` : `${API.openclaw}/alerts/dispatch-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: action === "test" ? JSON.stringify({ slug: "control-room-test", severity: "warn", detail: "Manual test alert triggered from the Studio Brain control room." }) : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `${action} alert action failed with ${response.status}`);
      }
      const payload = (await response.json()) as AlertActionResponse;
      const deliveries = payload.deliveries ?? (payload.results ?? []).flatMap((result) => result.deliveries ?? []);
      setAlertActionMessage(action === "test" ? `Test alert executed across ${deliveries.length} channel result(s).` : `Dispatched ${payload.dispatched_count ?? 0} active alert(s).`);
      await refreshData();
    } catch (error) {
      setAlertActionError(error instanceof Error ? error.message : "Unable to execute alert action");
    } finally {
      setAlertActionPending(null);
    }
  }

  return {
    alertActionPending,
    alertActionMessage,
    alertActionError,
    filteredAlerts,
    dismissAlert,
    setAlertFilters,
    runAlertAction,
  };
}
