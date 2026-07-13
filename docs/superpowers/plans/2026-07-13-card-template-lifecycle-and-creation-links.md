# Card Template Lifecycle and Creation Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deactivate removed card templates without breaking their existing cards, make new templates truly empty, and open creation-link cards internally on double click.

**Architecture:** Keep the existing DELETE API path, but change its service operation to deactivate a non-base template while retaining its record and audit trail. Separate active-template lookup from existing-card presentation lookup. Treat an empty field-id set as an exact empty selection, then flatten created cards into a dedicated frontend list that calls the existing card-opening workflow.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, Vitest, TanStack Query.

## Global Constraints

- Preserve the schema-driven card architecture; no fixed business fields.
- Keep all access control backend-enforced.
- Do not physically delete records or add a migration.
- Use Russian-first visible copy.
- Do not expose public child-link URLs in the administrator-created-card list.
- Follow red-green TDD for every behavior change.

---

### Task 1: Deactivate templates while preserving existing cards

**Files:**
- Modify: `backend/app/services/registry_schema.py`
- Modify: `backend/app/services/card_template_layout.py`
- Modify: `backend/tests/test_registry_card_services.py`
- Modify: `backend/tests/test_card_template_layout_services.py`

**Interfaces:**
- Consumes: `RegistrySchemaService.archive_card_template_for_actor(actor_user_id, template_id)` and `CardTemplateLayoutService.read_card_presentation_for_actor(actor_user_id, card_id)`.
- Produces: an inactive, non-archived template excluded from active lookups, while existing-card presentation can resolve the same non-archived inactive template.

- [ ] **Step 1: Write failing backend tests**

```python
def test_removing_custom_template_deactivates_without_archiving_and_keeps_existing_card_readable(
    db_session: Session,
) -> None:
    context = _phase_1d_context(db_session)
    template = RegistrySchemaService(db_session).create_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        registry_id=context["registry"].id,
        code="removable-template",
        name="Удаляемый шаблон",
        field_schema_json={"field_ids": []},
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=context["org_admin"].id,
        registry_id=context["registry"].id,
        organization_id=context["child"].id,
        card_template_id=template.id,
    )
    removed = RegistrySchemaService(db_session).archive_card_template_for_actor(
        actor_user_id=context["registry_admin"].id,
        template_id=template.id,
    )
    assert removed.is_active is False
    assert removed.archived_at is None
    assert CardTemplateLayoutService(db_session).read_card_presentation_for_actor(
        actor_user_id=context["org_admin"].id, card_id=card.id
    ).card_id == card.id

def test_empty_template_layout_has_no_blocks_or_fields(db_session: Session) -> None:
    template = CardTemplate(
        registry_id=registry.id,
        code="empty-template",
        name="Пустой шаблон",
        field_schema_json={"field_ids": []},
        default_values_json=[],
        is_active=True,
    )
    db_session.add(template)
    db_session.flush()
    layout = CardTemplateLayoutService(db_session).read_layout_for_actor(
        actor_user_id=admin.id, card_template_id=template.id
    )
    assert layout.structure.blocks == []
    assert layout.structure.fields == []
    assert layout.form_layout.sections == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest backend/tests/test_registry_card_services.py backend/tests/test_card_template_layout_services.py -q`

Expected: the deactivation assertion finds `archived_at` set, and the empty-layout assertion receives registry fields.

- [ ] **Step 3: Implement the minimal backend changes**

```python
# registry_schema.py: retain the row but clear archive metadata and set inactive.
template.is_active = False
template.archived_at = None
template.archived_by = None
template.archive_reason = None

# card_template_layout.py: always constrain structure fields to template field ids.
field_statement = field_statement.where(FormField.id.in_(field_ids))

# card presentation resolves an existing non-archived template even when inactive.
template = self._get_existing_card_template(card.card_template_id)
```

- [ ] **Step 4: Run focused backend tests to verify they pass**

Run: `python -m pytest backend/tests/test_registry_card_services.py backend/tests/test_card_template_layout_services.py -q`

Expected: zero failures.

### Task 2: Present produced cards as internal workspace entries

**Files:**
- Modify: `frontend/src/features/cards/CardCreationLinksPanel.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/styles/globals.css`
- Test: `frontend/src/features/cards/CardCreationLinksPanel.test.tsx`

**Interfaces:**
- Consumes: `CardCreationLinksPanel` receives creation links with `created_cards` and a new `onOpenCard(cardId)` callback.
- Produces: one list under the creation-link list; a double click opens the selected card through `CardsWorkspace.openCardEditor`.

- [ ] **Step 1: Write failing frontend tests**

```tsx
it("renders creation-link cards in a separate internal list and opens one on double click", async () => {
  const onOpenCard = vi.fn();
  render(
    <CardCreationLinksPanel
      mode="list"
      registryId="registry-1"
      token="token"
      organizations={[]}
      templates={[]}
      onShowList={vi.fn()}
      onOpenCard={onOpenCard}
    />,
  );

  const createdCard = await screen.findByRole("button", { name: "Карточка Созданная карточка" });
  await user.dblClick(createdCard);

  expect(onOpenCard).toHaveBeenCalledWith("created-card-id");
  expect(screen.queryByDisplayValue(/\/public\/edit\//)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm -C frontend test:run src/features/cards/CardCreationLinksPanel.test.tsx`

Expected: the component has no `onOpenCard` prop and the nested public URL remains rendered.

- [ ] **Step 3: Implement the smallest UI change**

```tsx
// CardCreationLinksPanel: flatten link.created_cards below the link list,
// render each as a keyboard-accessible internal card row, and call
// onOpenCard(card.card_id) only on a double click.

// CardsWorkspace: pass openCardEditor as onOpenCard.
// CSS: add a distinct .created-card-list row layout with a double-click affordance.
```

- [ ] **Step 4: Run the focused frontend test to verify it passes**

Run: `pnpm -C frontend test:run src/features/cards/CardCreationLinksPanel.test.tsx`

Expected: zero failures.

### Task 3: Verify the integrated change and update project status

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/PROJECT_TREE.md` only if `scripts/project-map.ps1 -Check` reports a required map update.

**Interfaces:**
- Consumes: completed backend and frontend regression coverage.
- Produces: current-project status and verified evidence for the lifecycle correction.

- [ ] **Step 1: Run the relevant full checks**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

Expected: exit code 0; record any pre-existing unrelated failures distinctly.

- [ ] **Step 2: Browser-check the target flow**

Run: use the open authenticated application at `http://192.168.100.12:8000/` after deploying the verified frontend and backend.

Expected: the link list has a separate produced-card section, double-clicking a row opens an internal card tab, and there is no public card URL in that section.

- [ ] **Step 3: Record the completed checkpoint**

```markdown
- Card-template removal now deactivates custom templates without archiving them;
  existing cards remain readable while new-use flows exclude removed templates.
- Empty templates return and render an empty schema layout.
- Creation-link produced cards open internally by double click from a separate list.
```

- [ ] **Step 4: Commit the verified scoped change**

Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "fix: correct card template lifecycle"`

Expected: the current `main` commit is pushed to `origin/main`.
