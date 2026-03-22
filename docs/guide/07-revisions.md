# Revisions — From Client Notes to DAW Execution

**Written for:** Studio Owner/Operator (DAW-enabled setups)
**Requires:** DAW profile enabled, worker configured

---

## The Revision Flow

Client revision notes arrive in some form of plain English. The revision parser converts them into structured DAW operations, which you review and approve before anything executes.

```
Client revision notes
        ↓
Revision Parser (LLM + deterministic fallback)
        ↓
Structured change objects (with confidence scores)
        ↓
Your review + approval
        ↓
Worker executes (ReaScript / SoundFlow)
        ↓
QC runs on output
```

---

## How Revision Notes Arrive

**Via email** — when inbox triage classifies a client email as `revision-request`, it automatically routes to the revision parser (in addition to drafting a reply).

**Via webhook** — submit directly:
```bash
curl -X POST http://localhost:8160/parse-revisions \
  -H "Content-Type: application/json" \
  -d '{
    "project_slug": "artist-ep-track3",
    "raw_notes": "The chorus feels too dense. Can you bring the guitars down a bit from the second chorus? Also the bridge vocal seems a bit too loud relative to everything. And there is a click at 2:34."
  }'
```

**Via n8n** — the `revision-source-notes-received` workflow handles inbound revision notes from any external source.

---

## What the Parser Does

The revision parser uses your planner model (Ollama or commercial LLM) with a deterministic fallback for clear instructions.

For each piece of feedback, it tries to extract:

| Field | Description | Example |
|-------|-------------|---------|
| Target | What element | `lead-vocal`, `guitar-bus`, `kick` |
| Location | Where in the song | `bar 24`, `second-chorus`, `throughout` |
| Action | What to do | `level-down`, `eq-boost`, `trim`, `remove-click` |
| Parameter | Specific value or direction | `-2dB`, `↑ high-shelf`, `fix` |
| Confidence | How certain the mapping is | `high`, `medium`, `low` |

---

## Understanding Confidence Scores

### High Confidence
The instruction was explicit and maps cleanly to a DAW parameter.

Examples:
- "Bring the kick down 2dB from bar 24 to bar 32"
- "Add a high-shelf boost at 8kHz on the snare starting from the breakdown"
- "Remove the click at 2:34"
- "Fade out starting at 3:45"

Action: Review quickly, approve if the mapping looks right.

### Medium Confidence
The instruction was directional but ambiguous in specifics. The system made a reasonable interpretation.

Examples:
- "The chorus vocal feels a bit buried" → interpreted as: lead vocal level +2dB in chorus sections
- "The bass seems muddy" → interpreted as: bass bus high-pass filter or low-mid cut
- "Can the guitars breathe more?" → interpreted as: guitar bus attack/release on compression

Action: **Read the mapped interpretation carefully.** The system may be right, but "guitars breathing more" could mean compression, reverb, or just pulling them back in the mix. Override if the interpretation doesn't match your read of the client's intent.

### Low Confidence
The instruction was vague or metaphorical. The system made a guess.

Examples:
- "Make it more emotional in the bridge"
- "It needs more energy in the third section"
- "Something feels off around 1:20"

Action: **Always review these.** The system will have attempted an interpretation (often: slight level adjustment on lead element, or flag for manual review), but low-confidence items are frequently wrong. Handle these manually or use the concierge to think through the interpretation.

### Unparseable / Skipped
Instructions the system could not map to any DAW operation.

Examples:
- "The vibe is off" (no specific element or action)
- "Can we do something different with the arrangement?" (outside scope of revision tooling)

These are logged as skipped and never executed. You'll see them listed in the execution plan review with a note that they were skipped. Handle them manually.

---

## The Revision Execution Plan

Before anything runs in your DAW, you see a complete execution plan in the Operations → Approval Queue.

### Plan Components

