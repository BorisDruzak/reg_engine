import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  archiveFormBlock,
  archiveFormField,
  archiveCardTemplate,
  archiveReferenceItem,
  archiveReferenceList,
  archiveRegistry,
  createFormBlock,
  createFormField,
  createCardTemplate,
  createReferenceItem,
  createReferenceList,
  createRegistry,
  listReferenceItems,
  listReferenceLists,
  updateReferenceItem,
  updateReferenceList,
  updateCardTemplate,
  updateFormBlock,
  updateFormField,
  updateRegistry,
} from "@/api/client";
import type {
  FormBlockRead,
  FormFieldRead,
  CardTemplateRead,
  OrganizationRead,
  ReferenceItemRead,
  ReferenceListRead,
  ReferenceListUpdatePayload,
  RegistryRead,
  RegistrySchemaRead,
} from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import {
  activityLabel,
  fieldTypeLabel,
  lifecycleStatusLabel,
  requiredModeLabel,
  uiText,
} from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel, SelectableList, WorkspaceTabs } from "@/components/common/DataSurfaces";
import { shortId } from "@/components/common/dataUtils";

import { ImportExportPanel } from "./ImportExportPanel";
import { ReportsPanel } from "./ReportsPanel";

type RegistryFormState = {
  mode: "create" | "edit";
  registryId: string | null;
  code: string;
  name: string;
  description: string;
  lifecycleStatus: string;
};

type BlockFormState = {
  mode: "create" | "edit";
  blockId: string | null;
  code: string;
  title: string;
  description: string;
  position: string;
  isRepeatable: boolean;
  publicVisible: boolean;
  publicEditable: boolean;
};

type FieldFormState = {
  mode: "create" | "edit";
  fieldId: string | null;
  blockId: string;
  code: string;
  label: string;
  description: string;
  fieldType: string;
  position: string;
  requiredMode: string;
  optionsSourceId: string;
  staticText: string;
  columnSpan: string;
  layoutRow: string;
  layoutColumn: string;
  labelPosition: string;
  separatorStyle: string;
  isActive: boolean;
  isListDisplay: boolean;
  publicVisible: boolean;
  publicEditable: boolean;
};

type FieldResizeState = {
  fieldId: string;
  currentSpan: number;
};

type CardTemplateFormState = {
  mode: "create";
  code: string;
  name: string;
  description: string;
  position: string;
};

type ReferenceListFormState = {
  mode: "create" | "edit";
  listId: string | null;
  code: string;
  name: string;
  description: string;
  ownerOrganizationId: string;
  inheritToDescendants: boolean;
  lockedForDescendants: boolean;
  managedBySystemOnly: boolean;
};

type ReferenceItemFormState = {
  mode: "create" | "edit";
  itemId: string | null;
  code: string;
  label: string;
  description: string;
  parentId: string;
  position: string;
};

const supportedFieldTypes = [
  "text",
  "number",
  "date",
  "datetime",
  "bool",
  "json",
  "select",
  "multi_select",
  "card_ref",
  "user_ref",
  "organization_ref",
  "org_unit_ref",
  "registry_ref",
  "file_ref",
  "static_text",
];

const referenceBackedFieldTypes = new Set(["select", "multi_select"]);
const fieldLabelPositions = ["top", "left", "right", "bottom"];
const fieldSeparatorStyles = ["none", "line", "space", "muted"];
const fieldLabelPositionOptions = [
  { value: "top", label: uiText.labelPositionTop },
  { value: "left", label: uiText.labelPositionLeft },
  { value: "right", label: uiText.labelPositionRight },
  { value: "bottom", label: uiText.labelPositionBottom },
];
const fieldSeparatorOptions = [
  { value: "none", label: uiText.separatorNone },
  { value: "line", label: uiText.separatorLine },
  { value: "space", label: uiText.separatorSpace },
  { value: "muted", label: uiText.separatorMuted },
];
const maxVisualColumns = 5;
const maxVisualRows = 10;

type RegistryWorkspaceTab = "registries" | "schema" | "references" | "importExport" | "reports";

const registryWorkspaceTabs: { id: RegistryWorkspaceTab; label: string }[] = [
  { id: "registries", label: uiText.registries },
  { id: "schema", label: uiText.cardSchema },
  { id: "references", label: uiText.referenceLists },
  { id: "importExport", label: uiText.importExport },
  { id: "reports", label: uiText.reports },
];

function displayConfigValue(field: FormFieldRead, key: string, fallback: string) {
  const value = field.display_config_json?.[key];
  return typeof value === "string" ? value : fallback;
}

function displayConfigNumber(field: FormFieldRead, key: string, fallback: number) {
  const value = field.display_config_json?.[key];
  return typeof value === "number" ? value : fallback;
}

function staticTextValue(field: FormFieldRead) {
  const value = field.options_config_json?.static_text;
  return typeof value === "string" ? value : "";
}

export function RegistriesAndSchema({
  registries,
  schema,
  organizations,
  selectedRegistryId,
  token,
  onSelectRegistry,
}: {
  registries: RegistryRead[];
  schema: RegistrySchemaRead | null;
  organizations: OrganizationRead[];
  selectedRegistryId: string;
  token: string;
  onSelectRegistry: (registryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<RegistryFormState | null>(null);
  const [activeTab, setActiveTab] = useState<RegistryWorkspaceTab>("registries");
  const [archiveTarget, setArchiveTarget] = useState<RegistryRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const referenceListsQuery = useQuery({
    queryKey: ["reference-lists", token, selectedRegistryId],
    queryFn: () => listReferenceLists(token, selectedRegistryId),
    enabled: Boolean(token && selectedRegistryId),
  });
  const referenceLists = referenceListsQuery.data?.items ?? [];
  const createMutation = useMutation({
    mutationFn: (payload: { code: string; name: string; description: string | null }) =>
      createRegistry(token, payload),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.registryCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: {
      registryId: string;
      name: string;
      description: string | null;
      lifecycle_status: string;
    }) =>
      updateRegistry(token, payload.registryId, {
        name: payload.name,
        description: payload.description,
        lifecycle_status: payload.lifecycle_status,
      }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.registryUpdated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (registryId: string) => archiveRegistry(token, registryId),
    onSuccess: async (_archived, registryId) => {
      setArchiveTarget(null);
      setSuccessMessage(uiText.registryArchived);
      if (selectedRegistryId === registryId) {
        onSelectRegistry(registries.find((registry) => registry.id !== registryId)?.id ?? "");
      }
      await invalidateRegistryData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? updateMutation.error ?? archiveMutation.error);
  const isFormSubmitting = createMutation.isPending || updateMutation.isPending;

  function openCreateForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      registryId: null,
      code: "",
      name: "",
      description: "",
      lifecycleStatus: "draft",
    });
  }

  function openEditForm(registry: RegistryRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "edit",
      registryId: registry.id,
      code: registry.code,
      name: registry.name,
      description: registry.description ?? "",
      lifecycleStatus: registry.lifecycle_status,
    });
  }

  function closeForm() {
    setFormState(null);
    setLocalError(null);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState) {
      return;
    }

    const name = formState.name.trim();
    const description = formState.description.trim();
    if (!name) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      createMutation.mutate({
        code: generateTechnicalCode(
          name,
          "registry",
          registries.map((registry) => registry.code),
        ),
        name,
        description: description || null,
      });
      return;
    }

    if (formState.registryId) {
      updateMutation.mutate({
        registryId: formState.registryId,
        name,
        description: description || null,
        lifecycle_status: formState.lifecycleStatus,
      });
    }
  }

  function handleArchive(registry: RegistryRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setArchiveTarget(registry);
  }

  return (
    <div className="stack">
      <WorkspaceTabs
        tabs={registryWorkspaceTabs}
        activeTab={activeTab}
        ariaLabel={uiText.registrySettingsSections}
        onChange={setActiveTab}
      />
      <div className={activeTab === "registries" ? "registry-workspace-grid" : "stack"}>
        {activeTab === "registries" && (
          <Panel title={uiText.registries}>
            <div className="panel-toolbar">
              <button type="button" className="primary-button" onClick={openCreateForm}>
                {uiText.createRegistry}
              </button>
            </div>
            <div className="panel-feedback">
              <MutationFeedback
                error={formState ? null : mutationError}
                successMessage={successMessage}
              />
            </div>
            {formState && (
              <div className="panel-form">
                <AdminMutationForm
                  title={formState.mode === "create" ? uiText.createRegistry : uiText.editRegistry}
                  submitLabel={formState.mode === "create" ? uiText.create : uiText.save}
                  isSubmitting={isFormSubmitting}
                  error={mutationError}
                  successMessage={null}
                  onCancel={closeForm}
                  onSubmit={handleFormSubmit}
                >
                  <label>
                    {uiText.registryName}
                    <input
                      value={formState.name}
                      onChange={(event) =>
                        setFormState({ ...formState, name: event.currentTarget.value })
                      }
                    />
                  </label>
                  <label>
                    {uiText.registryDescription}
                    <textarea
                      value={formState.description}
                      onChange={(event) =>
                        setFormState({ ...formState, description: event.currentTarget.value })
                      }
                    />
                  </label>
                  {formState.mode === "edit" && (
                    <label>
                      {uiText.registryStatus}
                      <select
                        value={formState.lifecycleStatus}
                        onChange={(event) =>
                          setFormState({
                            ...formState,
                            lifecycleStatus: event.currentTarget.value,
                          })
                        }
                      >
                        <option value="draft">{lifecycleStatusLabel("draft")}</option>
                        <option value="active">{lifecycleStatusLabel("active")}</option>
                      </select>
                    </label>
                  )}
                </AdminMutationForm>
              </div>
            )}
            {archiveTarget && (
              <AdminMutationDialog title={uiText.archiveRegistry}>
                <ArchiveConfirmation
                  entityLabel={uiText.registry}
                  itemLabel={archiveTarget.name}
                  isPending={archiveMutation.isPending}
                  onCancel={() => setArchiveTarget(null)}
                  onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
                />
              </AdminMutationDialog>
            )}
            <SelectableList
              items={registries.map((registry) => ({
                id: registry.id,
                title: registry.name,
                detail: `${registry.code} / v${registry.schema_version} / ${lifecycleStatusLabel(
                  registry.lifecycle_status,
                )}`,
              }))}
              selectedId={selectedRegistryId}
              onSelect={onSelectRegistry}
            />
            <RegistriesTable
              registries={registries}
              onEditRegistry={openEditForm}
              onArchiveRegistry={handleArchive}
            />
          </Panel>
        )}
        <div className="stack">
          {activeTab === "schema" && (
            <Panel title={uiText.cardSchema}>
              <SchemaVisualEditor
                key={selectedRegistryId}
                blocks={schema?.blocks ?? []}
                fields={schema?.fields ?? []}
                templates={schema?.templates ?? []}
                referenceLists={referenceLists}
                selectedRegistryId={selectedRegistryId}
                token={token}
              />
            </Panel>
          )}
          {activeTab === "references" && (
            <Panel title={uiText.referenceLists}>
              <ReferenceListsPanel
                organizations={organizations}
                referenceLists={referenceLists}
                selectedRegistryId={selectedRegistryId}
                token={token}
              />
            </Panel>
          )}
          {activeTab === "importExport" && (
            <ImportExportPanel selectedRegistryId={selectedRegistryId} token={token} />
          )}
          {activeTab === "reports" && (
            <ReportsPanel selectedRegistryId={selectedRegistryId} token={token} />
          )}
        </div>
      </div>
    </div>
  );
}

