# Leads and Inbox — Client Communication Automation

**Written for:** Studio Owner/Operator
**Prerequisite:** System running, [Daily Operations](02-daily-operations.md) read

---

## Overview

Two modules handle inbound client communication:

- **Lead Intake** — analyzes new leads from any source and drafts an initial reply
- **Inbox Triage** — reads your Gmail, classifies messages, and drafts responses for threads that need replies

Both work the same way: analyze, draft, queue for your approval. Nothing sends until you say yes.

---

## How Leads Arrive

Leads reach the system through any of these paths:

**n8n webhook** (most common) — your contact form, Squarespace form, or any web form posts to the lead-intake webhook. Configure the webhook URL after bootstrapping n8n.

**Email** — if inbox triage is running, emails classified as "lead" type automatically get both a classification and a lead reply draft.

**Manual submission** — you can post directly to the lead-intake endpoint:
```bash
curl -X POST http://localhost:8130/webhook/lead-intake \
  -H "Content-Type: application/json" \
  -d '{"source":"manual","raw_input":"..."}'
```

---

## What Lead Intake Does

When a lead arrives, the system:

1. **Normalizes the input** — extracts structured data from the raw text:
   - Artist/client name (if present)
   - Service type (mixing, mastering, production, recording, other)
   - Budget signal (any dollar amount mentioned, or qualitative hints)
   - Timeline (urgency language, specific dates)
   - Reference artists mentioned
   - Source (form/dm/email/referral)

2. **Scores fit and urgency** — two 0–100 scores:
   - **Fit score**: how well this lead matches your studio's apparent profile, based on service type, references, and style signals. Higher = closer match.
   - **Urgency score**: how time-sensitive this lead appears based on language cues ("need it ASAP", "deadline", specific dates). Higher = more urgent.

3. **Drafts a reply** — using your engineer voice setting, the system writes an initial reply that:
   - Acknowledges the specific details they mentioned
   - Positions your studio appropriately for the service type
   - Addresses any timeline or budget signals
   - Asks the most important follow-up question if one is needed

4. **Queues for approval** — the draft lands in Operations → Approval Queue → Lead Drafts

---

## The Lead Approval Card

Here's what you see in the queue:

**Header row:**
- Source icon (form, DM, email, referral)
- Arrival timestamp
- Urgency score badge (color-coded: green ≤40, yellow 40–70, red ≥70)

**Extracted details section:**
- All structured fields the system extracted
- Confidence indicators on ambiguous extractions

**Fit and urgency scores:**
- Fit: 0–100 with a brief explanation of what drove the score
- Urgency: 0–100 with key language that triggered the score

**The draft reply** — editable inline. Click any text to edit.

**Action buttons:** Approve / Edit + Approve / Reject

---

## Understanding the Scores

### Fit Score

The fit score is advisory. A low-fit lead doesn't get rejected automatically — you decide.

What drives the score:
- Service type match (a mastering lead when your profile emphasizes mixing = lower fit)
- Reference artists (are they in your stylistic wheelhouse?)
- Budget signals (does the budget range align with your typical pricing?)
- Professionalism signals in the message text

What doesn't affect the score:
- Whether the lead is a good person
- Whether you're booked
- Whether you feel like taking on a new client

**Use the score to triage, not to decide.** It's a time-saving tool that helps you spot high-priority items when you have a full queue.

### Urgency Score

Higher urgency = respond sooner. What drives it:
- Explicit deadline language ("need this by Friday", "release date is the 15th")
- Urgency language ("ASAP", "urgent")
- Specific timeline mentions
- Same-day or next-day asks

---

## Customizing Your Engineer Voice

The engineer voice setting (in Settings → Edit Setup → Identity) is the most important lever for draft quality.

**Good engineer voice:**
> *"Warm but efficient. I care about the artist behind the project, not just the service. I write like a human being, not a booking form. I'm honest about timelines, specific about what I need from clients, and always say something that shows I actually read what they sent."*

**Less effective:**
> *"Professional and concise."* — Too generic. Won't produce distinctive drafts.

**Test your voice:** Submit a test lead and read the draft. Does it sound like something you'd write? If not, revise the voice setting and submit another.

---

## Setting Up Gmail Labels for Inbox Triage

Before inbox triage can work, you need:
1. Gmail OAuth credentials (see [Integrations: Gmail Read-Only](12-integrations.md))
2. A Gmail label to watch

The default watched label is `NeedsReply`. To use it:

1. Open Gmail
2. Create a label named `NeedsReply` (or whatever you've set as `ALLOWED_INBOX_LABELS`)
3. When emails arrive that need replies, apply the label (manually, or with a Gmail filter)

The system polls for emails with your watched labels and classifies them automatically.

> ℹ️ **Multiple labels:** You can watch multiple labels. Set `ALLOWED_INBOX_LABELS=NeedsReply,Clients,Leads` to monitor all three. Separate with commas, no spaces.

---

## What Inbox Triage Does

When an email arrives in a watched label:

1. **Reads the email** — full text of the message and subject
2. **Classifies the message** — one of:
   - `payment` — invoice, payment confirmation, billing
   - `revision-request` — client asking for changes
   - `scheduling` — availability, booking, calendar
   - `lead` — new business inquiry
   - `noise` — automated, promotional, or non-actionable
   - `admin` — operational, internal, or reference
3. **Extracts urgency** — high / normal / low
4. **Drafts a reply** (for non-noise classifications) — appropriate to the message type
5. **Queues for approval**

---

## The Inbox Approval Card

**Classification badge** — color-coded by type (e.g., purple for revision-request, blue for scheduling)

**Urgency indicator** — shows the extracted urgency level

**Thread reference** — which Gmail thread this is from

**The draft reply** — editable inline

> ⚠️ **Noise classification** — emails classified as `noise` appear in the queue for awareness but have no draft reply. They're there so you don't miss them entirely, but there's nothing to approve. Dismiss them once you've seen them.

---

## After Approval: What Happens Next

When you approve a lead reply or inbox draft:

1. The job status moves from `awaiting-approval` to `approved`
2. The approved-send worker picks it up
3. The send worker independently re-verifies the approval state in the FSM
4. The email sends via your configured Gmail send credentials
5. The send is recorded in the audit log

> ℹ️ **Sending requires Gmail send credentials.** If `GMAIL_SEND_CLIENT_ID` / `GMAIL_SEND_CLIENT_SECRET` / `GMAIL_SEND_REFRESH_TOKEN` are not set, the approval is recorded but no email sends. You'd need to copy the approved text and send manually.

---

## Common Patterns and Edge Cases

**Lead comes in without a budget mention**
The fit score will be lower (less info), and the draft won't reference pricing. Add a pricing conversation point manually before approving if your studio requires budget qualification.

**Revision request in email also needs a DAW execution plan**
The inbox triage module handles the communication (classifies as `revision-request`, drafts acknowledgment). The actual revision parsing is handled by the revision-parser module separately — it needs the revision notes submitted through that channel. See [Guide: Revisions](07-revisions.md).

**Same email address sends multiple inquiries**
Each email is processed independently. The system doesn't merge threads into a contact record automatically. Your CRM in the Context tab maintains the project record.

**You receive an email you'd rather handle manually**
Don't apply the `NeedsReply` label (or whichever label you're watching). The system only sees emails you label explicitly.

**Draft quality is consistently poor for a specific type**
The most common fix is improving the engineer voice setting. For systematically wrong draft types (e.g., revision acknowledgments always missing something), the module settings may need tuning — see [Guide: Settings and Modules](11-settings-and-modules.md).
