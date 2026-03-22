import { useEffect, useRef, useState } from "react";

import type { ApprovalItem, WorkspaceSettings } from "../types";
import { API, OPERATOR_NAME_KEY, OPERATOR_TOKEN_KEY } from "./useDashboardData";

type UseApprovalQueueOptions = {
  approvals: ApprovalItem[];
  workspaceOperatorName?: string | null;
  refreshData: () => Promise<unknown>;
};

export function useApprovalQueue({ approvals, workspaceOperatorName, refreshData }: UseApprovalQueueOptions) {
  const [operatorName, setOperatorName] = useState("owner");
  const [operatorToken, setOperatorToken] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [approvedJobIds, setApprovedJobIds] = useState<string[]>([]);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [approvalArrivalMessage, setApprovalArrivalMessage] = useState<string | null>(null);
  const [operatorNameHydrated, setOperatorNameHydrated] = useState(false);
  const previousApprovalIdsRef = useRef<string[]>([]);

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
    if (!operatorNameHydrated && workspaceOperatorName) {
      setOperatorName(workspaceOperatorName);
      setOperatorNameHydrated(true);
    }
  }, [workspaceOperatorName, operatorNameHydrated]);

  useEffect(() => {
    setApprovedJobIds((current) => current.filter((jobId) => approvals.some((job) => job.id === jobId)));
  }, [approvals]);

  useEffect(() => {
    const currentIds = approvals.map((job) => job.id);
    if (!previousApprovalIdsRef.current.length) {
      previousApprovalIdsRef.current = currentIds;
      return;
    }
    const newApprovals = approvals.filter((job) => !previousApprovalIdsRef.current.includes(job.id));
    if (newApprovals.length) {
      setApprovalArrivalMessage(`New approval waiting: ${newApprovals[0].module} ${newApprovals[0].action}.`);
    }
    previousApprovalIdsRef.current = currentIds;
  }, [approvals]);

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
        body: decision === "reject" ? JSON.stringify({ reason: rejectReasons[jobId]?.trim() || "Rejected from Studio Brain UI" }) : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? `${decision} failed with ${response.status}`);
      }
      if (decision === "approve") {
        setApprovedJobIds((current) => (current.includes(jobId) ? current : [...current, jobId]));
      }
      setActionMessage(decision === "approve" ? `Approved ${jobId} and queued it for execution or routing.` : `Rejected ${jobId}.`);
      if (decision === "reject") setRejectReasons((current) => ({ ...current, [jobId]: "" }));
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

  function updateWorkspaceDraftOperator(setWorkspaceDraft: (updater: (current: WorkspaceSettings) => WorkspaceSettings) => void, nextName: string) {
    setOperatorName(nextName);
    setWorkspaceDraft((current) => ({ ...current, operator_name: nextName }));
  }

  return {
    operatorName,
    setOperatorName,
    operatorToken,
    setOperatorToken,
    actionMessage,
    actionError,
    pendingJobId,
    approvedJobIds,
    rejectReasons,
    setRejectReasons,
    approvalArrivalMessage,
    setApprovalArrivalMessage,
    handleApproval,
    updateWorkspaceDraftOperator,
  };
}
