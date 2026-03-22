# HTTPS and LAN Access

**Written for:** Studio Owner
**Purpose:** Access the dashboard from any device on your network with clean HTTPS

---

## Overview

The stack includes Caddy as an HTTPS reverse proxy. Caddy automatically generates a self-signed certificate for your LAN, enabling secure access via hostname instead of an IP and port number.

HTTPS on LAN is optional but recommended for:
- Accessing the dashboard from a phone or tablet
- Gmail OAuth callbacks (require HTTPS redirect URIs)
- Clean, memorable URL instead of `http://192.168.1.50:3000`
- Browser cookie security requirements

---

## Quick LAN Access (No HTTPS)

If you just want to access the dashboard from other devices without setting up HTTPS:

1. In `infra/.env`, set `BIND_HOST=0.0.0.0`
2. Restart: `docker compose --env-file infra/.env -f infra/docker-compose.yml restart`
3. Find your Mac's IP: `ipconfig getifaddr en0`
4. Open `http://192.168.1.50:3000` from any device on your network

This works immediately with no certificate setup.

---

## Setting Up HTTPS

### Step 1: Configure Caddy variables in `.env`

```bash
BIND_HOST=0.0.0.0
CONTROL_PLANE_HOST=studio-brain.local
CONTROL_PLANE_LAN_IP=192.168.1.50  # Your Mac mini's actual IP
```

### Step 2: Set up local hostname

Add to `/etc/hosts` on your control plane Mac:
```bash
echo "192.168.1.50 studio-brain.local" | sudo tee -a /etc/hosts
```

For access from other Macs on the network, add the same line to their `/etc/hosts` files too.

Alternatively, add it to your router's local DNS (if your router supports this).

### Step 3: Restart the stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml restart caddy
```

Caddy generates a certificate for `studio-brain.local` automatically.

### Step 4: Export the Caddy root certificate

Caddy uses a self-signed root certificate. Your browsers won't trust it by default. Export it:

```bash
bash scripts/export_caddy_root_cert.sh infra/.env
```

This saves the certificate to `caddy-root.crt` in your current directory.

### Step 5: Trust the certificate on your Mac

```bash
# Open Keychain Access and trust the certificate
open caddy-root.crt
```

In the dialog:
1. Double-click the certificate in Keychain Access
2. Expand "Trust"
3. Set "When using this certificate" to "Always Trust"
4. Close and enter your password when prompted

### Step 6: Verify

Open `https://studio-brain.local` in your browser. You should see a green padlock and the Studio Brain UI.

The stack also serves:
- `https://n8n.studio-brain.local` → n8n workflow editor
- `https://openclaw.studio-brain.local` → OpenClaw API

---

## Trusting the Certificate on Other Devices

### Another Mac

Copy `caddy-root.crt` to the other Mac and repeat the Keychain Access trust step above.

Or over the network:
```bash
scp caddy-root.crt user@othermac:~/
# Then on the other Mac:
open ~/caddy-root.crt
```

### iPhone / iPad

1. AirDrop `caddy-root.crt` to your iPhone, or email it to yourself
2. Open the file — iOS prompts to install a configuration profile
3. Go to Settings → General → VPN & Device Management → the certificate profile → Install
4. Then go to Settings → General → About → Certificate Trust Settings → enable the certificate

### Other Browsers (Chrome, Firefox)

Chrome on macOS uses the system keychain — once trusted in Keychain Access, Chrome trusts it automatically.

Firefox maintains its own certificate store:
1. Settings → Privacy & Security → Certificates → View Certificates
2. Import the `caddy-root.crt`
3. Check "Trust this CA to identify websites"

---

## The Three HTTPS URLs

After setup:

| URL | What it serves |
|-----|---------------|
| `https://studio-brain.local` | Studio Brain UI dashboard |
| `https://n8n.studio-brain.local` | n8n workflow editor |
| `https://openclaw.studio-brain.local` | OpenClaw orchestration API |

Direct port access still works as fallback:
- `http://localhost:3000` — dashboard (same machine only)
- `http://localhost:5678` — n8n (same machine only)
- `http://<ip>:3000` — dashboard (any device, no HTTPS)

---

## Recommended Access Sequence

Work through this sequence when setting up a new machine:

1. Verify local access: `http://localhost:3000` from the control plane Mac
2. Verify LAN access by IP: `http://192.168.1.50:3000` from another device
3. Set up hostname in `/etc/hosts`
4. Export and trust the Caddy certificate
5. Verify HTTPS: `https://studio-brain.local`
6. Move daily operation to the HTTPS hostname URL

Stay on IP access until hostname and TLS are ready — never required to move to HTTPS, but cleaner for daily use.

---

## Installing Local HTTPS Script

For a one-command setup of the entire local HTTPS flow:

```bash
bash scripts/install_local_https.sh
```

This script automates Steps 1–4 above and prints instructions for certificate trust.

---

## Troubleshooting

**Browser shows "Your connection is not private"**

The certificate is not trusted on this device yet. Follow the trust steps above for your specific OS/browser.

**`https://studio-brain.local` doesn't resolve (DNS error)**

The hostname isn't in your `/etc/hosts` or local DNS. Add it:
```bash
echo "192.168.1.50 studio-brain.local" | sudo tee -a /etc/hosts
```

**Caddy not starting**

Check Caddy logs:
```bash
docker compose logs caddy --tail=50
```

Common issues:
- `CONTROL_PLANE_HOST` contains spaces or invalid characters
- `CONTROL_PLANE_LAN_IP` doesn't match the actual interface IP
- Port 80 or 443 already in use by another service

**Certificate expired**

Caddy renews certificates automatically, but if something went wrong:
```bash
docker compose restart caddy
bash scripts/export_caddy_root_cert.sh infra/.env
# Re-trust in Keychain
open caddy-root.crt
```
