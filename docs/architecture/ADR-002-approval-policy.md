# ADR 002 — Approval Policy: Fail Closed

**Status:** Accepted
**Date:** 2026-03-20

## Context
The system must ensure no outbound communication or audio modification happens
without human approval. Options: trust-based (assume workers behave), signature-based
(cryptographic approval tokens), state-machine-based (FSM enforced by central service).

## Decision
Fail-closed state machine approach:
- All jobs that could result in client impact have `approval_required = true`
- The FSM in project-state service blocks the `in-progress → complete` transition unless
  the job passes through `awaiting-approval → approved`
- The approved-send worker independently re-verifies approval state before acting
- Approved-send is a separate service with separate credentials from read-only triage

## Consequences
- A bug that skips the approval queue still cannot result in action because
  the send worker does its own check
- Defense in depth: two independent checks, not one
- Human approval is never optional for client-facing actions
- Operational cost: engineer must approve items in queue before they execute
