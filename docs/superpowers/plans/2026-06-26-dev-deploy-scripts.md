# Dev Deploy Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PowerShell-first scripts for local checks, GitHub push, server deploy, and server verification.

**Architecture:** Shared configuration and command helpers live in `scripts/lib/RegEngine.ps1`. Thin command scripts import the helper and perform one workflow each. Server-side operations are executed from Windows through the configured SSH target.

**Tech Stack:** PowerShell 5.1+, Git, OpenSSH, PostgreSQL `psql` on the server.

---

### Task 1: Shared Helper

**Files:**
- Create: `scripts/lib/RegEngine.ps1`

- [ ] **Step 1: Create shared config**

Define repository root, GitHub remote, server host, server checkout path, branch, and database metadata in one function.

- [ ] **Step 2: Create command helpers**

Add helpers for local commands, SSH commands, Git state checks, and Python file discovery.

- [ ] **Step 3: Verify import**

Run: `powershell -ExecutionPolicy Bypass -Command ". .\scripts\lib\RegEngine.ps1; Get-RegEngineConfig"`

Expected: config values for `RepoRoot`, `ServerHost`, `ServerRepo`, `Branch`, and `RepoUrl`.

### Task 2: Local Checks

**Files:**
- Create: `scripts/check.ps1`

- [ ] **Step 1: Add local checks**

Check Git status, remote URL, GitHub SSH auth, server SSH auth, and Python compile checks when Python files exist.

- [ ] **Step 2: Verify**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`

Expected: all configured checks pass.

### Task 3: Server Checks

**Files:**
- Create: `scripts/server-check.ps1`

- [ ] **Step 1: Add server checks**

Check root SSH, configured server checkout Git remote, GitHub fetch, PostgreSQL active state, PostgreSQL listen sockets, and database TCP login.

- [ ] **Step 2: Verify**

Run: `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`

Expected: GitHub fetch passes and database query returns the configured database role.

### Task 4: Push and Deploy

**Files:**
- Create: `scripts/push-git.ps1`
- Create: `scripts/deploy.ps1`
- Create: `scripts/dev-cycle.ps1`

- [ ] **Step 1: Add push script**

Stage selected files or all files, commit with a required message, and push to `origin main`.

- [ ] **Step 2: Add deploy script**

Fetch `origin`, checkout/reset `main` in the configured server checkout, then run server checks.

- [ ] **Step 3: Add full-cycle script**

Run local checks, push, deploy, and server checks from one command.

### Task 5: Documentation

**Files:**
- Create: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Document script usage**

Add short examples for `check.ps1`, `push-git.ps1`, `deploy.ps1`, `server-check.ps1`, and `dev-cycle.ps1`.

- [ ] **Step 2: Final verification**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check.ps1
powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
```

Expected: both scripts exit with code `0`.
