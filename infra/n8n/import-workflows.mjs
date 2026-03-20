import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const statusPath = process.env.N8N_BOOTSTRAP_STATUS_PATH || "/home/node/.n8n/bootstrap-status.json";

function writeStatus(payload) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, JSON.stringify({
    updated_at: new Date().toISOString(),
    ...payload,
  }, null, 2));
}

function countExistingWorkflows() {
  const exportDir = mkdtempSync(join(tmpdir(), "n8n-workflow-export-"));

  try {
    execFileSync("n8n", ["export:workflow", "--backup", `--output=${exportDir}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return readdirSync(exportDir).filter((name) => name.endsWith(".json")).length;
  } catch (error) {
    const combined = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (combined.includes("No workflows found")) {
      return 0;
    }
    throw error;
  } finally {
    rmSync(exportDir, { force: true, recursive: true });
  }
}

const workflowCount = countExistingWorkflows();
if (workflowCount > 0) {
  console.log(`n8n already has ${workflowCount} workflow(s); skipping starter import.`);
  writeStatus({
    status: "skipped",
    workflow_count: workflowCount,
    detail: "n8n already contained workflows, so the starter import was skipped.",
  });
  process.exit(0);
}

execFileSync("n8n", ["import:workflow", "--separate", "--input=/workflows"], {
  stdio: "inherit",
});

writeStatus({
  status: "imported",
  workflow_count: readdirSync("/workflows").filter((name) => name.endsWith(".json")).length,
  detail: "Starter workflows were imported into an empty n8n database.",
});
