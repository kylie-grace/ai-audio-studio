# The Approval Workflow — Everything That Needs Your Yes

**Written for:** Studio Owner/Operator
**Prerequisite:** [Daily Operations](02-daily-operations.md)

---

## Why Everything Goes Through Approval

The system drafts, analyzes, and prepares — but it never takes a consequential action on your behalf without your explicit agreement. This isn't a technical limitation; it's a design commitment.

Emails represent your professional reputation. DAW operations change your client's audio. Social content is your public voice. Delivery packages are contractual deliverables. None of these should happen automatically, no matter how good the AI draft is.

The approval queue is the single place where you exercise that control. Every item there is something the system wants to do and is waiting to find out if you agree.

---

## The Safety Guarantee

A few things are unconditionally true:

1. **Closing the browser doesn't approve anything.** Items wait in the queue indefinitely (up to the 48-hour expiry limit).
2. **Expiring a draft never sends it.** If a draft hits the expiry limit, it's removed from the queue and logged — nothing is sent.
3. **Rejection is permanent.** Rejected items do not re-queue automatically. If you reject a lead reply and then change your mind, you'd need to write a reply manually or re-submit the lead.
4. **Two independent checks for outbound email.** The approval FSM (Finite State Machine) records your approval. The approved-send worker independently re-verifies that approval before sending. If the FSM and the send worker disagree, nothing sends.
5. **All approvals are recorded.** Every approval and rejection is in the audit log with your name and a timestamp.

---

## Approval Queue Tab: Lead Drafts

**Triggered by:** New lead from form, DM, email, or referral

### What the Card Shows

**Source and arrival time** — where the lead came from and when

**Extracted lead details:**
- Artist/client name (extracted or inferred)
- Service type (mixing, mastering, production, etc.)
- Budget signal (extracted number or range if mentioned)
- Timeline (urgency if mentioned)
- Reference artists mentioned
- Fit score (0–100): how well this lead matches your studio's profile
- Urgency score (0–100): how time-sensitive the lead appears to be

**The draft reply** — written in your engineer voice, addressing the specific details of this lead. It acknowledges what they said, positions your studio, and asks any necessary follow-up questions.

### What to Check Before Approving

- Does the draft accurately reflect what the lead asked?
- Is the tone right for this particular client?
- Are the budget/timeline assumptions correct?
- Is there anything in the lead that should affect the reply that the system might have missed?

### Making the Decision

**Approve as-is** — Click Approve. The reply goes to the approved-send queue.

**Edit then approve** — Click into the draft text. Edit any line you want to change. Click Approve. Your edits are recorded.

**Reject** — The lead stays in your CRM as a lead record, but no reply is sent. You can still reply manually.

> ℹ️ **Fit score is advisory, not a gate.** A fit score of 30 doesn't block the approval — it's information for you. You might want to reply to a low-fit lead to maintain the relationship, or you might reject a high-fit lead because you're booked. The score is there to help you triage, not decide.

---

## Approval Queue Tab: Inbox Drafts

**Triggered by:** Email arriving in your watched Gmail label (default: "NeedsReply")

### What the Card Shows

**Email classification:**
- `payment` — client asking about invoices, payment status
- `revision-request` — client requesting changes
- `scheduling` — availability questions, booking requests
- `lead` — new business inquiry arriving via email
- `noise` — auto-generated, promotional, or non-actionable
- `admin` — internal, operational emails

**Urgency level:** high / normal / low — extracted from content and context clues

**Thread context** — which Gmail thread this belongs to

**The draft reply** — written in your voice, appropriate to the classification

### What to Check Before Approving

- Is the classification correct? (misclassified emails produce off-target drafts)
- Does the draft address the actual question or concern?
- For revision requests: is the draft acknowledging the specifics, not just the category?
- For payment emails: are the numbers mentioned accurate?

### Making the Decision

Same as lead drafts: approve, edit-then-approve, or reject.

> ⚠️ **"Noise" classification** — the system drafts no reply for noise-classified emails. They still appear in the queue for awareness, but there's nothing to approve. Dismiss them once you've seen them.

---

## Approval Queue Tab: Social Content

**Triggered by:** Content brief submitted to the content pipeline via n8n or manually

### What the Card Shows

**Platform tabs** — one tab per platform included in the brief: Instagram, Facebook, Threads, LinkedIn

For each platform:
- Caption text (respects platform character limits)
- Hashtag pool (deterministically generated, style-matched)
- Character count indicator (shows usage vs. platform limit)
- Asset manifest — files to include with the post (images, video)

### What to Check Before Approving

- Does the caption capture the right message and energy?
- Are the hashtags relevant, or is the pool pulling in unrelated tags?
- Is the tone consistent with your studio's public voice?
- For Instagram specifically: does the caption work with the image you're pairing it with?

### Making the Decision

Approvals are per-platform. You can approve Instagram and hold Facebook independently. This lets you sequence posts, or skip a platform for a specific piece of content.

> ℹ️ **Posting requires tokens.** Approving a social caption queues it for posting. Actual posting requires `INSTAGRAM_ACCESS_TOKEN` and/or `FACEBOOK_ACCESS_TOKEN` to be configured. If tokens aren't set, the approved caption is logged but not posted — you'd need to copy and post manually.

