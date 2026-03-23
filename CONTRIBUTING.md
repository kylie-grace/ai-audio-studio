# Contributing

## Development Setup

1. Install Docker Desktop.
2. Install Node 20+.
3. Install Python 3.11+.
4. Install Ollama natively on macOS and start it outside Docker.
5. Copy `infra/env.example` to `infra/.env` and fill in the required values.

## Branching Convention

- Use short-lived feature branches from `main`.
- Prefer names like `feature/<scope>`, `fix/<scope>`, or `docs/<scope>`.
- Keep infrastructure, backend, and frontend work in separate branches when possible.

## Test Requirements

- All pull requests must maintain a 100% pass rate.
- Do not reduce the total passing test count.
- Run `python -m pytest tests/ -v` before opening a PR.
- Run `pytest tests/integration/ -q` when touching flow orchestration, FastAPI wiring, or worker handoffs.
- If you change the UI, also run `npm run build` in `apps/studio-brain-ui/`.

## Code Style

- Python: `ruff`
- TypeScript: `ESLint` + `Prettier`
- Keep changes localized and avoid broad refactors unless they are the explicit goal of the task.

## Commit Format

- Use imperative commit messages.
- Keep the subject line concise and scoped to the change.
- Prefer formats like `Add ...`, `Fix ...`, or `Implement ...`.
