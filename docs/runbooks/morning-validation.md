# Runbook: Morning Validation

## Purpose

Use this checklist for the first hands-on validation pass after the overnight build work.

## Front door

1. Open the control room at `http://<control-plane-ip>:3000` or the preferred HTTPS front door.
2. Confirm the dashboard loads without blank sections or proxy failures.
3. Confirm the new `Control Room Chat` and `Remaining Build Gaps` panels are visible on `Overview`.

## Concierge

Ask these prompts in the control room chat:
- `what is still missing`
- `how do i finish gmail`
- `run worker smoke`
- `what storage context do you know about`
- `show me delivery history`

Expected behavior:
- the concierge responds with grounded status from the live stack
- action buttons appear for safe next steps
- worker smoke and navigation actions execute from the chat surface

## Settings and integrations

1. Open `Settings`.
2. Review the `Connection Center` cards.
3. Confirm the cards show:
- front door
- n8n
- Gmail intake
- Gmail send
- Instagram
- Facebook
- worker runtime

4. Confirm the setup editor still saves workspace settings correctly.

## Worker validation

1. Open `Operations`.
2. In `Setup Validation`, run `Refresh validation`.
3. Run `Run dry-run smoke`.
4. Drain the worker.
5. Resume the worker.

Expected behavior:
- smoke returns a review or pass result with blockers/warnings
- drain flips runtime state without crashing the worker
- resume restores normal polling

## Tasks and stop control

1. If a claimed worker task exists, confirm the task feed shows `stop` instead of generic `cancel`.
2. Confirm queued tasks still show `cancel`.
3. Confirm failed tasks still show `requeue`.

## Project review

1. Open `Context`.
2. Select a project with artifacts.
3. Confirm these surfaces render:
- artifact history
- project review stack
- delivery history
- artifact preview
- artifact download links

4. Preview at least one artifact and download at least one delivery-facing artifact.

## Automation

1. Open `Automation`.
2. Confirm starter packs and playbooks still load.
3. Run `reseed defaults` only if you want to validate bootstrap maintenance behavior.

## What still requires real-world setup

These cannot be fully proven until credentials or target runtimes exist:
- Gmail OAuth activation
- Meta publishing activation
- live SoundFlow/Pro Tools execution
- live WaveLab execution
- live Windows worker validation