function RegistriesTable({
  registries,
  onEditRegistry,
  onArchiveRegistry,
}: {
  registries: RegistryRead[];
  onEditRegistry: (registry: RegistryRead) => void;
  onArchiveRegistry: (registry: RegistryRead) => void;
}) {
  if (registries.length === 0) {
    return null;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.registryName}</th>
            <th>{uiText.code}</th>
            <th>{uiText.status}</th>
            <th>{uiText.action}</th>
          </tr>
        </thead>
        <tbody>
          {registries.map((registry) => (
            <tr key={registry.id}>
              <td>{registry.name}</td>
              <td>{registry.code}</td>
              <td>{lifecycleStatusLabel(registry.lifecycle_status)}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.editRegistry} ${registry.name}`}
                    onClick={() => onEditRegistry(registry)}
                  >
                    {uiText.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveRegistry} ${registry.name}`}
                    onClick={() => onArchiveRegistry(registry)}
                  >
                    {uiText.moveToArchive}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaVisualEditor({
  blocks,
  fields,
  templates,
  referenceLists,
  selectedRegistryId,
  token,
}: {
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  templates: CardTemplateRead[];
  referenceLists: ReferenceListRead[];
  selectedRegistryId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [blockFormState, setBlockFormState] = useState<BlockFormState | null>(null);
  const [fieldFormState, setFieldFormState] = useState<FieldFormState | null>(null);
  const [templateFormState, setTemplateFormState] = useState<CardTemplateFormState | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [blockArchiveTarget, setBlockArchiveTarget] = useState<FormBlockRead | null>(null);
  const [fieldArchiveTarget, setFieldArchiveTarget] = useState<FormFieldRead | null>(null);
  const [templateArchiveTarget, setTemplateArchiveTarget] = useState<CardTemplateRead | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [resizingField, setResizingField] = useState<FieldResizeState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const draggedFieldIdRef = useRef<string | null>(null);
  const suppressNextHandleClickRef = useRef<string | null>(null);
  const sortedBlocks = useMemo(
    () => [...blocks].sort((left, right) => left.position - right.position),
    [blocks],
  );
  const sortedTemplates = useMemo(
    () => [...templates].sort((left, right) => left.position - right.position),
    [templates],
  );
  const selectedTemplate =
    sortedTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedTemplateFieldIds = useMemo(
    () => (selectedTemplate ? templateFieldIds(selectedTemplate) : []),
    [selectedTemplate],
  );
  const fieldsByBlockId = useMemo(() => {
    const grouped = new Map<string, FormFieldRead[]>();
    const selectedFieldIds = new Set(selectedTemplateFieldIds);
    for (const field of fields) {
      if (selectedTemplate && !selectedFieldIds.has(field.id)) {
        continue;
      }
      const blockFields = grouped.get(field.block_id) ?? [];
      blockFields.push(field);
      grouped.set(field.block_id, blockFields);
    }
    for (const blockFields of grouped.values()) {
      blockFields.sort((left, right) => left.position - right.position);
    }
    return grouped;
  }, [fields, selectedTemplate, selectedTemplateFieldIds]);

  function setActiveDraggedFieldId(fieldId: string | null) {
    draggedFieldIdRef.current = fieldId;
    setDraggedFieldId(fieldId);
  }

  useEffect(() => {
    if (!draggedFieldId) {
      return undefined;
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDraggedFieldId(null);
      }
    };
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".schema-layout-panel") || target.closest(".schema-drag-handle")) {
        return;
      }
      setActiveDraggedFieldId(null);
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, [draggedFieldId]);

  const createBlockMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      title: string;
      description: string | null;
      position: number;
      is_repeatable: boolean;
      public_visible: boolean;
      public_editable: boolean;
    }) => createFormBlock(token, selectedRegistryId, payload),
    onSuccess: async () => {
      setBlockFormState(null);
      setSuccessMessage(uiText.formBlockCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const updateBlockMutation = useMutation({
    mutationFn: (payload: {
      blockId: string;
      title: string;
      description: string | null;
      position: number;
    }) =>
      updateFormBlock(token, payload.blockId, {
        title: payload.title,
        description: payload.description,
        position: payload.position,
      }),
    onSuccess: async () => {
      setBlockFormState(null);
      setSuccessMessage(uiText.formBlockUpdated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const archiveBlockMutation = useMutation({
    mutationFn: (blockId: string) => archiveFormBlock(token, blockId),
    onSuccess: async () => {
      setBlockArchiveTarget(null);
      setSuccessMessage(uiText.formBlockArchived);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const createFieldMutation = useMutation({
    mutationFn: (payload: {
      blockId: string;
      code: string;
      label: string;
      field_type: string;
      description: string | null;
      position: number;
      required_mode: string;
      options_source_type: string | null;
      options_source_id: string | null;
      options_config_json: Record<string, unknown> | null;
      display_config_json: Record<string, unknown> | null;
      is_list_display: boolean;
      public_visible: boolean;
      public_editable: boolean;
    }) =>
      createFormField(token, payload.blockId, {
        code: payload.code,
        label: payload.label,
        field_type: payload.field_type,
        description: payload.description,
        position: payload.position,
        required_mode: payload.required_mode,
        options_source_type: payload.options_source_type,
        options_source_id: payload.options_source_id,
        options_config_json: payload.options_config_json,
        display_config_json: payload.display_config_json,
        is_list_display: payload.is_list_display,
        public_visible: payload.public_visible,
        public_editable: payload.public_editable,
      }),
    onSuccess: async (createdField) => {
      if (selectedTemplate && selectedTemplate.code !== "base_template") {
        const fieldIds = templateFieldIds(selectedTemplate);
        if (!fieldIds.includes(createdField.id)) {
          await updateCardTemplate(token, selectedTemplate.id, {
            field_schema_json: { field_ids: [...fieldIds, createdField.id] },
            default_values_json: selectedTemplate.default_values_json,
          });
        }
      }
      setFieldFormState(null);
      setSuccessMessage(uiText.formFieldCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const updateFieldMutation = useMutation({
    mutationFn: (payload: {
      fieldId: string;
      label: string;
      description: string | null;
      position: number;
      required_mode: string;
      options_config_json: Record<string, unknown> | null;
      display_config_json: Record<string, unknown> | null;
      is_active: boolean;
      is_list_display: boolean;
    }) =>
      updateFormField(token, payload.fieldId, {
        label: payload.label,
        description: payload.description,
        position: payload.position,
        required_mode: payload.required_mode,
        options_config_json: payload.options_config_json,
        display_config_json: payload.display_config_json,
        is_active: payload.is_active,
        is_list_display: payload.is_list_display,
      }),
    onSuccess: async () => {
      setFieldFormState(null);
      setSuccessMessage(uiText.formFieldUpdated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const createTemplateMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      name: string;
      description: string | null;
      position: number;
      field_schema_json: { field_ids: string[] };
      default_values_json: { field_id: string; value: unknown }[];
    }) => createCardTemplate(token, selectedRegistryId, payload),
    onSuccess: async (createdTemplate) => {
      setTemplateFormState(null);
      setSelectedTemplateId(createdTemplate.id);
      setSuccessMessage(uiText.cardTemplateCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const archiveTemplateMutation = useMutation({
    mutationFn: (templateId: string) => archiveCardTemplate(token, templateId),
    onSuccess: async () => {
      setTemplateArchiveTarget(null);
      setSuccessMessage(uiText.cardTemplateArchived);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const reorderFieldMutation = useMutation({
    mutationFn: (
      updates: {
        fieldId: string;
        position: number;
        display_config_json?: Record<string, unknown> | null;
      }[],
    ) =>
      Promise.all(
        updates.map((update) =>
          updateFormField(token, update.fieldId, {
            position: update.position,
            ...("display_config_json" in update
              ? { display_config_json: update.display_config_json ?? null }
              : {}),
          }),
        ),
      ),
    onSuccess: async () => {
      setSuccessMessage(uiText.formFieldUpdated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const archiveFieldMutation = useMutation({
    mutationFn: (fieldId: string) => archiveFormField(token, fieldId),
    onSuccess: async () => {
      setFieldArchiveTarget(null);
      setSuccessMessage(uiText.formFieldArchived);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createBlockMutation.error ??
      updateBlockMutation.error ??
      archiveBlockMutation.error ??
      createFieldMutation.error ??
      updateFieldMutation.error ??
      createTemplateMutation.error ??
      archiveTemplateMutation.error ??
      reorderFieldMutation.error ??
      archiveFieldMutation.error);
  const isBlockFormSubmitting = createBlockMutation.isPending || updateBlockMutation.isPending;
  const isFieldFormSubmitting = createFieldMutation.isPending || updateFieldMutation.isPending;
  const isTemplateFormSubmitting = createTemplateMutation.isPending;

  function openCreateBlockForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setFieldFormState(null);
    setBlockFormState({
      mode: "create",
      blockId: null,
      code: "",
      title: "",
      description: "",
      position: String(nextPosition(blocks)),
      isRepeatable: false,
      publicVisible: true,
      publicEditable: false,
    });
  }

  function openEditBlockForm(block: FormBlockRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setFieldFormState(null);
    setBlockFormState({
      mode: "edit",
      blockId: block.id,
      code: block.code,
      title: block.title,
      description: block.description ?? "",
      position: String(block.position),
      isRepeatable: block.is_repeatable,
      publicVisible: block.public_visible,
      publicEditable: block.public_editable,
    });
  }

  function toggleBlockForm(block: FormBlockRead) {
    if (blockFormState?.mode === "edit" && blockFormState.blockId === block.id) {
      closeBlockForm();
      return;
    }
    openEditBlockForm(block);
  }

  function closeBlockForm() {
    setBlockFormState(null);
    setLocalError(null);
  }

  function openCreateFieldForm(blockId: string) {
    const blockFields =
      fieldsByBlockId.get(blockId) ?? fields.filter((field) => field.block_id === blockId);
    const placement = nextFieldPlacement(blockFields);
    setLocalError(null);
    setSuccessMessage(null);
    setBlockFormState(null);
    setFieldFormState({
      mode: "create",
      fieldId: null,
      blockId,
      code: "",
      label: "",
      description: "",
      fieldType: "text",
      position: String(nextPosition(fields.filter((field) => field.block_id === blockId))),
      requiredMode: "not_required",
      optionsSourceId: "",
      staticText: "",
      columnSpan: "1",
      layoutRow: String(placement.row),
      layoutColumn: String(placement.column),
      labelPosition: "top",
      separatorStyle: "none",
      isActive: true,
      isListDisplay: false,
      publicVisible: true,
      publicEditable: false,
    });
  }

  function openEditFieldForm(field: FormFieldRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setBlockFormState(null);
    setFieldFormState({
      mode: "edit",
      fieldId: field.id,
      blockId: field.block_id,
      code: field.code,
      label: field.label,
      description: field.description ?? "",
      fieldType: field.field_type,
      position: String(field.position),
      requiredMode: field.required_mode,
      optionsSourceId:
        field.options_source_type === "reference_list" ? (field.options_source_id ?? "") : "",
      staticText: staticTextValue(field),
      columnSpan: String(displayConfigNumber(field, "column_span", 1)),
      layoutRow: String(fieldLayoutRow(field, field.position + 1)),
      layoutColumn: String(fieldLayoutColumn(field, 1)),
      labelPosition: displayConfigValue(field, "label_position", "top"),
      separatorStyle: displayConfigValue(field, "separator_style", "none"),
      isActive: field.is_active,
      isListDisplay: field.is_list_display,
      publicVisible: field.public_visible,
      publicEditable: field.public_editable,
    });
  }

  function toggleFieldForm(field: FormFieldRead) {
    if (fieldFormState?.mode === "edit" && fieldFormState.fieldId === field.id) {
      closeFieldForm();
      return;
    }
    openEditFieldForm(field);
  }

  function closeFieldForm() {
    setFieldFormState(null);
    setLocalError(null);
  }

  function openCreateTemplateForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setSelectedTemplateId(null);
    setBlockFormState(null);
    setFieldFormState(null);
    setTemplateFormState({
      mode: "create",
      code: "",
      name: "",
      description: "",
      position: String(nextPosition(templates)),
    });
  }

  function openTemplateEditor(template: CardTemplateRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setBlockFormState(null);
    setFieldFormState(null);
    setTemplateFormState(null);
    setSelectedTemplateId(template.id);
  }

  function closeTemplateForm() {
    setTemplateFormState(null);
    setLocalError(null);
  }

  function closeTemplateEditor() {
    setSelectedTemplateId(null);
    setBlockFormState(null);
    setFieldFormState(null);
    setLocalError(null);
  }

  function handleBlockFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockFormState) {
      return;
    }

    const title = blockFormState.title.trim();
    const description = blockFormState.description.trim();
    if (!title) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (blockFormState.mode === "create") {
      createBlockMutation.mutate({
        code: generateTechnicalCode(
          title,
          "block",
          blocks.map((block) => block.code),
        ),
        title,
        description: description || null,
        position: positionNumber(blockFormState.position),
        is_repeatable: blockFormState.isRepeatable,
        public_visible: blockFormState.publicVisible,
        public_editable: blockFormState.publicEditable,
      });
      return;
    }

    if (blockFormState.blockId) {
      updateBlockMutation.mutate({
        blockId: blockFormState.blockId,
        title,
        description: description || null,
        position: positionNumber(blockFormState.position),
      });
    }
  }

  function handleFieldFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fieldFormState) {
      return;
    }

    const label = fieldFormState.label.trim();
    const blockId = fieldFormState.blockId.trim();
    const optionsSourceId = fieldFormState.optionsSourceId.trim();
    if (!label || (fieldFormState.mode === "create" && !blockId)) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (fieldFormState.mode === "create") {
      const usesReferenceList = referenceBackedFieldTypes.has(fieldFormState.fieldType);
      const isStaticText = fieldFormState.fieldType === "static_text";
      createFieldMutation.mutate({
        blockId,
        code: generateTechnicalCode(
          label,
          "field",
          fields.map((field) => field.code),
        ),
        label,
        field_type: fieldFormState.fieldType,
        description: null,
        position: positionNumber(fieldFormState.position),
        required_mode: isStaticText ? "not_required" : fieldFormState.requiredMode,
        options_source_type: usesReferenceList && optionsSourceId ? "reference_list" : null,
        options_source_id: usesReferenceList && optionsSourceId ? optionsSourceId : null,
        options_config_json: isStaticText
          ? { static_text: fieldFormState.staticText.trim() }
          : null,
        display_config_json: fieldDisplayConfig(fieldFormState),
        is_list_display: isStaticText ? false : fieldFormState.isListDisplay,
        public_visible: fieldFormState.publicVisible,
        public_editable: isStaticText ? false : fieldFormState.publicEditable,
      });
      return;
    }

    if (fieldFormState.fieldId) {
      updateFieldMutation.mutate({
        fieldId: fieldFormState.fieldId,
        label,
        description: fieldFormState.description || null,
        position: positionNumber(fieldFormState.position),
        required_mode:
          fieldFormState.fieldType === "static_text" ? "not_required" : fieldFormState.requiredMode,
        options_config_json:
          fieldFormState.fieldType === "static_text"
            ? { static_text: fieldFormState.staticText.trim() }
            : null,
        display_config_json: fieldDisplayConfig(fieldFormState),
        is_active: fieldFormState.isActive,
        is_list_display:
          fieldFormState.fieldType === "static_text" ? false : fieldFormState.isListDisplay,
      });
    }
  }

  function handleTemplateFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateFormState) {
      return;
    }
    const name = templateFormState.name.trim();
    if (!name) {
      setLocalError(uiText.requiredFields);
      return;
    }
    const description = templateFormState.description.trim();
    const payload = {
      name,
      description: description || null,
      position: positionNumber(templateFormState.position),
      field_schema_json: {
        field_ids: [],
      },
      default_values_json: [],
    };

    setLocalError(null);
    setSuccessMessage(null);
    createTemplateMutation.mutate({
      ...payload,
      code: generateTechnicalCode(
        name,
        "template",
        templates.map((template) => template.code),
      ),
    });
  }

  function toggleFieldLayoutGrid(fieldId: string) {
    setDraggedFieldId((currentFieldId) => {
      const nextFieldId = currentFieldId === fieldId ? null : fieldId;
      draggedFieldIdRef.current = nextFieldId;
      return nextFieldId;
    });
  }

  function handleFieldLayoutPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    blockFields: FormFieldRead[],
    field: FormFieldRead,
  ) {
    event.stopPropagation();
    const wasOpen = draggedFieldIdRef.current === field.id;
    if (!wasOpen) {
      suppressNextHandleClickRef.current = field.id;
      setActiveDraggedFieldId(field.id);
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointerup", handlePointerUp);
      if (typeof document.elementFromPoint !== "function") {
        return;
      }
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const dropSlot = target?.closest(".schema-layout-drop-slot");
      if (!(dropSlot instanceof HTMLElement) || dropSlot.hasAttribute("disabled")) {
        return;
      }
      const row = Number(dropSlot.dataset.layoutRow);
      const column = Number(dropSlot.dataset.layoutColumn);
      if (!Number.isInteger(row) || !Number.isInteger(column)) {
        return;
      }
      handleFieldLayoutDrop(blockFields, row, column, field.id);
    };

    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleFieldDrop(blockFields: FormFieldRead[], targetFieldId: string) {
    if (!draggedFieldId || draggedFieldId === targetFieldId) {
      setActiveDraggedFieldId(null);
      return;
    }
    const draggedIndex = blockFields.findIndex((field) => field.id === draggedFieldId);
    const targetIndex = blockFields.findIndex((field) => field.id === targetFieldId);
    if (draggedIndex < 0 || targetIndex < 0) {
      setActiveDraggedFieldId(null);
      return;
    }
    const orderedFields = [...blockFields];
    const [draggedField] = orderedFields.splice(draggedIndex, 1);
    orderedFields.splice(targetIndex, 0, draggedField);
    const sortedPositions = [...blockFields.map((field) => field.position)].sort(
      (left, right) => left - right,
    );
    const updates = orderedFields
      .map((field, index) => ({
        fieldId: field.id,
        position: sortedPositions[index] ?? index,
      }))
      .filter(
        (update) =>
          blockFields.find((field) => field.id === update.fieldId)?.position !== update.position,
      );
    setActiveDraggedFieldId(null);
    if (updates.length === 0) {
      return;
    }
    setLocalError(null);
    setSuccessMessage(null);
    reorderFieldMutation.mutate(updates);
  }

  function handleFieldLayoutDrop(
    blockFields: FormFieldRead[],
    row: number,
    column: number,
    draggedFieldIdOverride = draggedFieldId,
  ) {
    if (!draggedFieldIdOverride) {
      return;
    }
    const draggedField = blockFields.find((field) => field.id === draggedFieldIdOverride);
    if (!draggedField) {
      setActiveDraggedFieldId(null);
      return;
    }

    const nextFields = blockFields.map((field) =>
      field.id === draggedField.id
        ? {
            ...field,
            display_config_json: fieldDisplayConfigWithPlacement(field, row, column),
          }
        : field,
    );
    const orderedFields = sortFieldsByVisualPlacement(nextFields);
    const sortedPositions = [...blockFields.map((field) => field.position)].sort(
      (left, right) => left - right,
    );
    const updates = orderedFields
      .map((field, index) => ({
        fieldId: field.id,
        position: sortedPositions[index] ?? index,
        ...(field.id === draggedField.id
          ? {
              display_config_json: fieldDisplayConfigWithPlacement(draggedField, row, column),
            }
          : {}),
      }))
      .filter((update) => {
        const currentField = blockFields.find((field) => field.id === update.fieldId);
        return (
          currentField?.position !== update.position ||
          ("display_config_json" in update && update.fieldId === draggedField.id)
        );
      });

    setActiveDraggedFieldId(null);
    if (updates.length === 0) {
      return;
    }
    setLocalError(null);
    setSuccessMessage(null);
    reorderFieldMutation.mutate(updates);
  }

  function handleFieldSpanResize(field: FormFieldRead, nextSpan: number) {
    const column = fieldLayoutColumn(field, 1);
    const currentSpan = clampFieldColumnSpan(fieldColumnSpan(field), column);
    const safeSpan = clampFieldColumnSpan(nextSpan, column);
    if (safeSpan === currentSpan) {
      return;
    }
    setLocalError(null);
    setSuccessMessage(null);
    reorderFieldMutation.mutate([
      {
        fieldId: field.id,
        position: field.position,
        display_config_json: fieldDisplayConfigWithSpan(field, safeSpan),
      },
    ]);
  }

  function handleFieldResizePointerDown(
    event: ReactPointerEvent<HTMLElement>,
    field: FormFieldRead,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const column = fieldLayoutColumn(field, 1);
    const startSpan = clampFieldColumnSpan(fieldColumnSpan(field), column);
    const startX = event.clientX;
    const rowElement = event.currentTarget.closest(".schema-field-layout-row");
    const rowWidth =
      rowElement instanceof HTMLElement ? rowElement.getBoundingClientRect().width : 0;
    const columnWidth = rowWidth > 0 ? rowWidth / maxVisualColumns : 160;
    const spanFromClientX = (clientX: number) =>
      clampFieldColumnSpan(startSpan + Math.round((clientX - startX) / columnWidth), column);

    setResizingField({ fieldId: field.id, currentSpan: startSpan });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextSpan = spanFromClientX(moveEvent.clientX);
      setResizingField((current) =>
        current?.fieldId === field.id ? { ...current, currentSpan: nextSpan } : current,
      );
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      const nextSpan = spanFromClientX(upEvent.clientX);
      setResizingField(null);
      handleFieldSpanResize(field, nextSpan);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleFieldResizeKeyDown(event: ReactKeyboardEvent<HTMLElement>, field: FormFieldRead) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    handleFieldSpanResize(field, fieldColumnSpan(field) + direction);
  }

  function renderSchemaFieldGrid(blockFields: FormFieldRead[]) {
    const rows = visualFieldRows(blockFields);
    const layoutField = blockFields.find((field) => field.id === draggedFieldId) ?? null;
    const isDraggingInThisBlock = false;
    const nextRow = rows.length > 0 ? Math.max(...rows.map((row) => row.row)) + 1 : 1;

    return (
      <>
        {blockFields.length === 0 && <p className="data-empty">{uiText.noFieldsInBlock}</p>}
        {layoutField && renderLayoutDropPanel(blockFields, layoutField)}
        {rows.map((row) => (
          <Fragment key={row.row}>
            {isDraggingInThisBlock && (
              <div
                className="schema-field-layout-row schema-field-drop-row"
                style={{ "--schema-row-columns": String(maxVisualColumns) } as CSSProperties}
              >
                {renderLayoutDropSlots(blockFields, row.row)}
              </div>
            )}
            <div
              className="schema-field-layout-row"
              style={{ "--schema-row-columns": String(row.columns) } as CSSProperties}
            >
              {row.fields.map(({ field, column, columnSpan }) => {
                const isEditingField =
                  fieldFormState?.mode === "edit" && fieldFormState.fieldId === field.id;
                const isStaticText = field.field_type === "static_text";
                const displayedColumnSpan =
                  resizingField?.fieldId === field.id ? resizingField.currentSpan : columnSpan;
                return (
                  <div
                    key={field.id}
                    className={[
                      "schema-field-row",
                      isStaticText ? "is-static-text" : "",
                      draggedFieldId === field.id ? "is-dragging" : "",
                      resizingField?.fieldId === field.id ? "is-resizing" : "",
                      isEditingField ? "is-expanded" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    role="button"
                    tabIndex={0}
                    style={
                      {
                        "--schema-field-column": `${column} / span ${displayedColumnSpan}`,
                      } as CSSProperties
                    }
                    onClick={() => toggleFieldForm(field)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleFieldForm(field);
                      }
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleFieldDrop(blockFields, field.id)}
                  >
                    <button
                      type="button"
                      className="drag-handle schema-drag-handle"
                      aria-label={`Перетащить поле ${field.label}`}
                      draggable
                      onClick={(event) => {
                        event.stopPropagation();
                        if (suppressNextHandleClickRef.current === field.id) {
                          suppressNextHandleClickRef.current = null;
                          return;
                        }
                        toggleFieldLayoutGrid(field.id);
                      }}
                      onPointerDown={(event) => {
                        handleFieldLayoutPointerDown(event, blockFields, field);
                      }}
                      onDragStart={(event) => {
                        if (event.dataTransfer) {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", field.id);
                        }
                        setActiveDraggedFieldId(field.id);
                      }}
                      onDragEnd={() => setActiveDraggedFieldId(null)}
                    >
                      ::
                    </button>
                    <div className="schema-field-main">
                      <strong>{field.label}</strong>
                      <span>
                        {fieldTypeLabel(field.field_type)}
                        {" / "}
                        {requiredModeLabel(field.required_mode)}
                        {" / "}
                        {activityLabel(field.is_active)}
                      </span>
                    </div>
                    <span
                      role="separator"
                      aria-label={`Изменить ширину поля ${field.label}`}
                      aria-orientation="vertical"
                      aria-valuemin={1}
                      aria-valuemax={maxVisualColumns}
                      aria-valuenow={displayedColumnSpan}
                      tabIndex={0}
                      className="schema-field-resize-handle"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => handleFieldResizePointerDown(event, field)}
                      onKeyDown={(event) => handleFieldResizeKeyDown(event, field)}
                    />
                    {isStaticText && (
                      <small className="schema-static-text-preview">{staticTextValue(field)}</small>
                    )}
                    {isEditingField && (
                      <div
                        className="schema-field-inline-form"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="panel-form schema-field-form-panel">
                          {renderFieldForm()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Fragment>
        ))}
        {isDraggingInThisBlock && (
          <div
            className="schema-field-layout-row schema-field-drop-row"
            style={{ "--schema-row-columns": String(maxVisualColumns) } as CSSProperties}
          >
            {renderLayoutDropSlots(blockFields, nextRow)}
          </div>
        )}
      </>
    );
  }

  function renderLayoutDropPanel(blockFields: FormFieldRead[], layoutField: FormFieldRead) {
    return (
      <div
        className="schema-layout-panel"
        role="group"
        aria-label={`Сетка перемещения поля ${layoutField.label}`}
      >
        <div className="schema-layout-panel-header">
          <div>
            <strong>Перемещение поля: {layoutField.label}</strong>
            <span>
              {maxVisualRows} строк и {maxVisualColumns} колонок
            </span>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setActiveDraggedFieldId(null)}
          >
            Закрыть сетку
          </button>
        </div>
        <div className="schema-layout-grid-scroll">
          <div
            className="schema-layout-grid"
            style={{ "--schema-row-columns": String(maxVisualColumns) } as CSSProperties}
          >
            {Array.from({ length: maxVisualRows }, (_, index) => (
              <Fragment key={index + 1}>{renderLayoutDropSlots(blockFields, index + 1)}</Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderLayoutDropSlots(blockFields: FormFieldRead[], row: number) {
    const visualItems = visualFieldItems(blockFields);
    const draggedField = blockFields.find((field) => field.id === draggedFieldId) ?? null;
    const currentItem = draggedField
      ? visualItems.find((item) => item.field.id === draggedField.id)
      : null;

    return Array.from({ length: maxVisualColumns }, (_, index) => {
      const column = index + 1;
      const occupant = visualItems.find(
        (item) =>
          item.row === row && column >= item.column && column < item.column + item.columnSpan,
      );
      const isCurrent =
        currentItem != null &&
        row === currentItem.row &&
        column >= currentItem.column &&
        column < currentItem.column + currentItem.columnSpan;
      return (
        <button
          key={`${row}:${column}`}
          type="button"
          className={[
            "schema-layout-drop-slot",
            occupant ? "is-occupied" : "",
            isCurrent ? "is-current" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={
            isCurrent && draggedField
              ? `Текущее положение поля ${draggedField.label}: строка ${row} колонка ${column}`
              : `Поместить поле в строку ${row} колонку ${column}`
          }
          data-layout-row={row}
          data-layout-column={column}
          disabled={isCurrent}
          onClick={() => {
            if (!isCurrent) {
              handleFieldLayoutDrop(blockFields, row, column);
            }
          }}
          onDragOver={(event) => {
            if (!isCurrent) {
              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
              }
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!isCurrent) {
              handleFieldLayoutDrop(blockFields, row, column);
            }
          }}
        >
          <span>{isCurrent ? "Текущее" : `${row}.${column}`}</span>
          {occupant && <small>{occupant.field.label}</small>}
        </button>
      );
    });
  }

  function renderBlockForm() {
    if (!blockFormState) {
      return null;
    }

    return (
      <AdminMutationForm
        title={blockFormState.mode === "create" ? uiText.createFormBlock : uiText.editFormBlock}
        submitLabel={blockFormState.mode === "create" ? uiText.create : uiText.save}
        isSubmitting={isBlockFormSubmitting}
        error={mutationError}
        successMessage={null}
        onCancel={closeBlockForm}
        onSubmit={handleBlockFormSubmit}
      >
        <label>
          {uiText.formBlockTitle}
          <input
            value={blockFormState.title}
            onChange={(event) =>
              setBlockFormState({ ...blockFormState, title: event.currentTarget.value })
            }
          />
        </label>
        {blockFormState.mode === "create" && (
          <div className="schema-field-options">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={blockFormState.isRepeatable}
                onChange={(event) =>
                  setBlockFormState({
                    ...blockFormState,
                    isRepeatable: event.currentTarget.checked,
                  })
                }
              />
              {uiText.repeatableBlock}
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={blockFormState.publicVisible}
                onChange={(event) =>
                  setBlockFormState({
                    ...blockFormState,
                    publicVisible: event.currentTarget.checked,
                  })
                }
              />
              {uiText.publicVisibleBlock}
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={blockFormState.publicEditable}
                onChange={(event) =>
                  setBlockFormState({
                    ...blockFormState,
                    publicEditable: event.currentTarget.checked,
                  })
                }
              />
              {uiText.publicEditableBlock}
            </label>
          </div>
        )}
        {blockFormState.mode === "edit" && blockFormState.blockId && (
          <div className="schema-danger-inline">
            <button
              type="button"
              className="danger-button"
              disabled={archiveBlockMutation.isPending}
              onClick={() =>
                setBlockArchiveTarget(
                  blocks.find((block) => block.id === blockFormState.blockId) ?? null,
                )
              }
            >
              {uiText.archiveInEditor}
            </button>
          </div>
        )}
      </AdminMutationForm>
    );
  }

  function renderVisualOptionGroup({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) {
    return (
      <div className="schema-visual-option-group" role="group" aria-label={label}>
        <span className="schema-visual-option-label">{label}</span>
        <div className="schema-visual-option-buttons">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[
                "schema-visual-option-button",
                option.value === value ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={option.value === value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderFieldForm() {
    if (!fieldFormState) {
      return null;
    }

    return (
      <AdminMutationForm
        title={fieldFormState.mode === "create" ? uiText.createFormField : uiText.editFormField}
        submitLabel={fieldFormState.mode === "create" ? uiText.create : uiText.save}
        isSubmitting={isFieldFormSubmitting}
        error={mutationError}
        successMessage={null}
        onCancel={closeFieldForm}
        onSubmit={handleFieldFormSubmit}
      >
        <div className="schema-field-form-grid">
          {fieldFormState.mode === "create" && (
            <label>
              {uiText.formFieldType}
              <select
                value={fieldFormState.fieldType}
                onChange={(event) =>
                  setFieldFormState({
                    ...fieldFormState,
                    fieldType: event.currentTarget.value,
                    requiredMode:
                      event.currentTarget.value === "static_text"
                        ? "not_required"
                        : fieldFormState.requiredMode,
                    isListDisplay:
                      event.currentTarget.value === "static_text"
                        ? false
                        : fieldFormState.isListDisplay,
                    publicEditable:
                      event.currentTarget.value === "static_text"
                        ? false
                        : fieldFormState.publicEditable,
                    optionsSourceId: referenceBackedFieldTypes.has(event.currentTarget.value)
                      ? fieldFormState.optionsSourceId
                      : "",
                  })
                }
              >
                {supportedFieldTypes.map((fieldType) => (
                  <option key={fieldType} value={fieldType}>
                    {fieldTypeLabel(fieldType)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {uiText.formFieldLabel}
            <input
              value={fieldFormState.label}
              onChange={(event) =>
                setFieldFormState({ ...fieldFormState, label: event.currentTarget.value })
              }
            />
          </label>
          <label>
            {uiText.formFieldRequiredMode}
            <select
              value={fieldFormState.requiredMode}
              onChange={(event) =>
                setFieldFormState({
                  ...fieldFormState,
                  requiredMode: event.currentTarget.value,
                })
              }
            >
              <option value="not_required">{uiText.notRequiredField}</option>
              <option value="required">{uiText.requiredField}</option>
              <option value="required_on_publish">{uiText.requiredOnPublishField}</option>
            </select>
          </label>
          {fieldFormState.fieldType === "static_text" && (
            <label className="schema-static-text-label">
              {uiText.staticTextContent}
              <textarea
                value={fieldFormState.staticText}
                onChange={(event) =>
                  setFieldFormState({
                    ...fieldFormState,
                    staticText: event.currentTarget.value,
                  })
                }
              />
            </label>
          )}
          {fieldFormState.mode === "create" &&
            referenceBackedFieldTypes.has(fieldFormState.fieldType) && (
              <label>
                {uiText.referenceListForField}
                <select
                  value={fieldFormState.optionsSourceId}
                  onChange={(event) =>
                    setFieldFormState({
                      ...fieldFormState,
                      optionsSourceId: event.currentTarget.value,
                    })
                  }
                >
                  <option value="">{uiText.noReferenceList}</option>
                  {referenceLists.map((referenceList) => (
                    <option key={referenceList.id} value={referenceList.id}>
                      {referenceList.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          {renderVisualOptionGroup({
            label: uiText.fieldLabelPosition,
            value: fieldFormState.labelPosition,
            options: fieldLabelPositionOptions,
            onChange: (value) => setFieldFormState({ ...fieldFormState, labelPosition: value }),
          })}
          {renderVisualOptionGroup({
            label: uiText.fieldSeparatorStyle,
            value: fieldFormState.separatorStyle,
            options: fieldSeparatorOptions,
            onChange: (value) => setFieldFormState({ ...fieldFormState, separatorStyle: value }),
          })}
        </div>
        <div className="schema-field-options">
          {fieldFormState.fieldType !== "static_text" && (
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={fieldFormState.isListDisplay}
                onChange={(event) =>
                  setFieldFormState({
                    ...fieldFormState,
                    isListDisplay: event.currentTarget.checked,
                  })
                }
              />
              {uiText.listDisplayField}
            </label>
          )}
          {fieldFormState.mode === "create" && (
            <>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={fieldFormState.publicVisible}
                  onChange={(event) =>
                    setFieldFormState({
                      ...fieldFormState,
                      publicVisible: event.currentTarget.checked,
                    })
                  }
                />
                {uiText.publicVisibleField}
              </label>
              {fieldFormState.fieldType !== "static_text" && (
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={fieldFormState.publicEditable}
                    onChange={(event) =>
                      setFieldFormState({
                        ...fieldFormState,
                        publicEditable: event.currentTarget.checked,
                      })
                    }
                  />
                  {uiText.publicEditableField}
                </label>
              )}
            </>
          )}
          {fieldFormState.mode === "edit" && (
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={fieldFormState.isActive}
                onChange={(event) =>
                  setFieldFormState({
                    ...fieldFormState,
                    isActive: event.currentTarget.checked,
                  })
                }
              />
              {uiText.activeFormField}
            </label>
          )}
        </div>
        {fieldFormState.mode === "edit" && fieldFormState.fieldId && (
          <div className="schema-danger-inline">
            <button
              type="button"
              className="danger-button"
              disabled={archiveFieldMutation.isPending}
              onClick={() =>
                setFieldArchiveTarget(
                  fields.find((field) => field.id === fieldFormState.fieldId) ?? null,
                )
              }
            >
              {uiText.archiveInEditor}
            </button>
          </div>
        )}
      </AdminMutationForm>
    );
  }

  function renderTemplateForm() {
    if (!templateFormState) {
      return null;
    }

    return (
      <AdminMutationForm
        title={uiText.createCardTemplate}
        submitLabel={uiText.create}
        isSubmitting={isTemplateFormSubmitting}
        error={mutationError}
        successMessage={null}
        onCancel={closeTemplateForm}
        onSubmit={handleTemplateFormSubmit}
      >
        <div className="card-template-form-grid">
          <label>
            <span>{uiText.cardTemplateName}</span>
            <input
              aria-label={uiText.cardTemplateName}
              value={templateFormState.name}
              onChange={(event) =>
                setTemplateFormState({
                  ...templateFormState,
                  name: event.currentTarget.value,
                })
              }
            />
          </label>
        </div>
      </AdminMutationForm>
    );
  }

  return (
    <section
      className="schema-visual-editor"
      role="region"
      aria-label={uiText.visualCardSchemaEditor}
    >
      <div className="panel-feedback">
        <MutationFeedback
          error={blockFormState || fieldFormState ? null : mutationError}
          successMessage={successMessage}
        />
      </div>
      <section className="card-template-section" role="region" aria-label={uiText.cardTemplates}>
        <header className="card-template-section-header">
          <h3>{uiText.cardTemplates}</h3>
          <button
            type="button"
            className="primary-button"
            disabled={!selectedRegistryId}
            onClick={openCreateTemplateForm}
          >
            {uiText.createCardTemplate}
          </button>
        </header>
        {templateFormState?.mode === "create" && (
          <div className="panel-form card-template-form-panel">{renderTemplateForm()}</div>
        )}
        <div className="card-template-list">
          {sortedTemplates.length === 0 ? (
            <p className="data-empty">{uiText.noData}</p>
          ) : (
            sortedTemplates.map((template) => {
              const selectedFields = templateFieldIds(template)
                .map((fieldId) => fields.find((field) => field.id === fieldId)?.label)
                .filter(Boolean);
              const isSelectedTemplate = selectedTemplateId === template.id;
              return (
                <article
                  key={template.id}
                  className={[
                    "card-template-card",
                    isSelectedTemplate ? "is-selected" : "",
                    !template.is_active ? "is-archived" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="button"
                  aria-label={`${uiText.cardTemplate} ${template.name}`}
                  tabIndex={0}
                  onClick={() => openTemplateEditor(template)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTemplateEditor(template);
                    }
                  }}
                >
                  <header className="card-template-card-header">
                    <div>
                      <h4>{template.name}</h4>
                      <span>{`${uiText.technicalCode}: ${template.code}`}</span>
                      {selectedFields.length > 0 && <small>{selectedFields.join(", ")}</small>}
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        aria-label={`${uiText.archiveCardTemplate} ${template.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setTemplateArchiveTarget(template);
                        }}
                      >
                        {uiText.moveToArchive}
                      </button>
                    </div>
                  </header>
                </article>
              );
            })
          )}
        </div>
      </section>
      {blockArchiveTarget && (
        <AdminMutationDialog title={uiText.archiveFormBlock}>
          <ArchiveConfirmation
            entityLabel={uiText.formBlock}
            itemLabel={blockArchiveTarget.title}
            isPending={archiveBlockMutation.isPending}
            onCancel={() => setBlockArchiveTarget(null)}
            onConfirm={() => archiveBlockMutation.mutate(blockArchiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      {fieldArchiveTarget && (
        <AdminMutationDialog title={uiText.archiveFormField}>
          <ArchiveConfirmation
            entityLabel={uiText.formField}
            itemLabel={fieldArchiveTarget.label}
            isPending={archiveFieldMutation.isPending}
            onCancel={() => setFieldArchiveTarget(null)}
            onConfirm={() => archiveFieldMutation.mutate(fieldArchiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      {templateArchiveTarget && (
        <AdminMutationDialog title={uiText.archiveCardTemplate}>
          <ArchiveConfirmation
            entityLabel={uiText.cardTemplate}
            itemLabel={templateArchiveTarget.name}
            isPending={archiveTemplateMutation.isPending}
            onCancel={() => setTemplateArchiveTarget(null)}
            onConfirm={() => archiveTemplateMutation.mutate(templateArchiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      {selectedTemplate && (
        <section
          className="schema-template-editor"
          role="region"
          aria-label={`${uiText.cardTemplateEditor} ${selectedTemplate.name}`}
        >
          <header className="schema-template-editor-header">
            <div>
              <h3>
                {uiText.cardTemplateEditor}: {selectedTemplate.name}
              </h3>
              <span>{`${uiText.technicalCode}: ${selectedTemplate.code}`}</span>
            </div>
            <button type="button" className="ghost-button" onClick={closeTemplateEditor}>
              {uiText.cancel}
            </button>
          </header>
          <div className="schema-canvas">
            {sortedBlocks.map((block) => {
              const blockFields = fieldsByBlockId.get(block.id) ?? [];
              return (
                <article key={block.id} className="schema-block-card">
                  <header
                    className="schema-block-header schema-clickable-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleBlockForm(block)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleBlockForm(block);
                      }
                    }}
                  >
                    <div>
                      <h3>{block.title}</h3>
                      <span>{`${uiText.technicalCode}: ${block.code}`}</span>
                    </div>
                  </header>
                  {blockFormState?.mode === "edit" && blockFormState.blockId === block.id && (
                    <div
                      className="panel-form schema-block-inline-form"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {renderBlockForm()}
                    </div>
                  )}
                  <div className="schema-field-list">{renderSchemaFieldGrid(blockFields)}</div>
                  <div className="schema-add-field-slot">
                    {fieldFormState?.mode === "create" && fieldFormState.blockId === block.id ? (
                      <div className="panel-form schema-field-form-panel">{renderFieldForm()}</div>
                    ) : (
                      <button
                        type="button"
                        className="ghost-button schema-add-field-button"
                        aria-label={`${uiText.addFieldToBlock} ${block.title}`}
                        onClick={() => openCreateFieldForm(block.id)}
                      >
                        + {uiText.addField}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="schema-add-block-slot">
            {blockFormState?.mode === "create" ? (
              <div className="panel-form schema-block-inline-form">{renderBlockForm()}</div>
            ) : (
              <button
                type="button"
                className="ghost-button schema-add-block-button"
                aria-label={uiText.addFormBlock}
                disabled={!selectedRegistryId}
                onClick={openCreateBlockForm}
              >
                + {uiText.addFormBlock}
              </button>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

async function invalidateRegistryData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["registries", token] });
  await queryClient.invalidateQueries({ queryKey: ["registry-schema", token] });
  await queryClient.invalidateQueries({ queryKey: ["cards", token] });
  await queryClient.invalidateQueries({ queryKey: ["organization-cards", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}

function ReferenceListsPanel({
  organizations,
  referenceLists,
  selectedRegistryId,
  token,
}: {
  organizations: OrganizationRead[];
  referenceLists: ReferenceListRead[];
  selectedRegistryId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [selectedReferenceListId, setSelectedReferenceListId] = useState<string | null>(null);
  const activeReferenceListId = selectedReferenceListId ?? referenceLists[0]?.id ?? "";
  const referenceItemsQuery = useQuery({
    queryKey: ["reference-items", token, activeReferenceListId],
    queryFn: () => listReferenceItems(token, activeReferenceListId),
    enabled: Boolean(token && activeReferenceListId),
  });
  const referenceItems = referenceItemsQuery.data?.items ?? [];
  const organizationById = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization])),
    [organizations],
  );
  const [listFormState, setListFormState] = useState<ReferenceListFormState | null>(null);
  const [itemFormState, setItemFormState] = useState<ReferenceItemFormState | null>(null);
  const [listArchiveTarget, setListArchiveTarget] = useState<ReferenceListRead | null>(null);
  const [itemArchiveTarget, setItemArchiveTarget] = useState<ReferenceItemRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createListMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      name: string;
      owner_organization_id: string | null;
      description: string | null;
      inherit_to_descendants: boolean;
      locked_for_descendants: boolean;
      managed_by_system_only: boolean;
    }) => createReferenceList(token, selectedRegistryId, payload),
    onSuccess: async (created) => {
      setListFormState(null);
      setSelectedReferenceListId(created.id);
      setSuccessMessage(uiText.referenceListCreated);
      await invalidateReferenceData(queryClient, token, selectedRegistryId, created.id);
    },
  });
  const updateListMutation = useMutation({
    mutationFn: (payload: { listId: string; body: ReferenceListUpdatePayload }) =>
      updateReferenceList(token, payload.listId, payload.body),
    onSuccess: async (_updated, payload) => {
      setListFormState(null);
      setSuccessMessage(uiText.referenceListUpdated);
      await invalidateReferenceData(queryClient, token, selectedRegistryId, payload.listId);
    },
  });
  const archiveListMutation = useMutation({
    mutationFn: (listId: string) => archiveReferenceList(token, listId),
    onSuccess: async (_archived, listId) => {
      setListArchiveTarget(null);
      setSuccessMessage(uiText.referenceListArchived);
      if (activeReferenceListId === listId) {
        setSelectedReferenceListId(
          referenceLists.find((referenceList) => referenceList.id !== listId)?.id ?? null,
        );
      }
      await invalidateReferenceData(queryClient, token, selectedRegistryId, listId);
    },
  });
  const createItemMutation = useMutation({
    mutationFn: (payload: {
      listId: string;
      code: string;
      label: string;
      parent_id: string | null;
      description: string | null;
      position: number;
    }) =>
      createReferenceItem(token, payload.listId, {
        code: payload.code,
        label: payload.label,
        parent_id: payload.parent_id,
        description: payload.description,
        position: payload.position,
      }),
    onSuccess: async (_created, payload) => {
      setItemFormState(null);
      setSuccessMessage(uiText.referenceItemCreated);
      await invalidateReferenceData(queryClient, token, selectedRegistryId, payload.listId);
    },
  });
  const updateItemMutation = useMutation({
    mutationFn: (payload: {
      itemId: string;
      label: string;
      description: string | null;
      position: number;
    }) =>
      updateReferenceItem(token, payload.itemId, {
        label: payload.label,
        description: payload.description,
        position: payload.position,
      }),
    onSuccess: async (_updated, payload) => {
      setItemFormState(null);
      setSuccessMessage(uiText.referenceItemUpdated);
      const listId =
        referenceItems.find((item) => item.id === payload.itemId)?.list_id ?? activeReferenceListId;
      await invalidateReferenceData(queryClient, token, selectedRegistryId, listId);
    },
  });
  const archiveItemMutation = useMutation({
    mutationFn: (itemId: string) => archiveReferenceItem(token, itemId),
    onSuccess: async () => {
      setItemArchiveTarget(null);
      setSuccessMessage(uiText.referenceItemArchived);
      await invalidateReferenceData(queryClient, token, selectedRegistryId, activeReferenceListId);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createListMutation.error ??
      updateListMutation.error ??
      archiveListMutation.error ??
      createItemMutation.error ??
      updateItemMutation.error ??
      archiveItemMutation.error ??
      referenceItemsQuery.error);

  function organizationLabel(organizationId: string | null) {
    if (!organizationId) {
      return uiText.none;
    }
    return organizationById.get(organizationId)?.name ?? shortId(organizationId);
  }

  function openCreateListForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setItemFormState(null);
    setListFormState({
      mode: "create",
      listId: null,
      code: "",
      name: "",
      description: "",
      ownerOrganizationId: "",
      inheritToDescendants: false,
      lockedForDescendants: false,
      managedBySystemOnly: false,
    });
  }

  function closeListForm() {
    setListFormState(null);
    setLocalError(null);
  }

  function openCreateItemForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setListFormState(null);
    setItemFormState({
      mode: "create",
      itemId: null,
      code: "",
      label: "",
      description: "",
      parentId: "",
      position: "0",
    });
  }

  function openEditItemForm(item: ReferenceItemRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setListFormState(null);
    setItemFormState({
      mode: "edit",
      itemId: item.id,
      code: item.code,
      label: item.label,
      description: item.description ?? "",
      parentId: item.parent_id ?? "",
      position: String(item.position),
    });
  }

  function closeItemForm() {
    setItemFormState(null);
    setLocalError(null);
  }

  function handleListFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listFormState) {
      return;
    }

    const name = listFormState.name.trim();
    const description = listFormState.description.trim();
    if (!name) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (listFormState.mode === "create") {
      createListMutation.mutate({
        code: generateTechnicalCode(
          name,
          "list",
          referenceLists.map((referenceList) => referenceList.code),
        ),
        name,
        owner_organization_id: listFormState.ownerOrganizationId || null,
        description: description || null,
        inherit_to_descendants: listFormState.inheritToDescendants,
        locked_for_descendants: listFormState.lockedForDescendants,
        managed_by_system_only: listFormState.managedBySystemOnly,
      });
      return;
    }

    if (listFormState.listId) {
      updateListMutation.mutate({
        listId: listFormState.listId,
        body: {
          name,
          description: description || null,
        },
      });
    }
  }

  function handleItemFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemFormState || !activeReferenceListId) {
      return;
    }

    const label = itemFormState.label.trim();
    if (!label) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (itemFormState.mode === "create") {
      createItemMutation.mutate({
        listId: activeReferenceListId,
        code: generateTechnicalCode(
          label,
          "item",
          (referenceItemsQuery.data?.items ?? []).map((item) => item.code),
        ),
        label,
        parent_id: itemFormState.parentId || null,
        description: null,
        position: nextPosition(referenceItemsQuery.data?.items ?? []),
      });
      return;
    }

    if (itemFormState.itemId) {
      updateItemMutation.mutate({
        itemId: itemFormState.itemId,
        label,
        description: itemFormState.description.trim() || null,
        position: positionNumber(itemFormState.position),
      });
    }
  }

  function updateReferenceListInline(
    referenceList: ReferenceListRead,
    body: ReferenceListUpdatePayload,
  ) {
    setLocalError(null);
    setSuccessMessage(null);
    setListFormState(null);
    setItemFormState(null);
    updateListMutation.mutate({ listId: referenceList.id, body });
  }

  function handleReferenceItemReorder(reorderedItems: ReferenceItemRead[]) {
    reorderedItems.forEach((item, index) => {
      if (item.position !== index) {
        updateItemMutation.mutate({
          itemId: item.id,
          label: item.label,
          description: item.description,
          position: index,
        });
      }
    });
  }

  function renderReferenceListMetadata(referenceList: ReferenceListRead) {
    const isMutating = updateListMutation.isPending || archiveListMutation.isPending;

    return (
      <div className="reference-meta-grid">
        <label className="reference-meta-control">
          <span>{uiText.referenceListOwnerOrganization}</span>
          <select
            value={referenceList.owner_organization_id ?? ""}
            disabled={isMutating}
            onChange={(event) =>
              updateReferenceListInline(referenceList, {
                owner_organization_id: event.currentTarget.value || null,
              })
            }
          >
            <option value="">{uiText.noOwnerOrganization}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
        <label className="reference-meta-control reference-meta-checkbox">
          <input
            type="checkbox"
            checked={referenceList.inherit_to_descendants}
            disabled={isMutating}
            onChange={(event) =>
              updateReferenceListInline(referenceList, {
                inherit_to_descendants: event.currentTarget.checked,
              })
            }
          />
          <span>{uiText.inheritReferenceListToDescendants}</span>
        </label>
        <label className="reference-meta-control reference-meta-checkbox">
          <input
            type="checkbox"
            checked={referenceList.locked_for_descendants}
            disabled={isMutating}
            onChange={(event) =>
              updateReferenceListInline(referenceList, {
                locked_for_descendants: event.currentTarget.checked,
              })
            }
          />
          <span>{uiText.lockedForDescendants}</span>
        </label>
        <label className="reference-meta-control">
          <span>{uiText.referenceListStatus}</span>
          <select
            value={referenceList.is_active ? "active" : "inactive"}
            disabled={isMutating}
            onChange={(event) => {
              if (event.currentTarget.value === "inactive") {
                setLocalError(null);
                setSuccessMessage(null);
                setListArchiveTarget(referenceList);
              }
            }}
          >
            <option value="active">{activityLabel(true)}</option>
            <option value="inactive">{activityLabel(false)}</option>
          </select>
        </label>
      </div>
    );
  }

  function renderReferenceListForm() {
    if (!listFormState) {
      return null;
    }

    return (
      <AdminMutationForm
        title={
          listFormState.mode === "create" ? uiText.createReferenceList : uiText.editReferenceList
        }
        submitLabel={listFormState.mode === "create" ? uiText.create : uiText.save}
        isSubmitting={createListMutation.isPending || updateListMutation.isPending}
        error={mutationError}
        successMessage={null}
        onCancel={closeListForm}
        onSubmit={handleListFormSubmit}
      >
        <label>
          {uiText.referenceListName}
          <input
            value={listFormState.name}
            onChange={(event) =>
              setListFormState({ ...listFormState, name: event.currentTarget.value })
            }
          />
        </label>
        <label>
          {uiText.referenceListDescription}
          <textarea
            value={listFormState.description}
            onChange={(event) =>
              setListFormState({
                ...listFormState,
                description: event.currentTarget.value,
              })
            }
          />
        </label>
        {listFormState.mode === "create" && (
          <>
            <label>
              {uiText.referenceListOwnerOrganization}
              <select
                value={listFormState.ownerOrganizationId}
                onChange={(event) =>
                  setListFormState({
                    ...listFormState,
                    ownerOrganizationId: event.currentTarget.value,
                  })
                }
              >
                <option value="">{uiText.noOwnerOrganization}</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={listFormState.inheritToDescendants}
                onChange={(event) =>
                  setListFormState({
                    ...listFormState,
                    inheritToDescendants: event.currentTarget.checked,
                  })
                }
              />
              {uiText.inheritReferenceListToDescendants}
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={listFormState.lockedForDescendants}
                onChange={(event) =>
                  setListFormState({
                    ...listFormState,
                    lockedForDescendants: event.currentTarget.checked,
                  })
                }
              />
              {uiText.lockReferenceListForDescendants}
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={listFormState.managedBySystemOnly}
                onChange={(event) =>
                  setListFormState({
                    ...listFormState,
                    managedBySystemOnly: event.currentTarget.checked,
                  })
                }
              />
              {uiText.managedBySystemOnly}
            </label>
          </>
        )}
      </AdminMutationForm>
    );
  }

  function renderReferenceItemForm() {
    if (!itemFormState) {
      return null;
    }

    return (
      <AdminMutationForm
        title={
          itemFormState.mode === "create" ? uiText.createReferenceItem : uiText.editReferenceItem
        }
        submitLabel={itemFormState.mode === "create" ? uiText.create : uiText.save}
        isSubmitting={createItemMutation.isPending || updateItemMutation.isPending}
        error={mutationError}
        successMessage={null}
        onCancel={closeItemForm}
        onSubmit={handleItemFormSubmit}
      >
        <label>
          {uiText.referenceItemLabel}
          <input
            value={itemFormState.label}
            onChange={(event) =>
              setItemFormState({ ...itemFormState, label: event.currentTarget.value })
            }
          />
        </label>
        {itemFormState.mode === "create" && (
          <label>
            {uiText.parentReferenceItem}
            <select
              value={itemFormState.parentId}
              onChange={(event) =>
                setItemFormState({
                  ...itemFormState,
                  parentId: event.currentTarget.value,
                })
              }
            >
              <option value="">{uiText.noParentReferenceItem}</option>
              {referenceItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </AdminMutationForm>
    );
  }

  return (
    <section
      className="reference-workspace reference-workspace-single"
      role="region"
      aria-label={uiText.referenceListCollection}
    >
      <div className="panel-feedback">
        <MutationFeedback
          error={listFormState || itemFormState ? null : mutationError}
          successMessage={successMessage}
        />
      </div>
      <div className="reference-list-toolbar">
        <h3>{uiText.referenceListCollection}</h3>
        <button
          type="button"
          className="primary-button"
          disabled={!selectedRegistryId}
          onClick={openCreateListForm}
        >
          {uiText.createReferenceList}
        </button>
      </div>
      {listFormState?.mode === "create" && (
        <div className="panel-form reference-list-create-slot">{renderReferenceListForm()}</div>
      )}
      <div className="reference-list-cards">
        {referenceLists.length === 0 && <p className="data-empty">{uiText.noData}</p>}
        {referenceLists.map((referenceList) => {
          const isExpanded = referenceList.id === activeReferenceListId;
          return (
            <article
              key={referenceList.id}
              className={["reference-list-card", isExpanded ? "is-expanded" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <header className="reference-list-card-header">
                <button
                  type="button"
                  className="reference-list-card-title"
                  aria-label={referenceList.name}
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setSelectedReferenceListId(referenceList.id);
                    setLocalError(null);
                    setSuccessMessage(null);
                    setListFormState(null);
                    setItemFormState(null);
                  }}
                >
                  <strong>{referenceList.name}</strong>
                  <span>
                    {referenceList.code} / {organizationLabel(referenceList.owner_organization_id)}
                  </span>
                </button>
              </header>
              {isExpanded && (
                <div className="reference-list-card-body">
                  {renderReferenceListMetadata(referenceList)}
                  <div className="reference-items-toolbar">
                    <h3>{uiText.referenceItems}</h3>
                  </div>
                  <ReferenceItemsTable
                    referenceItems={referenceItems}
                    onArchiveReferenceItem={(item) => {
                      setLocalError(null);
                      setSuccessMessage(null);
                      setItemArchiveTarget(item);
                    }}
                    onEditReferenceItem={openEditItemForm}
                    onReorderReferenceItems={handleReferenceItemReorder}
                  />
                  {itemFormState?.mode === "create" ? (
                    <div className="panel-form reference-item-add-slot">
                      {renderReferenceItemForm()}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button reference-item-add-button"
                      aria-label={uiText.addReferenceItem}
                      onClick={openCreateItemForm}
                    >
                      + {uiText.addReferenceItem}
                    </button>
                  )}
                  {itemFormState?.mode === "edit" && (
                    <div className="panel-form reference-item-add-slot">
                      {renderReferenceItemForm()}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {listArchiveTarget && (
        <AdminMutationDialog title={uiText.archiveReferenceList}>
          <ArchiveConfirmation
            entityLabel={uiText.referenceList}
            itemLabel={listArchiveTarget.name}
            isPending={archiveListMutation.isPending}
            onCancel={() => setListArchiveTarget(null)}
            onConfirm={() => archiveListMutation.mutate(listArchiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      {itemArchiveTarget && (
        <AdminMutationDialog title={uiText.archiveReferenceItem}>
          <ArchiveConfirmation
            entityLabel={uiText.referenceItem}
            itemLabel={itemArchiveTarget.label}
            isPending={archiveItemMutation.isPending}
            onCancel={() => setItemArchiveTarget(null)}
            onConfirm={() => archiveItemMutation.mutate(itemArchiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
    </section>
  );
}

function ReferenceItemsTable({
  referenceItems,
  onEditReferenceItem,
  onArchiveReferenceItem,
  onReorderReferenceItems,
}: {
  referenceItems: ReferenceItemRead[];
  onEditReferenceItem: (item: ReferenceItemRead) => void;
  onArchiveReferenceItem: (item: ReferenceItemRead) => void;
  onReorderReferenceItems: (items: ReferenceItemRead[]) => void;
}) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const sortedItems = useMemo(
    () => [...referenceItems].sort((left, right) => left.position - right.position),
    [referenceItems],
  );

  if (referenceItems.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  function handleDrop(targetItem: ReferenceItemRead) {
    if (!draggedItemId || draggedItemId === targetItem.id) {
      setDraggedItemId(null);
      return;
    }

    const draggedItem = sortedItems.find((item) => item.id === draggedItemId);
    if (!draggedItem) {
      setDraggedItemId(null);
      return;
    }

    const withoutDragged = sortedItems.filter((item) => item.id !== draggedItemId);
    const targetIndex = withoutDragged.findIndex((item) => item.id === targetItem.id);
    const nextItems = [...withoutDragged];
    nextItems.splice(Math.max(targetIndex, 0), 0, draggedItem);
    onReorderReferenceItems(nextItems);
    setDraggedItemId(null);
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th aria-label={uiText.dragReferenceItem}></th>
            <th>{uiText.referenceItemLabel}</th>
            <th>{uiText.code}</th>
            <th>{uiText.parentReferenceItem}</th>
            <th>{uiText.status}</th>
            <th>{uiText.action}</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item) => (
            <tr
              key={item.id}
              draggable
              onDragStart={() => setDraggedItemId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(item)}
            >
              <td>
                <button
                  type="button"
                  className="drag-handle"
                  aria-label={`${uiText.dragReferenceItem} ${item.label}`}
                  draggable
                  onDragStart={() => setDraggedItemId(item.id)}
                >
                  ↕
                </button>
              </td>
              <td>{item.label}</td>
              <td>{item.code}</td>
              <td>{item.parent_id ? shortId(item.parent_id) : uiText.none}</td>
              <td>{activityLabel(item.is_active)}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.editReferenceItem} ${item.label}`}
                    onClick={() => onEditReferenceItem(item)}
                  >
                    {uiText.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveReferenceItem} ${item.label}`}
                    onClick={() => onArchiveReferenceItem(item)}
                  >
                    {uiText.moveToArchive}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function invalidateReferenceData(
  queryClient: QueryClient,
  token: string,
  registryId: string,
  referenceListId: string,
) {
  await queryClient.invalidateQueries({ queryKey: ["reference-lists", token, registryId] });
  await queryClient.invalidateQueries({ queryKey: ["reference-items", token, referenceListId] });
  await invalidateRegistryData(queryClient, token);
}

function templateFieldIds(template: CardTemplateRead) {
  const fieldIds = template.field_schema_json?.field_ids;
  if (!Array.isArray(fieldIds)) {
    return [];
  }
  return fieldIds.filter((fieldId): fieldId is string => typeof fieldId === "string");
}

function positionNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function layoutNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(maxVisualColumns, Math.max(1, parsed));
}

function layoutRowNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(maxVisualRows, Math.max(1, parsed));
}

function layoutColumnNumber(value: string) {
  return layoutNumber(value);
}

function clampFieldColumnSpan(span: number, column: number) {
  const safeColumn = Math.min(maxVisualColumns, Math.max(1, column));
  return Math.min(maxVisualColumns - safeColumn + 1, Math.max(1, span));
}

function fieldDisplayConfig(fieldFormState: FieldFormState) {
  const layoutColumn = layoutColumnNumber(fieldFormState.layoutColumn);
  const columnSpan = clampFieldColumnSpan(layoutNumber(fieldFormState.columnSpan), layoutColumn);
  return {
    column_span: columnSpan,
    layout_row: layoutRowNumber(fieldFormState.layoutRow),
    layout_column: layoutColumn,
    label_position: fieldLabelPositions.includes(fieldFormState.labelPosition)
      ? fieldFormState.labelPosition
      : "top",
    separator_style: fieldSeparatorStyles.includes(fieldFormState.separatorStyle)
      ? fieldFormState.separatorStyle
      : "none",
  };
}

function fieldColumnSpan(field: FormFieldRead) {
  return Math.min(maxVisualColumns, Math.max(1, displayConfigNumber(field, "column_span", 1)));
}

function fieldLayoutRow(field: FormFieldRead, fallback: number) {
  return Math.min(maxVisualRows, Math.max(1, displayConfigNumber(field, "layout_row", fallback)));
}

function fieldLayoutColumn(field: FormFieldRead, fallback: number) {
  return Math.min(
    maxVisualColumns,
    Math.max(1, displayConfigNumber(field, "layout_column", fallback)),
  );
}

type VisualFieldItem = {
  field: FormFieldRead;
  row: number;
  column: number;
  columnSpan: number;
};

function visualFieldItems(fields: FormFieldRead[]) {
  return [...fields]
    .sort((left, right) => left.position - right.position)
    .map((field, index): VisualFieldItem => {
      const row = fieldLayoutRow(field, index + 1);
      const column = fieldLayoutColumn(field, 1);
      const columnSpan = Math.min(fieldColumnSpan(field), maxVisualColumns - column + 1);
      return { field, row, column, columnSpan };
    });
}

function visualFieldRows(fields: FormFieldRead[]) {
  const rows = new Map<
    number,
    {
      row: number;
      columns: number;
      fields: VisualFieldItem[];
    }
  >();
  for (const item of visualFieldItems(fields)) {
    const row = rows.get(item.row) ?? { row: item.row, columns: 1, fields: [] };
    row.fields.push(item);
    row.columns = Math.min(
      maxVisualColumns,
      Math.max(row.columns, item.column + item.columnSpan - 1),
    );
    rows.set(item.row, row);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      fields: row.fields.sort(
        (left, right) => left.column - right.column || left.field.position - right.field.position,
      ),
    }))
    .sort((left, right) => left.row - right.row);
}

function sortFieldsByVisualPlacement(fields: FormFieldRead[]) {
  return visualFieldItems(fields)
    .sort(
      (left, right) =>
        left.row - right.row ||
        left.column - right.column ||
        left.field.position - right.field.position,
    )
    .map((item) => item.field);
}

function fieldDisplayConfigWithPlacement(field: FormFieldRead, row: number, column: number) {
  const safeColumn = Math.min(maxVisualColumns, Math.max(1, column));
  const safeSpan = clampFieldColumnSpan(fieldColumnSpan(field), safeColumn);
  return {
    column_span: safeSpan,
    layout_row: Math.min(maxVisualRows, Math.max(1, row)),
    layout_column: safeColumn,
    label_position: displayConfigValue(field, "label_position", "top"),
    separator_style: displayConfigValue(field, "separator_style", "none"),
  };
}

function fieldDisplayConfigWithSpan(field: FormFieldRead, columnSpan: number) {
  const column = fieldLayoutColumn(field, 1);
  return {
    column_span: clampFieldColumnSpan(columnSpan, column),
    layout_row: fieldLayoutRow(field, field.position + 1),
    layout_column: column,
    label_position: displayConfigValue(field, "label_position", "top"),
    separator_style: displayConfigValue(field, "separator_style", "none"),
  };
}

function nextFieldPlacement(fields: FormFieldRead[]) {
  const rows = visualFieldRows(fields);
  if (rows.length === 0) {
    return { row: 1, column: 1 };
  }
  return { row: Math.min(maxVisualRows, Math.max(...rows.map((row) => row.row)) + 1), column: 1 };
}

function nextPosition(items: { position: number }[]) {
  if (items.length === 0) {
    return 0;
  }
  return Math.max(...items.map((item) => item.position)) + 1;
}
