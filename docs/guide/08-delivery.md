# Delivery — QC-Gated Client Packages

**Written for:** Studio Owner/Operator
**Requires:** DAW profile enabled, QC passing

---

## The Delivery Gate

Delivery is the final step in the production workflow, and it's the only step with a hard technical gate: **a render must pass QC before it can be packaged for delivery**.

This is not overridable. It's a design guarantee that prevents you from accidentally delivering a render with a true peak violation, clipping, or loudness that falls outside spec. If QC hasn't run — or if it ran and failed — the delivery packager will not proceed.

The gate means:
1. Render a file
2. Run QC (`POST /qc/run` or automatic trigger from worker execution)
3. QC passes → delivery packaging available
4. Approve delivery package → client-ready bundle created

---

## What the Delivery Packager Creates

When packaging is triggered (after QC pass), the system assembles:

**Audio files** — the QC-approved renders, organized by format if you provide multiple versions (WAV master, MP3 distribution, etc.)

**Session documentation** — a text document summarizing:
- Project details (client, service type, delivery date)
- File specifications (sample rate, bit depth, peak, LUFS)
- Notes on what was delivered and any relevant context

**QC report attachment** — the full QC pass report, embedded in the delivery folder so the client can see the measurements

**Metadata** — embedded in the audio files (artist, title, year, any additional fields from the project record)

### Folder Structure

```
client-project-delivery-2026-03-22/
├── audio/
│   ├── track-01-master.wav
│   ├── track-02-master.wav
│   └── ... (all approved renders)
├── docs/
│   ├── delivery-notes.txt
│   └── qc-report.json
└── README.txt  (basic instructions for the client)
```

---

## The Delivery Approval Card

The delivery package approval card in Operations shows:

**QC scores summary** — the measurements that passed (LUFS, true peak, phase, mono — all highlighted green)

**File inventory** — every file that will be in the delivery bundle, with format and size

**Client folder preview** — the directory structure as the client will receive it

**Metadata preview** — embedded metadata for the audio files

### What to Check Before Approving

- **Are all the right files present?** Compare against what the client is expecting.
- **Are the QC scores what you intended?** A passing LUFS of -9.1 is technically a pass (if your threshold allows it), but is it the right delivery target for this client?
- **Is the folder structure clean?** Remove any test files or intermediate renders that shouldn't go to the client.
- **Is the metadata correct?** Artist name, track title, and year should be accurate.

---

## After Approval

When you approve a delivery package:

1. The bundle is finalized at `DELIVERY_PATH/<project-slug>/<delivery-date>/`
2. A download link is generated and appears in the Context tab under Delivery History
3. The delivery is logged in the audit trail with your name and timestamp
4. An alert is available to send to the client (if notification workflow is configured)

The download link is a local path reference — it points to the file on your shared storage. Share the actual files with your client via your usual method (Google Drive, WeTransfer, Dropbox, etc.). The system doesn't upload anywhere automatically.

---

## Delivery History

All past deliveries are available in the **Context** tab:

1. Select the project from the project selector
2. Click "Delivery History"
3. You'll see all delivery packages for this project with:
   - Date and time
   - Which renders were included
   - QC scores
   - Who approved it

This is useful when a client comes back weeks later asking "what did you send me" or "was that the version with the revised bridge?" The delivery history has the complete record.

---

## Multiple Deliveries on the Same Project

Projects often have multiple delivery rounds (mix v1, mix v2 after revisions, final master). Each QC pass creates a new delivery package opportunity. Previous deliveries remain in history — they're never overwritten.

---

## Re-delivery

If a client needs the same files again (lost their download, format change request):

1. Find the delivery in Context → Delivery History
2. The files are still at the original delivery path
3. Share them directly from storage

If the client needs a different format (they have WAV but need MP3), that requires a new render → new QC run → new delivery package.

---

## Configuring Delivery Behavior

Delivery path is set in:
- `DELIVERY_PATH` in `infra/.env` (default: `/Volumes/StudioShare/deliveries`)
- Settings → Edit Setup → Shared Paths → Deliveries Path

Customize the folder naming convention and included documentation in the delivery packager module settings (Settings → Module Settings → Delivery Packager).
