# Roadmap

## Now
- Keep turning the dashboard into a true control room: one front door, full service visibility, approvals, alerts, bootstrap state, and operator actions without exposing novice users to raw service ports.
- Treat single-machine mode as the default deployment. The studio worker remains optional capacity for DAW-side execution on the same Mac or a second Mac.
- Finish the legacy cutover so the old infra mental model is retired and the product is described consistently as `ai-audio-studio`.
- Preserve the current reality in docs: strong control-plane MVP, not yet novice-complete product.

## Next
- Extend the new workspace questionnaire into broader operator-safe settings coverage so normal setup does not require editing compose or env files beyond secrets and host wiring.
- Keep `workspace-settings` as the persisted source of truth for studio identity and operating preferences, then connect more modules to read from it.
- Expand OpenClaw from seeded rule packs into deeper prebuilt automations for lead intake, inbox drafting, content drafting, approvals, and escalation handoff.
- Add richer style-profile ingestion from pasted guidance, reference files, and watched folders so tone and brand context can be loaded without manual prompt engineering.
- Add alert fan-out through webhook, email, and n8n from one configuration surface.
- Expose more operator-safe settings in the control room so service behavior can be tuned without editing compose files.
- Improve first-run UX so a studio owner can get from fresh clone to usable dashboard, starter workflows, and baseline studio configuration with a clear guided path.

## Productionizing
- Finish DAW adapters beyond dry run, with SoundFlow and ReaScript execution validated on a real studio Mac.
- Add worker retries, lease expiry recovery, and failure escalation for long-running execution tasks.
- Add broader end-to-end tests that exercise Dockerized service interactions, not just unit helpers.
- Tighten HTTPS/LAN onboarding so trusting the local Caddy certificate is a first-run step, not hidden setup knowledge.
- Reduce the number of machine-local settings that must stay in env files to secrets, ports, tokens, and path wiring only.
