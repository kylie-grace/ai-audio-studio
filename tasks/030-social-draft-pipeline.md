# Task 030 — Social Draft Pipeline

## Purpose and Scope
Build the content pipeline for social media. Accepts a project reference or
content brief, generates platform-appropriate captions (Instagram, Facebook,
Threads), packages asset references, and queues for human review.
**No auto-posting under any circumstance.**

## Dependencies
- Task 001 complete
- Task 040 complete (project-state)
- Ollama PLANNER_MODEL available
- `content-pipeline` service running

## Files to Create or Modify
- `services/content-pipeline/src/main.py`
- `services/content-pipeline/src/caption_generator.py`
- `services/content-pipeline/src/asset_packager.py`
- `services/content-pipeline/src/platform_formatter.py`
- `services/content-pipeline/requirements.txt`
- `services/content-pipeline/Dockerfile`
- `services/openclaw-orchestrator/prompts/social-caption.txt`
- `services/n8n/workflows/social-draft-trigger.json`

## Input Contract
```
POST /draft-social
{
  "project_id": "uuid",
  "content_type": "project-complete|milestone|behind-the-scenes|general",
  "brief": "We just finished mixing for Artist X. Genre: hip-hop. Vibe: dark.",
  "asset_paths": ["/data/projects/artist-x/assets/cover.jpg"],
  "platforms": ["instagram", "facebook", "threads"]
}
```

## Output Contract
Multiple rows in `social_drafts`, one per platform:
```json
{
  "platform": "instagram",
  "caption": "...",
  "hashtags": ["#mixing", "#hiphop", "..."],
  "asset_manifest": [{"path": "...", "type": "image"}],
  "variant_short": "...",
  "status": "pending-review"
}
```

## Platform Rules
| Platform | Max chars | Hashtag placement | Notes |
|----------|-----------|-------------------|-------|
| Instagram | 2200 | End of caption | Line break before tags |
| Facebook | 63206 | Inline or end | More conversational |
| Threads | 500 | Inline | Punchy, conversational |
| LinkedIn | 3000 | End | Professional framing |

## Prompt Contract: social-caption.txt
```
You are writing social media captions for Maggie, a mixing/mastering engineer.

Platform: {{platform}}
Content type: {{content_type}}
Brief: {{brief}}

Maggie's voice: professional but personable, proud of her craft, never cringe.
Do not use generic phrases like "excited to share" or "proud to announce".

Write:
1. Main caption (within platform character limit)
2. Hashtag set (15-20 tags for Instagram, 5-8 for others)
3. Short variant (under 150 chars for stories/threads)

Output as JSON: {"caption": "...", "hashtags": [...], "short": "..."}
```

## Acceptance Tests
1. POST brief with 3 platforms → 3 rows in `social_drafts`, all `pending-review`
2. Each caption within platform character limits
3. Hashtag count within platform-appropriate range
4. Asset manifest references valid file paths
5. All drafts appear in Studio Brain UI content queue
6. Approving a draft → `status = approved` (posting is a future manual step)
7. No calls to Instagram/Facebook/Threads APIs from this service — ever
8. Empty brief → HTTP 422 with clear error message

## Definition of Done
Content brief in → platform-appropriate draft captions out → queued for
Maggie's review in Studio Brain UI. All drafts tagged with project reference.
Audit log at Tier 2 (draft).
