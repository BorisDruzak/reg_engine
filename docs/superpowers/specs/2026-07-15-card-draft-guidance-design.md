# Guidance before saving a card draft

## Goal

Make it clear that template fields become editable only after the initial card
draft has been saved.

## Design

Before a draft exists, every preview field remains disabled and receives a
muted lock treatment. A transparent, keyboard-accessible action layer captures
attempts to edit the field. It identifies the clicked field, displays the
Russian guidance beside that field, shakes the field briefly, and draws
attention to the existing draft-save action.

The action rail keeps the existing disabled/enabled validation. Once the base
block has an organization and template, it states that the next step is to save
the draft and gently pulses its save button. A field interaction adds a stronger
temporary animation. Reduced-motion users receive the same visual states and
copy without motion.

## Scope

- Frontend only; no REST, database, lifecycle, or draft-creation contract
  changes.
- A draft is still created only by the existing `Сохранить черновик` action.
- Tests cover the guidance text, interaction state, CSS hooks, and the single
  existing draft-save action.
