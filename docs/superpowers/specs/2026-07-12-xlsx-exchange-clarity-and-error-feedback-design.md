# XLSX Exchange Clarity and Error Feedback Design

**Date:** 2026-07-12

## Goal

Make the card XLSX workspace visually separate the two user jobs—exporting a
card list and importing new cards—and replace the generic request-failure
message with safe, actionable Russian feedback.

## Evidence and cause

The field with type card_ref shown as ссылка is intentionally excluded from the
selected XLSX columns. It is rendered only as an unsupported-field explanation
and is not included in the workbook request payload.

The visible Запрос не выполнен message has two contributing causes. The client
error mapper converts every safe XLSX validation detail that lacks an exact
predefined mapping back to the generic fallback. Separately, the production
server log proves that successful export construction failed while creating the
HTTP response: a Cyrillic X-Document-Filename header cannot be encoded as
Latin-1, producing HTTP 500 before the workbook is returned.

The fix must preserve the no-raw-internals rule: only known user-safe XLSX
validation messages may be shown. Download response headers use ASCII file
names and Content-Disposition; Russian labels remain inside the workbook.

## User interface

The workspace keeps one shared Параметры XLSX form with the selected card
template, available organisations, and supported columns. The shared parameters
avoid a mismatched template or organisation set between a downloaded import
template and its export equivalent.

Below it, two separate bordered sections appear without introducing nested tabs:

1. Экспорт карточек explains that it downloads the current list for the
   selected template, organisations, and columns, and exposes only
   Скачать список.
2. Импорт карточек begins with Скачать шаблон импорта, then contains the XLSX
   picker, preview, result, and guarded Импортировать action. Its explanatory
   text makes clear that import creates new cards only.

The unsupported ссылка field remains a muted explanation beside the shared
parameters. It never disables an otherwise valid export or import selection.

## Error handling

apiErrorMessageLabel recognizes user-safe XLSX validation details: missing
template/organisation/field selection, inaccessible selections, changed
template metadata, mismatching headers, invalid workbook/date/number/boolean
values, and input size or row limits. The panel renders these exact Russian
details beneath the operation that failed. Unknown messages remain the generic
fallback, so SQL traces, internal paths, and unexpected server errors cannot be
exposed in the browser.

## Verification

Frontend tests prove that the two operations have separate headings and
buttons, an unsupported reference field is informational only, and a known XLSX
API detail is shown instead of the generic fallback. The existing service/API
tests continue to verify selection scope and generated workbook behavior. A
backend regression test constructs the XLSX response headers through Starlette,
proving that they are safe for HTTP header encoding.

Browser QA exercises: Registry → Import and export → choose template,
organisations, and fields → confirm separate export/import sections → trigger a
safe validation error and confirm its Russian detail is shown. No production
cards are created during visual QA.
