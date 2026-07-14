# Embedded unit actions and inline unit editing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task.

**Goal:** Move unit creation into the organization card and edit unit names inline.

**Architecture:** `OrganizationsTable` supplies contextual organization-card actions to `OrganizationUnitsPanel`; the panel owns row edit state and management expansion.

## Task 1: Embed unit actions and inline editing

- [ ] Write failing tests for three card actions, absent panel header/close, card toggle, and inline management/department edit controls.
- [ ] Run focused RED.
- [ ] Move add-unit controls into card actions, remove header/close, implement unit inline name state and Save/Cancel/Archive controls with propagation isolation.
- [ ] Run focused Vitest/typecheck/lint; commit `feat: embed unit actions and edit names inline`.

## Task 2: Release

- [ ] Run focused checks, update plans/map, commit docs, push/deploy, browser proof.
