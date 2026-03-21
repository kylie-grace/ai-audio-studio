# Roadmap

## Now
- Keep turning the dashboard into a true control room: one front door, full service visibility, approvals, alerts, bootstrap state, service drilldowns, and operator actions without exposing novice users to raw service ports.
- Treat single-machine mode as the default deployment, but do not lock the product to Mac mini language. The operator should explicitly choose what host machine the stack is running on.
- Keep the studio worker optional capacity for DAW-side execution on the same machine or a remote worker node.
- Finish the legacy cutover so the old infra mental model is retired and the product is described consistently as `ai-audio-studio`.
- Preserve the current reality in docs: strong control-plane MVP, not yet novice-complete product.
- Document the network posture clearly: full-LAN IP access works immediately, hostname/TLS is the preferred operator path, and direct ports remain for engineering and worker traffic.

## Next
- Persist and surface richer project review packets so the control room can show latest candidate, QC posture, listening focus, and recommended operator action from one place.
- Keep extending the new workspace questionnaire into broader operator-safe settings coverage so normal setup does not require editing compose or env files beyond secrets and host wiring.
- Keep `workspace-settings` as the persisted source of truth for studio identity and operating preferences, then connect more modules to read from it.
- Deepen the module-tuning layer beyond the current eight service blocks so more runtime behavior is driven from persisted settings instead of env defaults.
- Keep expanding service drilldowns with more safe actions and more specific runtime detail per service.
- Expand OpenClaw from seeded rule packs into deeper prebuilt automations for lead intake, inbox drafting, content drafting, approvals, and escalation handoff.
- Add richer style-profile ingestion from pasted guidance, reference files, and watched folders so tone and brand context can be loaded without manual prompt engineering.
- Add alert fan-out through webhook, email, and n8n from one configuration surface.
- Improve first-run UX so a studio owner can get from fresh clone to usable dashboard, starter workflows, and baseline studio configuration with a clear guided path.
- Make hostname and certificate trust setup feel like a standard onboarding step rather than hidden ops knowledge.

## Productionizing
- Finish DAW adapters beyond dry run, with SoundFlow and ReaScript execution validated on a real studio Mac.
- Extend the DAW adapter plan to cover:
  - `Reaper` for general execution-first automation
  - `Pro Tools + SoundFlow` for editorial/mix revisions
  - `Wavelab` where scripting is viable for mastering-oriented execution and delivery prep
- Keep using the new DAW preview loop as the operator-safe staging path: workstation profile, session introspection, execution-plan preview, render plan, and QC/reference comparison.
- Add plugin/dependency awareness so planning and approval surfaces warn when the workstation is missing expected DAW/plugin prerequisites.
- Keep the worker cross-platform posture honest:
  - `macos` is the validated runtime path today
  - `windows` path translation, plugin scan roots, and workstation validation are now scaffolded
  - live Windows DAW runtime validation still needs a real workstation pass
- Add worker retries, lease expiry recovery, and failure escalation for long-running execution tasks.
- Add broader end-to-end tests that exercise Dockerized service interactions, not just unit helpers.
- Tighten HTTPS/LAN onboarding so trusting the local Caddy certificate is a first-run step, not hidden setup knowledge.
- Reduce the number of machine-local settings that must stay in env files to secrets, ports, tokens, and path wiring only.

## Dedicated Plans
- DAW execution, auto-mix, listening loop, and workstation onboarding are broken out in [DAW_EXECUTION_PLAN.md](/Users/kpsnyder/ai-audio-studio/docs/DAW_EXECUTION_PLAN.md).
- Cross-cutting product completion is tracked in [MASTER_PLAN.md](/Users/kpsnyder/ai-audio-studio/docs/MASTER_PLAN.md).
