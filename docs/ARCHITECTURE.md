# Architecture

## Overview

Registry Engine is a configurable registry platform foundation. The application is split into a FastAPI backend and a React + TypeScript frontend in one repository.

## Schema-Driven Principle

Future registries must be described through schema metadata such as registries, form blocks, form fields, cards, card block instances, and typed field values. Do not hardcode employee-specific tables, fields, or UI flows.

## API-First Principle

The backend API is the system boundary. Frontend, automation, and future MCP integrations should call the API instead of reading or writing the database directly.

## Permission Boundary

Future permission checks belong in the backend. The frontend may hide unavailable actions for usability, but backend checks are authoritative.

## Dynamic Form Principle

Future forms should render from registry and field metadata. Avoid creating fixed pages that assume one registry shape.

## Typed Field Values Principle

Future field values should preserve typed semantics instead of collapsing all values into unstructured text. This foundation phase does not implement that model yet.

## Current Components

- `backend/`: FastAPI app, healthcheck, settings, test infrastructure.
- `frontend/`: Vite React shell, smoke tests, e2e scaffold.
- `scripts/`: PowerShell workflow for Codex Windows app.
- `docs/`: project navigation, architecture, conventions, workflow, ADRs.

