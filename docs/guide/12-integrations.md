# Integrations — Connecting External Services

**Written for:** Studio Owner/Operator
**Time required:** 30–60 minutes per integration

---

## Overview

All integrations are optional. The system works without any of them — it just won't send emails, read Gmail, or post to social media. Configure integrations when you're ready to activate the relevant module.

---

## Gmail — Read-Only: Inbox Triage

This integration allows the inbox-triage module to read emails from your Gmail account. It is **read-only** — this credential cannot send anything.

> ℹ️ **Why a separate app?** Inbox triage only needs to read. We give it the minimum possible access. The credential that can send emails is a completely separate OAuth application.

### Setup Steps

**1. Create a Google Cloud project**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Name it something like "Studio AI — Gmail Intake"
4. Click Create

**2. Enable the Gmail API**
1. From your project, go to APIs & Services → Library
2. Search for "Gmail API"
3. Click Gmail API → Enable

**3. Configure the OAuth consent screen**
1. Go to APIs & Services → OAuth consent screen
2. Select "External" user type
3. Fill in: App name ("Studio AI Intake"), User support email, Developer contact email
4. Click Save and Continue
5. On Scopes page: Add scope → search for "gmail.readonly" → select it → Save
6. On Test Users page: Add your Gmail address as a test user
7. Click Save and Continue

**4. Create OAuth 2.0 credentials**
1. Go to APIs & Services → Credentials
2. Click Create Credentials → OAuth client ID
3. Application type: **Web application**
4. Name: "Studio AI Gmail Intake"
5. Authorized redirect URIs: Add `http://localhost:5678/rest/oauth2-credential/callback`
6. Click Create
7. Copy the **Client ID** and **Client Secret**

**5. Get the refresh token**

The easiest way is through n8n's credential flow:
1. Open `http://localhost:5678` (n8n)
2. Go to Settings → Credentials → New Credential
3. Select "Google OAuth2 API"
4. Paste your Client ID and Client Secret
5. Click Connect to Google and authorize with your Gmail account
6. n8n will store the token — you can extract it from the n8n database or use n8n to make API calls directly

Alternative: get the refresh token via Google's OAuth Playground (more complex — only needed if you want the token in `.env` directly).

**6. Add to environment**
In `infra/.env`:
```bash
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your-client-secret
GMAIL_REFRESH_TOKEN=1//your-refresh-token
ALLOWED_INBOX_LABELS=NeedsReply,Clients
```

Restart the inbox-triage service:
```bash
docker compose restart inbox-triage
```

**7. Set up your Gmail label**
1. Open Gmail
2. Click "More" in the left sidebar → "Create new label"
3. Name it exactly as you configured in `ALLOWED_INBOX_LABELS` (default: `NeedsReply`)
4. Apply this label to emails you want the system to triage

**8. Verify**
Submit a test email to yourself, apply the `NeedsReply` label, and wait 1–2 minutes. A draft reply should appear in the Operations approval queue.

---

## Gmail — Approved Send

This is the credential that actually sends emails. It has `gmail.send` scope and must be a completely separate OAuth application from the read-only triage credential.

> ⚠️ **This credential can send email from your account.** The system only uses it after a draft has been explicitly approved in the queue. It double-checks the approval state before sending. But it's a real send credential — treat it with appropriate care.

### Setup Steps

**1. Create a second Google Cloud project**
Create a separate project (e.g., "Studio AI — Gmail Send"). This keeps credentials clearly separated.

**2. Enable Gmail API** — same as above for the new project.

**3. Configure OAuth consent screen** — same flow, but scope should be `gmail.send` (not `gmail.readonly`).

**4. Create OAuth credentials** — same flow. Add the same redirect URI.

**5. Get the refresh token** — same flow as above.

**6. Add to environment**
```bash
GMAIL_SEND_CLIENT_ID=different-client-id.apps.googleusercontent.com
GMAIL_SEND_CLIENT_SECRET=GOCSPX-different-secret
GMAIL_SEND_REFRESH_TOKEN=1//different-refresh-token
```

Restart services:
```bash
docker compose restart inbox-triage openclaw
```

**7. Verify**
Approve a draft reply in the Operations queue and confirm the email sends.

---

## Instagram Publishing

Publishing to Instagram requires a Business or Creator account connected to a Facebook Page.

> ⚠️ **Personal Instagram accounts cannot use the Graph API.** You must convert to Business or Creator in Instagram settings.

