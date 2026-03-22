# n8n Workflow Reference

**Written for:** Studio Owner (advanced), Developer Contributor
**Purpose:** What each starter workflow does, webhook URLs, and customization

---

## The Bootstrap Process

Starter workflows are imported once with:

```bash
bash scripts/bootstrap_n8n.sh infra/.env
```

**Idempotent:** Running this multiple times is safe. The script detects existing workflows and skips them. If you accidentally delete a workflow and want to re-import it, delete the corresponding record from n8n and re-run bootstrap.

**What happens during bootstrap:**
1. The script reads your n8n URL and credentials from the env file
2. It iterates over workflow JSON files in `infra/n8n/workflows/`
3. For each: checks if a workflow with that name already exists
4. If not: imports it and activates it (except credential-gated workflows)
5. Credential-gated outbound workflows (Gmail send, social posting) stay **inactive** until real credentials are configured

---

## Workflow Directory

### Event Source Workflows

These workflows handle inbound events and route them to the appropriate services.

---

#### `lead-source-new-lead.json`

**Purpose:** Receives new lead form submissions and routes them to lead-intake for normalization and reply drafting.

**Webhook URL:** `http://localhost:5678/webhook/lead-source-new-lead`

**Active by default:** Yes

**Credential requirements:** None (receive-only)

**Trigger:** POST from contact form, CRM, or any system that sends new lead information

**Expected payload:**
```json
{
  "source": "form",
  "raw_input": "The complete text of the submission"
}
```

**What it does:**
1. Receives the webhook payload
2. Normalizes it into a standard job envelope
3. POSTs to `openclaw /dispatch/by-trigger`
4. OpenClaw routes to lead-intake

**To connect your contact form:** Point the form's "on submit" webhook to this URL.

---

#### `inbox-source-new-message.json`

**Purpose:** Triggered when a new email needs triage. Routes to inbox-triage.

**Webhook URL:** `http://localhost:5678/webhook/inbox-source-new-message`

**Active by default:** Yes

**Credential requirements:** Requires Gmail read-only credentials configured in n8n

**Trigger:** New email arriving in watched labels, or external Gmail notification webhook

**Expected payload:**
```json
{
  "thread_id": "Gmail thread ID",
  "message_id": "Gmail message ID",
  "subject": "Email subject",
  "body": "Email body text"
}
```

**What it does:**
1. Receives the message reference
2. Routes to inbox-triage for classification and draft generation
3. Triage result queues for approval

---

#### `content-source-new-brief.json`

**Purpose:** Receives content briefs and routes them to the content pipeline for caption drafting.

**Webhook URL:** `http://localhost:5678/webhook/content-source-new-brief`

**Active by default:** Yes

**Credential requirements:** None (receive-only)

**Expected payload:**
```json
{
  "brief": "Description of the content",
  "platforms": ["instagram", "facebook", "threads"],
  "assets": ["/path/to/image.jpg"]
}
```

---

#### `session-source-import-stems.json`

**Purpose:** Triggered when stems are deposited in the watched folder or via notification. Routes to session-prep.

**Webhook URL:** `http://localhost:5678/webhook/session-source-import-stems`

**Active by default:** Yes

**Credential requirements:** None (receive-only)

**Expected payload:**
```json
{
  "project_slug": "artist-project-id",
  "stems_path": "/Volumes/StudioShare/incoming-stems/artist-folder"
}
```

---

#### `revision-source-notes-received.json`

**Purpose:** Receives client revision notes and routes them to revision-parser.

**Webhook URL:** `http://localhost:5678/webhook/revision-source-notes-received`

**Active by default:** Yes

**Credential requirements:** None (receive-only)

**Expected payload:**
```json
{
  "project_slug": "artist-project-id",
  "raw_notes": "Full text of revision notes"
}
```

---

#### `qc-source-qc-pass.json`

**Purpose:** Triggered after an audio QC pass. Routes to the appropriate next action (delivery packaging, or back to the operator for listening review).

**Webhook URL:** `http://localhost:5678/webhook/qc-source-qc-pass`

**Active by default:** Yes

**Credential requirements:** None (internal routing only)

**Triggered by:** Audio QC service reporting a pass result

---

### Operator Support Workflows

These workflows support ongoing operations rather than inbound events.

---

#### `alerts-runtime-digest.json`

**Purpose:** Sends a periodic digest of active runtime alerts to configured alert destinations.

**Active by default:** Yes (internal routing, no external credential needed to run)

**Schedule:** Configurable (default: hourly during active hours)

**What it does:** Queries project-state for active alerts and formats a summary. Sends to alert webhook URL or email if configured.

---

#### `control-room-status-digest.json`

**Purpose:** Provides a pull endpoint for workspace status snapshots. Used by the Control Room Assistant to build its context.

**Active by default:** Yes

**Webhook URL:** `http://localhost:5678/webhook/control-room-status-digest`

**Method:** GET or POST

**What it returns:** Current approval queue count, worker health summary, active alert count, integration status.

---

## Finding Your Webhook URLs

After bootstrap:

1. Open `http://localhost:5678`
2. Click on any workflow
3. Click the Webhook trigger node
4. Use the **Production URL** (not the Test URL) for live connections

### URL Pattern

Local: `http://localhost:5678/webhook/{workflow-name}`

LAN: `http://<control-plane-ip>:5678/webhook/{workflow-name}`

HTTPS: `https://n8n.studio-brain.local/webhook/{workflow-name}`

> ⚠️ **Use the LAN or HTTPS URL for external webhooks.** `localhost` only works from the same machine. If your contact form server is external, it can't reach `localhost:5678`.

---

## Connecting an External Contact Form

Most website form builders (Typeform, Squarespace, Webflow, Gravity Forms) support webhook on submit.

**Configuration:**
- Webhook URL: `http://<your-mac-ip>:5678/webhook/lead-source-new-lead`
- Method: POST
- Format: JSON

**Mapping form fields to the payload:**

Your form may have separate fields (name, email, service, budget, message). Map them to the expected format:

If your form platform supports field mapping to a JSON body:
```json
{
  "source": "form",
  "raw_input": "Name: {{name}}\nEmail: {{email}}\nService: {{service}}\nBudget: {{budget}}\nMessage: {{message}}"
}
```

If your form sends raw JSON and you can't customize it, n8n can transform it. Add a "Set" node between the Webhook trigger and the HTTP Request node to restructure the payload.

---

## Adding Custom Workflows

To add a workflow beyond the 8 starters:

1. Create the workflow in n8n's visual editor
2. Connect it to an external trigger (form, calendar, SFTP, etc.)
3. Terminate it at OpenClaw's dispatch endpoint:
   ```
   POST http://openclaw:8100/dispatch/by-trigger
   Body: { "trigger": "your-trigger-name", "payload": {...} }
   ```
4. Add an orchestration rule in OpenClaw that routes `your-trigger-name` to the appropriate module

---

## Credential Setup in n8n

For workflows requiring external credentials (Gmail, Instagram, etc.):

1. Open `http://localhost:5678`
2. Go to Settings (⚙️) → Credentials
3. Click "Add Credential"
4. Select the credential type (Google OAuth2 API, Instagram Graph API, etc.)
5. Enter your OAuth client ID and secret
6. Click "Connect" and complete the OAuth flow

After credentials are configured:
- Go to the relevant workflow (inbox-source-new-message for Gmail, etc.)
- Open the node that uses the credential
- Select the credential from the dropdown
- Save and activate the workflow

**Activation state:** Workflows with valid credentials can be set to Active. Inactive workflows still exist but don't process events.
