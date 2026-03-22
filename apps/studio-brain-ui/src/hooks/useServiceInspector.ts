import { useEffect, useState } from "react";

import type { ServiceRecord, ServiceStatusPayload } from "../types";
import { fetchJson, serviceProxyBase, serviceStatusApi, frontDoorUrl } from "./useDashboardData";

export function useServiceInspector(services: ServiceRecord[]) {
  const [selectedServiceKey, setSelectedServiceKey] = useState<string>("project-state");
  const [serviceInspectorMessage, setServiceInspectorMessage] = useState<string | null>(null);
  const [serviceInspectorError, setServiceInspectorError] = useState<string | null>(null);
  const [selectedServiceStatus, setSelectedServiceStatus] = useState<ServiceStatusPayload | null>(null);
  const [selectedServiceStatusState, setSelectedServiceStatusState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const selectedService = services.find((service) => service.key === selectedServiceKey) ?? services[0] ?? null;
  const selectedServiceProxyUrl = selectedService ? `${frontDoorUrl}${serviceProxyBase[selectedService.key] ?? ""}` : frontDoorUrl;

  useEffect(() => {
    if (!selectedServiceKey && services[0]?.key) setSelectedServiceKey(services[0].key);
  }, [services, selectedServiceKey]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

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
        setSelectedServiceStatus({ error: error instanceof Error ? error.message : "Unable to load service status." });
        setSelectedServiceStatusState("error");
      }
    }

    void loadSelectedServiceStatus();
    timer = window.setInterval(() => void loadSelectedServiceStatus(), 30000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [selectedService]);

  async function copyServiceField(value: string, label: string) {
    setServiceInspectorMessage(null);
    setServiceInspectorError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is not available in this browser context.");
      await navigator.clipboard.writeText(value);
      setServiceInspectorMessage(`${label} copied.`);
    } catch (error) {
      setServiceInspectorError(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`);
    }
  }

  return {
    selectedServiceKey,
    setSelectedServiceKey,
    selectedService,
    selectedServiceStatus,
    selectedServiceStatusState,
    selectedServiceProxyUrl,
    serviceInspectorMessage,
    serviceInspectorError,
    copyServiceField,
  };
}
