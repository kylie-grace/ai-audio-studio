# Roadmap

## Current Build Blocks
- Finish the operator-facing dashboard so approvals, failures, and worker controls are actionable from one screen.
- Expand OpenClaw from seeded routing rules into deeper prebuilt execution flows for lead intake, inbox drafting, content drafting, and approvals.
- Add DAW-side adapters beyond dry run, with SoundFlow and ReaScript execution paths validated on a real studio Mac.
- Keep single-machine mode as the default deployment and treat the remote worker as optional capacity, not a requirement.

## Next Platform Features
- Add alert connectors for dashboard failures, stuck jobs, failed worker tasks, and approval backlog thresholds.
- Support webhook, email, and n8n-driven alert fan-out from one configuration surface.
- Add richer style-profile ingestion from pasted guidance, reference files, and watched folders.
- Ship curated workflow packs so novice operators can bootstrap without writing rules.

## Hardening
- Add authenticated operator actions in the dashboard for approval and rejection flows.
- Add lease expiry recovery, retries, and failure escalation for worker tasks.
- Add broader end-to-end tests that exercise Dockerized service interactions, not just unit helpers.
- Add HTTPS/LAN trust setup documentation for local network deployments.
