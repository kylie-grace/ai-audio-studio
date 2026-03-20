import { execFileSync } from "node:child_process";

function exportWorkflows() {
  try {
    const output = execFileSync("n8n", ["export:workflow", "--all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (error) {
    const combined = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (combined.includes("No workflows found")) {
      return [];
    }
    throw error;
  }
}

const workflows = exportWorkflows();
if (workflows.length > 0) {
  console.log(`n8n already has ${workflows.length} workflow(s); skipping starter import.`);
  process.exit(0);
}

execFileSync("n8n", ["import:workflow", "--separate", "--input=/workflows"], {
  stdio: "inherit",
});
