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

## Card Print Layout Boundary

Card print templates are schema-driven document templates, not a separate card
schema. They reuse `document_templates`, `document_template_versions`, and
`generated_documents` with `format="card_print_layout_v1"`.

The layout JSON source of truth is millimeter-based A4 geometry:

- `sections[]` hold form-block/field flow content on a 12-column section grid;
- `overlays[]` hold absolute decorative page elements;
- legacy flat `items[]` is still accepted and normalized for backward
  compatibility.

Backend services validate page, margin, section, overlay, field, block, style,
and overlap rules before storing or rendering. PDF and DOCX generation both use
the normalized layout. DOCX field content is emitted as editable Word table
content rather than screenshots or plain text dumps.

The frontend print surface lives under
`frontend/src/features/registry/print/`. `CardLayoutStudio` is the active A4
studio entry point; the old `CardPrintTemplateEditor` module is a thin
compatibility wrapper. The ordinary card filling UI remains the primary data
entry workflow, and A4 rendering is used for print-template design, preview,
and optional print-form views.

