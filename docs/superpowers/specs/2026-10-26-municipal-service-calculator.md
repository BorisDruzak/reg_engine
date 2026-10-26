# Municipal service calculator

User-approved scope: opt-in extension of work_experience; compact calculator and current-date actions at the field, one closable overlay with editable service periods, server preview, explicit audited save, retained period history. Preserve manual fields, existing card/field access, documents and XLSX summaries. No personnel-specific model or new database table.

## Approved method

The user confirmed calendar duration per inclusive interval, then 30 residual days = one month and 12 months = one year. Name/version: `calendar_remainder_30_v1`; this residual normalization is an explicitly approved software convention, not a claim that article 14 specifies it. Full calendar leap years remain years. Merge overlapping/adjacent intervals having the same multiplier before duration calculation; differing multipliers overlapping on a counted day block saving until resolved. Conscription multiplier 2, other categories 1. Custom grounds require explicit basis and confirmation. Excluded, unconfirmed and pension-only periods do not contribute. Category alone never infers eligibility for an ordinary institutional job.

An optional confirmed baseline contains years/months/days, its as_of_date and documentary basis. It covers all history through that date: later periods must start strictly after it; historical preview before that baseline is unavailable. Do not invent periods from legacy manual duration.

User clarification: THREE independent functions: ordinary manual input, manual current-date recalculation, and period calculator. The current-date action uses a separate short dialog to confirm entered duration and its as_of_date, previews through the server, and saves MANUAL anchor plus original input/as-of metadata. It never creates periods or enters calculated mode. Reopening reuses original input/as-of metadata to prevent double accrual. Ordinary manual editing remains available and resets its input basis to the server save date. Calculated mode's numeric editor requires explicit manual transition. Both advanced actions appear only when enabled for that field; the linked date is a suggestion that requires operator confirmation.

## Contract

Storage: `{mode:'calculated',version:1,method:'calendar_remainder_30_v1',periods:[{id,kind,start_date,end_date,included,confirmed,basis,pension_only}],baseline:null|{years,months,days,as_of_date,basis,confirmed}}`. Dates ISO; end_date null means open. Categories: municipal, municipal_office, civil, state_office, military_contract, military_conscription, other_state, other_legal, municipal_additional. No arbitrary coefficients. Maximum 200 periods, bounded basis strings. Retain source records even when excluded/unconfirmed.

Domain functions: `parse_calculation(payload)->dict[str,Any]` returns strict canonical JSON or raises ValueError with Russian message; `calculate_experience(payload,as_of_date:date,*,server_date:date|None=None)->dict[str,Any]` returns `{value:{days,months,years,display},as_of_date,server_date,forecast,included_count,excluded_count,review_count,overlaps:[{period_ids,start_date,end_date,conflict}],warnings:list[str],can_save:bool}`. Pure; no I/O.

Authenticated routes under `/api/v1/cards/{card_id}/fields/{field_id}/municipal-service-experience`: GET reads saved periods/default result and manual_value/server_date/source_date; POST `/preview` computes input; PUT saves input; POST `/manual` explicitly replaces calculated mode after confirmation. Repeated-block instance is identified explicitly. All writes require editable card, cards.manage, valid field/template/instance, active-card basis/date and normal audit/event transaction. Generic manual writes and public writes must not overwrite calculated mode. Standard reads return existing summary plus safe mode marker, never period detail through public links. Ordinary block saves preserve untouched calculated values.

GET response `{calculation:null|storage,result:null|preview,manual_value:null|summary,server_date,source_date:null|ISO,can_manage:bool}`. Preview request `{calculation:storage,as_of_date:ISO,block_instance_id?:UUID|null}`. PUT adds `basis_text`, `occurred_on` and optional `expected_revision` for optimistic concurrency. GET supplies revision. POST manual accepts three components, `confirm_manual:true` and audit context/revision. No secret/operational details in responses.

Options configuration: `municipal_service_calculator:boolean`, optional `municipal_service_start_date_field_id:UUID` selecting a same-registry active date field. Off by default. No matching field labels. On new-card creation the calculator becomes available after creating the card. Calculated values continue to render and resist generic overwrite if the option is later disabled.

## Time and compatibility

Use current server date. Selected historical/future date affects preview only; field summary is evaluated on the current server date. Future preview is labelled forecast. Cap accrual at a card's recorded dismissal date; closed periods do not grow. No daily database writes. Copy/transfer keeps JSON history; XLSX remains summary-only with an explicit warning that period history is not transferred by creation-only import. Documents, reports and public reads receive computed summaries, without re-anchoring calculated data.

## UI and verification

Russian-first accessible dialog, close button/Escape/focus return, responsive rows, date calendar plus explicit DD.MM.YYYY text entry, live server preview with stale-response cancellation, period add/remove, basis/confirmation/inclusion/pension-only controls, result/counts/overlap warnings and method text. Manual transition is explicit and warns about replacing periods. Pending staged block edits must be saved/cancelled before opening this separate save surface.

Targeted domain, persistence/authorization/public/bulk/export compatibility, component and browser tests. No broad unrelated CI/review cycles. Existing untracked user output remains untouched. GitNexus reg_engine is unavailable; source/tests are architectural verification. Context7 is quota-limited; consulted official SQLAlchemy 2.0/React/Pydantic documentation as fallback.
