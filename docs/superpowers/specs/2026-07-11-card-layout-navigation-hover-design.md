# Card Layout Interaction and Hover Navigation Design

## Goal

Improve three focused desktop interactions without changing the Registry Engine
data model, REST API, permissions, layout persistence contract, or card value
save contract:

1. Boundary-only block order arrows are omitted instead of being rendered as
   disabled controls.
2. Clicking an editable block in a filled card opens that block's existing
   inline editor.
3. A collapsed desktop navigation panel expands temporarily and smoothly while
   the pointer is over it. It has no expand/collapse button.

## Block ordering controls

`CardBlockLayoutNode` already receives the ordered section position from
`CardWebLayoutCanvas`. In design mode it will render an up arrow only when the
block is not first, and a down arrow only when the block is not last. A single
block therefore has no order controls. If a save or conflict makes ordering
unavailable, every normally available arrow remains present but disabled.

The existing full-layout, revision-safe save and one-step undo behavior remain
unchanged. Field drag/resize and block resize are outside this change.

## Filled-card block activation

The read-first card renderer will expose a block-activation callback only for
blocks with at least one editable ordinary field. Clicking a non-interactive
part of such a block opens the same `useBlockEditor` target used by the visible
`Изменить блок` button. The visible button remains as the keyboard-accessible
alternative.

Buttons, links, form controls, and their descendants do not trigger block
activation. A click on another editable block follows the existing dirty-draft
guard: save, discard, or continue editing is requested before switching. The
exact block instance remains part of the target, so a repeatable block opens
only the clicked instance. Read-only blocks and blocks containing no editable
fields remain non-interactive.

## Hover navigation

`HomePage` retains the persisted `isSidebarCollapsed` preference but adds a
transient pointer-preview state. On desktop, entering a logically collapsed
sidebar sets the preview state and expands the layout from the compact rail to
the normal sidebar width. Leaving the sidebar clears the preview and returns
to the compact rail. The preview never writes workspace state and therefore
does not interfere with the registry workspace's automatic collapse rule.

The explicit navigation toggle is removed. The compact rail remains keyboard
reachable because every navigation item keeps its accessible Russian label.
At the existing mobile breakpoint, navigation remains visibly expanded and
the hover-only behavior has no effect.

CSS transitions animate the grid width, sidebar padding, and visible brand and
navigation labels. The panel content stays clipped during the transition so
the main content does not receive horizontal overflow.

## Tests and verification

Frontend tests will prove that boundary arrows are absent, that available
arrows still disable while ordering is unavailable, and that card-block body
clicks open only the intended primary or repeatable editor while preserving the
dirty-draft guard. App-level tests will prove that the toggle is absent and
pointer entry/exit controls the transient sidebar class without changing the
stored collapsed preference.

The full local gate remains `scripts/check.ps1 -SkipRemote`. After deployment,
live Browser proof will cover the three reported comments on the existing card
and registry-template surfaces, desktop hover expansion, one mobile viewport,
and console health.

## Non-goals

- No backend, database, migration, API, or RBAC change.
- No removal of the existing `Изменить блок` button.
- No permanent expansion on sidebar hover or click.
- No change to public-link, document, attachment, or A4 workflows.