**Change list** — every parsed change with:
- Plain-English summary ("Reduce lead vocal by 2dB in chorus sections from bar 32")
- Confidence score badge
- Target DAW operation preview (the actual ReaScript line or SoundFlow command)

**Skipped items** — changes that couldn't be parsed, listed for your awareness

**DAW target** — which application will be used (auto-detected from your worker's installed DAWs)

**Script preview** — the complete generated script (expandable section)

### Editing the Plan

Before approving:
- **Remove items** — click the remove button on any change you don't want executed. Removed items are logged as "operator skipped" and not executed.
- **Add notes** — you can add a note to any item explaining why you changed it (recorded in audit log)

### Approving

When you approve the execution plan, the worker:
1. Claims the task
2. Executes each non-removed change in order
3. Saves the session
4. Reports completion (or error on any specific step)
5. Audio QC runs on the resulting render

---

## Common Revision Patterns

Here's how common client language maps to execution:

| Client says | System interprets | Confidence | Notes |
|-------------|------------------|-----------|-------|
| "Turn down the X" | Level: element-bus, -∞ to -3dB range | Medium | Amount is ambiguous without a number |
| "Turn up the X" | Level: element-bus, +1 to +3dB range | Medium | Amount is ambiguous |
| "The X is too loud" | Level: element-bus, -2dB | Medium | Standard reduction |
| "The X is buried" | Level: element-bus, +2dB | Medium | Standard boost |
| "Bring the X down by [N]dB" | Level: element-bus, -NdB | High | Explicit instruction |
| "Remove the click/pop at [time]" | Correction: at timestamp | High | Clear location |
| "The bass is muddy" | EQ: bass-bus, ~200-300Hz cut | Low | Many possible interpretations |
| "More brightness on the X" | EQ: element, high-shelf boost | Low | Vague — review carefully |
| "The mix is too dense" | Level: all non-vocal elements, -1dB | Low | High ambiguity |
| "The bridge needs more energy" | Level: lead-element +1dB OR tempo/dynamics | Low | Very vague — flag |

---

## After Execution

Once the worker completes the execution:

1. **Execution report** appears in Context tab — each change: completed / failed / skipped
2. **QC runs** automatically on any renders generated
3. **Listening report** is generated — a structured analysis of the output
4. **Next-action recommendations** surface based on QC results

If execution partially failed (some changes completed, some errored), the report shows which succeeded. Re-submitting just the failed items is not automatic — you'd need to re-submit those specific instructions manually.

---

## DAW-Specific Behavior

### Reaper (ReaScript)
- Script is executed via the REAPER binary's script queue
- Changes are applied to the currently open project
- REAPER must be open to the correct project before execution
- Undo is available in REAPER's native undo history

### Pro Tools + SoundFlow
- Script is executed via the SoundFlow CLI
- SoundFlow must be installed and the CLI path configured in `SOUNDFLOW_CLI_PATH`
- Pro Tools must be open to the correct session
- Changes go through SoundFlow's macro execution layer

### WaveLab (Mastering)
- Execution uses AppleScript to drive WaveLab
- Suitable for bounded mastering/export operations
- Not suitable for complex multi-track editing
- WaveLab must be open to the correct project

---

## Troubleshooting Common Issues

**Execution plan is empty (no changes parsed)**
The revision notes may have been too vague. Try re-submitting with more specific language, or handle the revisions manually.

**All changes are low confidence**
The client's language is highly metaphorical. This is normal for some clients. Use the low-confidence changes as a reading guide, not as execution commands. Handle these sessions manually with the plan as a reference.

**Worker errors on execution**
Check that:
- The DAW is open to the correct project
- The worker is running in live mode (`STUDIO_WORKER_DRY_RUN_DAW=false`)
- The shared storage paths are reachable from the worker machine
- The DAW binary path is correct

**Revision changes were applied to the wrong session**
Always verify which session is open in your DAW before approving an execution plan. The worker executes on whatever is currently open.
