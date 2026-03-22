# Social Content — From Brief to Published Post

**Written for:** Studio Owner/Operator
**Optional:** Instagram and Facebook tokens for auto-publishing

---

## Overview

The content pipeline takes a content brief and generates platform-specific social captions. It knows the character limits and conventions of each platform, applies your studio voice, and generates relevant hashtags. Everything goes through approval before any posting.

---

## How Content Briefs Arrive

**n8n webhook** — the `content-source-new-brief` workflow. Configure your content planning tool or internal process to POST briefs to this webhook.

**Manual submission:**
```bash
curl -X POST http://localhost:8110/draft-social \
  -H "Content-Type: application/json" \
  -d '{
    "brief": "Announcing the release of the Hollow Sun x River James EP. Mixed by us. Coming out Friday. Dark folk, intimate production, layered harmonies.",
    "platforms": ["instagram", "facebook", "threads"],
    "assets": ["/Volumes/StudioShare/projects/river-james-ep/promo/cover-art.jpg"]
  }'
```

---

## Platform Specifications

The system respects platform conventions automatically:

| Platform | Character limit | Hashtag approach | Notes |
|---------|----------------|------------------|-------|
| Instagram | 2,200 | 20–30 tags in first comment or at end | Line breaks matter; first 125 chars shown before "more" |
| Facebook | ~63,000 | 3–5 tags max | Longer narrative posts perform better here |
| Threads | 500 | 3–5 tags | Short, punchy format |
| LinkedIn | 3,000 | 5–10 tags | Professional framing |

---

## The Content Approval Card

In Operations → Approval Queue → Social Content:

**Platform tabs** — one tab per platform requested. You can switch between them to compare.

For each platform:
- Caption text (formatted for the platform)
- Character count (with visual indicator vs. limit)
- Hashtag pool
- Asset preview (if image/video was attached)

### Per-Platform Approval

You can approve and reject individually per platform. Common patterns:

- Approve Instagram but hold Facebook for a different day
- Approve Threads but rewrite Instagram (longer format, more creative)
- Approve all at once if the content translates equally well to all platforms

---

## Editing Captions

Click anywhere in the caption text to edit inline. Changes are tracked (the audit log records what was in the draft when you approved vs. what you changed it to).

Common things to edit before approving:
- Add specific details the brief didn't include ("Link in bio" on Instagram, specific dates)
- Adjust tone for platform (Facebook audiences respond differently than Threads)
- Tweak hashtags (remove irrelevant ones, add ones the system missed)
- Adjust line breaks for readability

---

## Hashtags

The hashtag pool is generated deterministically based on:
- The content brief text
- Your studio voice and identity
- Platform norms (Instagram gets more; LinkedIn gets fewer, more professional ones)

The system avoids:
- Overly generic tags (#music, #studio — too competitive to be useful)
- Tags with millions of posts (low discoverability for small accounts)
- Tags irrelevant to the content

You can add or remove hashtags before approving.

---

## After Approval: Publishing

**With social tokens configured:**
When you approve, the posting workflow fires and the caption + assets are submitted to the platform API.

**Without social tokens:**
The approval is recorded, but nothing posts automatically. You'll see the approved caption saved with its approval status — copy it and post manually, or configure the tokens to enable auto-posting.

Tokens are configured in:
- Settings → Connection Center → Instagram/Facebook cards
- See [Guide: Integrations — Social Media](12-integrations.md#instagram-publishing)

---

## Rate Limits and Posting Frequency

Instagram and Facebook enforce rate limits. The system doesn't post in bulk — each approved caption is a single post request. If you're approving a batch of social content and posting multiple times in one day, be aware of platform-specific limits (Meta's Graph API limits vary by account type and tier).

---

## Asset Manifest

When submitting a brief with media:

```json
{
  "brief": "Your brief text...",
  "platforms": ["instagram"],
  "assets": [
    "/Volumes/StudioShare/projects/project/promo/cover.jpg",
    "/Volumes/StudioShare/projects/project/promo/behind-scenes.jpg"
  ]
}
```

Assets are referenced by path. The approval card shows a preview. When posting, the worker reads from the asset path directly — the assets must be reachable from the machine running the content pipeline service.

---

## Improving Caption Quality

Caption quality depends on the quality of your brief and your engineer voice setting.

**Good brief:**
> *"Announcing our mix on the debut River James EP 'Somewhere South' — 6 songs, dark folk, Appalachian-influenced production. Release date: April 4th. Available on all platforms. This was a one-room, minimal production — we tracked everything live."*

**Less effective brief:**
> *"New project out."*

The more specific you are about the project, the better the captions. Artists, release dates, genres, production notes, and emotional qualities all improve output.
