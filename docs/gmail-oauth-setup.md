# Gmail OAuth Setup

## Overview

AI Audio Studio uses Gmail through `n8n` and environment-backed credentials. The relevant environment variables are:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

If you are using the split read/send setup from `infra/env.example`, you will also map the resulting refresh tokens into:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SEND_CLIENT_ID`
- `GMAIL_SEND_CLIENT_SECRET`
- `GMAIL_SEND_REFRESH_TOKEN`

## 1. Create a Google Cloud project

1. Open Google Cloud Console.
2. Create a new project for AI Audio Studio.
3. Make sure billing and organization policy allow OAuth app creation.

## 2. Enable the Gmail API

1. In `APIs & Services`, open `Library`.
2. Enable `Gmail API`.

## 3. Configure the OAuth consent screen

1. Open `APIs & Services` → `OAuth consent screen`.
2. Choose `External` unless you are limiting access to a managed Google Workspace.
3. Fill in app name, support email, and developer contact.
4. Add the Gmail scopes you actually need.

Recommended scope split:

- Read-only intake: `https://www.googleapis.com/auth/gmail.readonly`
- Approval-gated send: `https://www.googleapis.com/auth/gmail.send`

## 4. Create an OAuth client ID

1. Open `APIs & Services` → `Credentials`.
2. Create `OAuth client ID`.
3. Choose `Web application`.
4. Add the n8n redirect URI.

For local n8n, the redirect URI is typically:

- `https://studio-brain.local/n8n/rest/oauth2-credential/callback`

If you are running over raw LAN IP during setup, use the actual HTTPS front door you configured in Caddy.

## 5. Add client credentials to AI Audio Studio

Set the client values in your environment:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

If you are using the read/send split in `infra/env.example`, also copy those values into the Gmail-specific variables and store the refresh tokens there after the n8n authorization step.

## 6. Create Gmail credentials in n8n

1. Open the main control plane front door.
2. Navigate to `https://<your-front-door>/n8n`.
3. In n8n, open `Credentials`.
4. Create a Gmail OAuth2 credential for read-only intake.
5. Create a second Gmail OAuth2 credential for send if you want approval-routed replies.
6. Paste the OAuth client ID and secret.
7. Run the browser authorization flow.

## 7. Verification test

1. Confirm the Gmail credential shows as connected in n8n.
2. Re-open the AI Audio Studio `Settings` tab and verify the connection center no longer flags Gmail as incomplete.
3. Trigger the intake workflow with a known-safe inbox item.
4. If send credentials are configured, trigger an approval-routed draft send test only after confirming the approval queue is active.

## Common failures

- Redirect URI mismatch:
  The URI in Google Cloud must exactly match the n8n callback URL.
- Consent screen not published:
  External accounts cannot complete the flow until the app is in testing or published state.
- Wrong HTTPS origin:
  If the callback uses `studio-brain.local`, your Mac and browser must resolve and trust that host.
- Missing refresh token:
  Recreate the OAuth credential with offline access and force re-consent if Google does not issue a refresh token.
