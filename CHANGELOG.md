# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

- Added PgBouncer-backed database routing and extra PostgreSQL tuning.
- Added path-based Caddy front-door routing for the main HTTPS domain.
- Added async SoundFlow and WaveLab adapter coverage plus DAW status API coverage.
- Reduced `App.tsx` to a thin shell over extracted dashboard state.
- Added collapsible overview sections, DAW status cards, warning banners, empty states, skeletons, and tab error boundaries.
- Added contributor, security, Gmail OAuth, and ReaScript integration documentation.

## [0.9.0] - 2026-03-22

- Added root `LICENSE`, SPDX headers, README attribution, and audit log date filter tests.
- Completed audit9 polish, native Ollama posture, public-release cleanup, and licensing hardening.

## [0.8.0] - 2026-03-15

- Moved Ollama to a native macOS workflow.
- Added the shared LLM provider abstraction for Ollama, Anthropic, and OpenAI.