---

## Approval Queue Tab: Session Plans

**Triggered by:** Stems landing in the watched folder or manually submitted to session-prep
**Requires:** DAW profile enabled (`--profile daw`)

### What the Card Shows

**Stem inventory:**
- Total file count
- Files by format (WAV, AIFF, etc.)
- Sample rate distribution
- Bit depth distribution
- Validation issues (sample rate mismatches, naming problems, truncated files)

**Session manifest summary:**
- Proposed session folder structure
- How files will be organized
- Any issues flagged (files that won't work without conversion or renaming)

### What to Check Before Approving

- Are all expected stems present? (check against what the client said they were sending)
- Are the validation issues blockers? (a sample rate mismatch matters; a naming preference usually doesn't)
- Does the proposed organization make sense for this project?

### Making the Decision

**Approve** — The worker organizes the stems into the session structure and writes the manifest.

**Reject** — If there are blocking issues (missing stems, critical format problems), reject and communicate with the client before re-submitting.

> ℹ️ **Flagged issues don't block approval.** You can approve a session prep even when issues are flagged. The flag is information — your engineering judgment determines if it matters for this project.

---

## Approval Queue Tab: Execution Plans

**Triggered by:** Revision parsing completion or mix plan completion
**Requires:** DAW profile enabled, worker configured with `STUDIO_WORKER_DRY_RUN_DAW=false`

### What the Card Shows

**Change summary** — a plain-English list of what will execute in the DAW:
- "Bring down vocal bus by 2dB from bar 24"
- "Add high-shelf boost at 8kHz on guitar 1"
- "Trim silence at end of track 7"

**Confidence scores** — for each parsed change, a confidence level:
- **High** — unambiguous instruction, directly mapped to a DAW parameter
- **Medium** — interpreted instruction, review the mapping
- **Low** — ambiguous language, the system made a best guess — always review these

**Skipped items** — changes the parser couldn't map (logged as skipped, never executed)

**DAW target** — which application will execute (Reaper/ReaScript, Pro Tools/SoundFlow)

**Preview of generated script** — the actual ReaScript or SoundFlow code that will run

### What to Check Before Approving

- Is every change on the list something you want to happen?
- Are the medium and low confidence mappings correct interpretations?
- Are there changes missing that were in the revision notes?
- Do you understand what the generated script will do? (If not, ask the concierge to explain a specific change)

### Making the Decision

**Approve** — The worker executes the changes in the DAW on your studio machine. After execution, audio QC runs on the output.

**Edit** — You can remove specific changes from the list before approving. Removed changes are skipped (not executed) but logged.

**Reject** — Nothing executes. You can re-submit revised notes or handle the revisions manually.

> ⚠️ **Execution is irreversible without your backup.** The system executes on a working copy, but "undo" requires your DAW's native undo. If you're uncertain about an execution plan, approve a smaller subset first.

---

## Approval Queue Tab: Delivery Packages

**Triggered by:** Audio QC pass + delivery packager completing assembly
**Requires:** DAW profile enabled

### What the Card Shows

**QC scores** — the measurements that cleared the gate (LUFS, true peak, pass/fail per metric)

**File inventory** — every file in the delivery package:
- Rendered audio files
- Session documentation
- QC report attachment

**Client folder structure** — how the delivery is organized from the client's perspective

**Metadata summary** — embedded metadata in the audio files

### What to Check Before Approving

- Are all expected files present?
- Do the QC scores match your delivery targets?
- Is the folder structure clean and professional?
- Is the metadata correct (artist name, track titles, year)?

### Making the Decision

**Approve** — The delivery package is finalized and a download link is generated. It appears in the Context tab under Delivery History.

**Reject** — If something is missing or wrong, reject and investigate the QC or rendering step.

> ℹ️ **The QC gate cannot be bypassed.** Delivery packages can only be created from renders that passed QC. If a render fails QC, you'll see the failure in the QC section, not in Delivery Packages. Fix the render and re-run QC.

---

## Working Efficiently

A few patterns that make the queue faster to work:

**Review in order of urgency** — Leads from new clients and revision execution plans tend to be most time-sensitive. Inbox drafts for scheduling can usually wait a few hours.

**Edit rather than reject when possible** — If a draft is 90% right, editing it takes 30 seconds. Rejecting it and handling the communication manually takes longer.

**Use the concierge for context** — If a draft references something you don't have context for (a specific client email thread, a revision note), ask the concierge about it. It can often surface the relevant context.

**Batch approvals by type** — If you have 5 social captions all from the same brief, review them in sequence to maintain consistency.

---

## The Audit Log

Every action you take in the approval queue is recorded permanently. The audit log in the Operations tab shows:

- Actor (your name as configured in workspace settings)
- Action (approved/rejected/edited)
- Timestamp
- What was approved (job ID, type, brief description)
- The text of the draft that was approved (for email and social)

You can filter the audit log by date range, job ID, actor, and action type. Use it to verify what happened, who approved what, and when.