### Prerequisites
- Instagram Business or Creator account
- Facebook Page (you must have a Facebook Page connected to your Instagram)
- Meta Developer account at [developers.facebook.com](https://developers.facebook.com)

### Setup Steps

**1. Create a Meta Developer App**
1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click "Create App"
3. Select "Other" type → "Business" use case
4. Name it "Studio AI Publishing" or similar
5. Complete the creation flow

**2. Add Instagram Basic Display API**
1. In your app: Add a Product → Instagram Basic Display
2. Add the redirect URI `https://your-domain.com/auth` (any HTTPS URL you control — you won't actually use it for redirects here)

**3. Generate a long-lived access token**
This requires a series of API calls to exchange a short-lived token for a long-lived one. The Meta documentation is the authoritative source — search for "Instagram Graph API — Get Access Token."

Or use a tool like Graph API Explorer at [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer) to obtain the token interactively.

Required permissions on the token:
- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`

**4. Add to environment**
```bash
INSTAGRAM_ACCESS_TOKEN=EAABsbCS...your-long-lived-token
```

Restart content-pipeline:
```bash
docker compose restart content-pipeline
```

**5. Verify**
Approve a social caption for Instagram in the Operations queue. Confirm the post appears on your Instagram account.

---

## Facebook Page Publishing

### Prerequisites
- Facebook Page (you must be an admin)
- The same Meta Developer App from the Instagram setup
- A Page Access Token (not your personal User token)

> ⚠️ **Page Access Token vs. User Access Token.** Publishing to a page requires a Page Access Token, not a personal User Token. These are different and obtained differently. Using the wrong one will result in permission errors.

### Setup Steps

**1. Get your Facebook Page ID**
1. Go to your Facebook Page
2. Settings → About → Page ID (numeric ID, e.g., `123456789012345`)

**2. Get a Page Access Token**
Using the Graph API Explorer:
1. Go to [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
2. Select your App and your Page
3. Generate a token with `pages_manage_posts` and `pages_read_engagement` permissions
4. Exchange for a long-lived Page Access Token using the token exchange flow

**3. Add to environment**
```bash
FACEBOOK_PAGE_ID=123456789012345
FACEBOOK_ACCESS_TOKEN=EAABsbCS...page-access-token
```

Restart content-pipeline:
```bash
docker compose restart content-pipeline
```

**4. Verify**
Approve a social caption for Facebook in the Operations queue. Confirm the post appears on your Page.

---

## External Alert Webhook

Connect alerts to Slack, Discord, or any POST endpoint.

### Slack

1. In Slack: Apps → Incoming Webhooks → Add to Slack
2. Choose a channel
3. Copy the webhook URL
4. Add to environment:
   ```bash
   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
   ```

### Discord

1. In your Discord server: Channel Settings → Integrations → Webhooks → New Webhook
2. Copy the webhook URL
3. Add to environment:
   ```bash
   ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```

### Make.com / Zapier / n8n

Use a custom webhook URL from your automation platform. The system sends a POST with a JSON body containing the alert type, message, and severity.

### Alert Payload Shape

```json
{
  "alert_type": "worker_offline",
  "severity": "high",
  "message": "Studio worker 'studio-mac' has not heartbeated in 5 minutes",
  "timestamp": "2026-03-22T14:30:00Z",
  "studio": "Hollow Sun Studio"
}
```

No restart needed — alert webhook is read at alert time, not at startup.

---

## n8n Workflow Webhooks

After running `bash scripts/bootstrap_n8n.sh`, your 8 starter workflows are imported and active. Each one exposes a webhook URL.

### Finding Your Webhook URLs

1. Open `http://localhost:5678` (n8n)
2. Click on any workflow
3. Click the Webhook trigger node
4. The "Test URL" is for testing; the "Production URL" is for live use

### URL Pattern

```
http://localhost:5678/webhook/{workflow-id}
```

For LAN access (other machines posting to your webhooks):
```
http://<control-plane-ip>:5678/webhook/{workflow-id}
```

### Connecting Your Contact Form

Point your contact form's "form submitted" action to the lead-intake webhook URL. Most form platforms (Typeform, Gravity Forms, Squarespace, Webflow) support custom POST webhooks.

Payload format expected by lead-intake:
```json
{
  "source": "form",
  "raw_input": "The complete form submission text, concatenated"
}
```

### Connecting External Triggers

Any external service that can make a POST request can trigger a workflow. Examples:
- SFTP file drop notification → session-source-import-stems webhook
- New email notification from your ISP → inbox-source-new-message webhook
- Content calendar reminder → content-source-new-brief webhook

---

## Troubleshooting Integrations

**Gmail not reading emails**
- Verify the `NeedsReply` label exists in Gmail (exact name match required)
- Check that `GMAIL_REFRESH_TOKEN` is not expired (tokens last ~6 months; regenerate if needed)
- Verify inbox-triage service is healthy: `curl http://localhost:8140/health`

**Gmail not sending after approval**
- Verify `GMAIL_SEND_*` variables are set (different from `GMAIL_*` intake variables)
- Check that the approval is genuinely in `approved` state in the audit log
- Verify openclaw service is healthy and can reach inbox-triage

**Instagram posts not appearing**
- Verify the access token has `instagram_content_publish` permission
- Long-lived tokens expire after 60 days — regenerate if it's been a while
- Check that the account is Business or Creator (not Personal)

**Facebook posts not appearing**
- Verify you're using a Page Access Token, not a User Token
- Check that the Page ID matches the page you're posting to
- Page tokens may need `pages_manage_posts` permission

**Webhook not triggering n8n**
- Verify `N8N_WEBHOOK_URL` matches the actual accessible URL for n8n
- In split-mode, this must be a LAN URL, not localhost
- Check n8n is running: `curl http://localhost:5678/healthz`
