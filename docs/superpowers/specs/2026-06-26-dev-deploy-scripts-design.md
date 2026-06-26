# Development and Deployment Scripts Design

## Goal

Provide a small PowerShell-first toolkit for day-to-day development from the Codex Windows app: local checks, GitHub push, server deploy, and server smoke checks.

## Context

- Local workspace: `C:\Users\admin-2\Documents\reg_engine`
- GitHub remote: `git@github.com:BorisDruzak/reg_engine.git`
- Runtime server: `root@registoryengine`
- Server checkout: `/opt/reg_engine`
- Main database: PostgreSQL `reg_engine` on `192.168.100.12:5432`

## Selected Approach

Use PowerShell scripts as the main user interface because the primary workflow runs from the Codex Windows app. Server work is executed through `ssh root@registoryengine`, keeping Linux commands close to the deploy script without requiring the user to switch terminals.

## Script Set

- `scripts/lib/RegEngine.ps1` holds shared config and helpers.
- `scripts/check.ps1` runs local repository, SSH, GitHub, and code checks.
- `scripts/server-check.ps1` checks server SSH, GitHub fetch, PostgreSQL, and server checkout state.
- `scripts/push-git.ps1` commits and pushes local changes to GitHub with guardrails.
- `scripts/deploy.ps1` updates `/opt/reg_engine` from GitHub and runs server checks.
- `scripts/dev-cycle.ps1` runs the normal full loop: local check, push, deploy, server check.

## Error Handling

Scripts fail fast on command errors and print the command being executed. Git-push refuses to run without a commit message or without local changes. Deploy refuses to continue if server Git operations fail.

## Testing

Verification uses real commands:

- `powershell -ExecutionPolicy Bypass -File scripts/check.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -SkipServerCheck`

The scripts also detect Python files later and run `python -m compileall` automatically.

