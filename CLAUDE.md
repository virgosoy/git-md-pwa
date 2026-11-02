# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository privacy

This repository is **public** (GitHub Pages hosting requires it). It must never contain the user's private notes repository — its URL, owner/repo name, contents, or credentials — in any committed file (docs, GLOSSARY, ADRs, spec, tickets, source, fixtures). The notes repo is entered by the user at runtime in the app settings and stored on-device only. Never hardcode or reference it in code, tests, or fixtures.

Research / triage / spec skills read the setup below:

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
