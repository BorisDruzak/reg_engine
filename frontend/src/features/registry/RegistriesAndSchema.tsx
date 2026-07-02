import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

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
  isActive: boolean;
  isListDisplay: boolean;
  publicVisible: boolean;
  publicEditable: boolean;
};

type CardTemplateFormState = {
  mode: "create" | "edit";
  templateId: string | null;
  code: string;
  name: string;
  description: string;
  position: string;
  fieldIds: string[];
  defaultValues: Record<string, string>;
  isActive: boolean;
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
];

const referenceBackedFieldTypes = new Set(["select", "multi_select"]);

type RegistryWorkspaceTab = "registries" | "schema" | "references" | "importExport" | "reports";

const registryWorkspaceTabs: { id: RegistryWorkspaceTab; label: string }[] = [
  { id: "registries", label: uiText.registries },
  { id: "schema", label: uiText.cardSchema },
  { id: "references", label: uiText.referenceLists },
  { id: "importExport", label: uiText.importExport },
  { id: "reports", label: uiText.reports },
];

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
  const [blockArchiveTarget, setBlockArchiveTarget] = useState<FormBlockRead | null>(null);
  const [fieldArchiveTarget, setFieldArchiveTarget] = useState<FormFieldRead | null>(null);
  const [templateArchiveTarget, setTemplateArchiveTarget] = useState<CardTemplateRead | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const sortedBlocks = useMemo(
    () => [...blocks].sort((left, right) => left.position - right.position),
    [blocks],
  );
  const fieldsByBlockId = useMemo(() => {
    const grouped = new Map<string, FormFieldRead[]>();
    for (const field of fields) {
      const blockFields = grouped.get(field.block_id) ?? [];
      blockFields.push(field);
      grouped.set(field.block_id, blockFields);
    }
    for (const blockFields of grouped.values()) {
      blockFields.sort((left, right) => left.position - right.position);
    }
    return grouped;
  }, [fields]);
  const sortedTemplates = useMemo(
    () => [...templates].sort((left, right) => left.position - right.position),
    [templates],
  );
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
        is_list_display: payload.is_list_display,
        public_visible: payload.public_visible,
        public_editable: payload.public_editable,
      }),
    onSuccess: async () => {
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
      is_active: boolean;
      is_list_display: boolean;
    }) =>
      updateFormField(token, payload.fieldId, {
        label: payload.label,
        description: payload.description,
        position: payload.position,
        required_mode: payload.required_mode,
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
    onSuccess: async () => {
      setTemplateFormState(null);
      setSuccessMessage(uiText.cardTemplateCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const updateTemplateMutation = useMutation({
    mutationFn: (payload: {
      templateId: string;
      name: string;
      description: string | null;
      position: number;
      field_schema_json: { field_ids: string[] };
      default_values_json: { field_id: string; value: unknown }[];
      is_active: boolean;
    }) =>
      updateCardTemplate(token, payload.templateId, {
        name: payload.name,
        description: payload.description,
        position: payload.position,
        field_schema_json: payload.field_schema_json,
        default_values_json: payload.default_values_json,
        is_active: payload.is_active,
      }),
    onSuccess: async () => {
      setTemplateFormState(null);
      setSuccessMessage(uiText.cardTemplateUpdated);
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
    mutationFn: (updates: { fieldId: string; position: number }[]) =>
      Promise.all(
        updates.map((update) =>
          updateFormField(token, update.fieldId, {
            position: update.position,
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
      updateTemplateMutation.error ??
      archiveTemplateMutation.error ??
      reorderFieldMutation.error ??
      archiveFieldMutation.error);
  const isBlockFormSubmitting = createBlockMutation.isPending || updateBlockMutation.isPending;
  const isFieldFormSubmitting = createFieldMutation.isPending || updateFieldMutation.isPending;
  const isTemplateFormSubmitting =
    createTemplateMutation.isPending || updateTemplateMutation.isPending;

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

  function closeBlockForm() {
    setBlockFormState(null);
    setLocalError(null);
  }

  function openCreateFieldForm(blockId: string) {
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
      isActive: field.is_active,
      isListDisplay: field.is_list_display,
      publicVisible: field.public_visible,
      publicEditable: field.public_editable,
    });
  }

  function closeFieldForm() {
    setFieldFormState(null);
    setLocalError(null);
  }

  function openCreateTemplateForm() {
    setLocalError(null);
    setSuccessMessage(null);
    setBlockFormState(null);
    setFieldFormState(null);
    setTemplateFormState({
      mode: "create",
      templateId: null,
      code: "",
      name: "",
      description: "",
      position: String(nextPosition(templates)),
      fieldIds: [],
      defaultValues: {},
      isActive: true,
    });
  }

  function openEditTemplateForm(template: CardTemplateRead) {
    const fieldIds = templateFieldIds(template);
    setLocalError(null);
    setSuccessMessage(null);
    setBlockFormState(null);
    setFieldFormState(null);
    setTemplateFormState({
      mode: "edit",
      templateId: template.id,
      code: template.code,
      name: template.name,
      description: template.description ?? "",
      position: String(template.position),
      fieldIds,
      defaultValues: Object.fromEntries(
        template.default_values_json
          .filter((item) => typeof item.field_id === "string")
          .map((item) => [item.field_id, String(item.value ?? "")]),
      ),
      isActive: template.is_active,
    });
  }

  function closeTemplateForm() {
    setTemplateFormState(null);
    setLocalError(null);
  }

  function toggleTemplateField(fieldId: string) {
    if (!templateFormState) {
      return;
    }
    const isSelected = templateFormState.fieldIds.includes(fieldId);
    setTemplateFormState({
      ...templateFormState,
      fieldIds: isSelected
        ? templateFormState.fieldIds.filter((selectedId) => selectedId !== fieldId)
        : [...templateFormState.fieldIds, fieldId],
    });
  }

  function updateTemplateDefaultValue(fieldId: string, value: string) {
    if (!templateFormState) {
      return;
    }
    setTemplateFormState({
      ...templateFormState,
      defaultValues: {
        ...templateFormState.defaultValues,
        [fieldId]: value,
      },
    });
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
        required_mode: fieldFormState.requiredMode,
        options_source_type: usesReferenceList && optionsSourceId ? "reference_list" : null,
        options_source_id: usesReferenceList && optionsSourceId ? optionsSourceId : null,
        is_list_display: fieldFormState.isListDisplay,
        public_visible: fieldFormState.publicVisible,
        public_editable: fieldFormState.publicEditable,
      });
      return;
    }

    if (fieldFormState.fieldId) {
      updateFieldMutation.mutate({
        fieldId: fieldFormState.fieldId,
        label,
        description: fieldFormState.description || null,
        position: positionNumber(fieldFormState.position),
        required_mode: fieldFormState.requiredMode,
        is_active: fieldFormState.isActive,
        is_list_display: fieldFormState.isListDisplay,
      });
    }
  }

  function handleTemplateFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!templateFormState) {
      return;
    }
    const name = templateFormState.name.trim();
    if (!name || templateFormState.fieldIds.length === 0) {
      setLocalError(uiText.requiredFields);
      return;
    }
    const description = templateFormState.description.trim();
    const payload = {
      name,
      description: description || null,
      position: positionNumber(templateFormState.position),
      field_schema_json: {
        field_ids: templateFormState.fieldIds,
      },
      default_values_json: templateFormState.fieldIds
        .map((fieldId) => ({
          field_id: fieldId,
          value: templateFormState.defaultValues[fieldId]?.trim() ?? "",
        }))
        .filter((item) => item.value !== ""),
    };

    setLocalError(null);
    setSuccessMessage(null);
    if (templateFormState.mode === "create") {
      createTemplateMutation.mutate({
        ...payload,
        code: generateTechnicalCode(
          name,
          "template",
          templates.map((template) => template.code),
        ),
      });
      return;
    }
    if (templateFormState.templateId) {
      updateTemplateMutation.mutate({
        ...payload,
        templateId: templateFormState.templateId,
        is_active: templateFormState.isActive,
      });
    }
  }

  function handleFieldDrop(blockFields: FormFieldRead[], targetFieldId: string) {
    if (!draggedFieldId || draggedFieldId === targetFieldId) {
      setDraggedFieldId(null);
      return;
    }
    const draggedIndex = blockFields.findIndex((field) => field.id === draggedFieldId);
    const targetIndex = blockFields.findIndex((field) => field.id === targetFieldId);
    if (draggedIndex < 0 || targetIndex < 0) {
      setDraggedFieldId(null);
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
    setDraggedFieldId(null);
    if (updates.length === 0) {
      return;
    }
    setLocalError(null);
    setSuccessMessage(null);
    reorderFieldMutation.mutate(updates);
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
      </AdminMutationForm>
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
        </div>
        <div className="schema-field-options">
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
      </AdminMutationForm>
    );
  }

  function renderTemplateForm() {
    if (!templateFormState) {
      return null;
    }

    return (
      <AdminMutationForm
        title={
          templateFormState.mode === "create" ? uiText.createCardTemplate : uiText.editCardTemplate
        }
        submitLabel={templateFormState.mode === "create" ? uiText.create : uiText.save}
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
          {templateFormState.mode === "edit" && (
            <label>
              <span>{uiText.status}</span>
              <select
                value={templateFormState.isActive ? "active" : "archived"}
                onChange={(event) =>
                  setTemplateFormState({
                    ...templateFormState,
                    isActive: event.currentTarget.value === "active",
                  })
                }
              >
                <option value="active">{activityLabel(true)}</option>
                <option value="archived">{activityLabel(false)}</option>
              </select>
            </label>
          )}
        </div>
        <div className="card-template-field-list" role="group" aria-label={uiText.templateFields}>
          {[...fields]
            .filter((field) => field.is_active)
            .sort(
              (left, right) =>
                left.position - right.position || left.label.localeCompare(right.label),
            )
            .map((field) => {
              const isSelected = templateFormState.fieldIds.includes(field.id);
              return (
                <div className="card-template-field-row" key={field.id}>
                  <label className="checkbox-control">
                    <input
                      type="checkbox"
                      aria-label={`${uiText.templateField} ${field.label}`}
                      checked={isSelected}
                      onChange={() => toggleTemplateField(field.id)}
                    />
                    <span>{field.label}</span>
                  </label>
                  {isSelected && (
                    <label>
                      <span>
                        {uiText.templateDefaultValue}: {field.label}
                      </span>
                      <input
                        aria-label={`${uiText.templateDefaultValue}: ${field.label}`}
                        value={templateFormState.defaultValues[field.id] ?? ""}
                        onChange={(event) =>
                          updateTemplateDefaultValue(field.id, event.currentTarget.value)
                        }
                      />
                    </label>
                  )}
                </div>
              );
            })}
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
              const isEditingTemplate =
                templateFormState?.mode === "edit" && templateFormState.templateId === template.id;
              return (
                <article
                  key={template.id}
                  className={[
                    "card-template-card",
                    isEditingTemplate ? "is-expanded" : "",
                    !template.is_active ? "is-archived" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
                        aria-label={`${uiText.editCardTemplate} ${template.name}`}
                        onClick={() => openEditTemplateForm(template)}
                      >
                        {uiText.edit}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        aria-label={`${uiText.archiveCardTemplate} ${template.name}`}
                        onClick={() => setTemplateArchiveTarget(template)}
                      >
                        {uiText.moveToArchive}
                      </button>
                    </div>
                  </header>
                  {isEditingTemplate && (
                    <div className="panel-form card-template-form-panel">
                      {renderTemplateForm()}
                    </div>
                  )}
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
      <div className="schema-canvas">
        {sortedBlocks.map((block) => {
          const blockFields = fieldsByBlockId.get(block.id) ?? [];
          return (
            <article key={block.id} className="schema-block-card">
              <header className="schema-block-header">
                <div>
                  <h3>{block.title}</h3>
                  <span>{`${uiText.technicalCode}: ${block.code}`}</span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.editFormBlock} ${block.title}`}
                    onClick={() => openEditBlockForm(block)}
                  >
                    {uiText.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveFormBlock} ${block.title}`}
                    onClick={() => {
                      setLocalError(null);
                      setSuccessMessage(null);
                      setBlockArchiveTarget(block);
                    }}
                  >
                    {uiText.moveToArchive}
                  </button>
                </div>
              </header>
              {blockFormState?.mode === "edit" && blockFormState.blockId === block.id && (
                <div className="panel-form schema-block-inline-form">{renderBlockForm()}</div>
              )}
              <div className="schema-field-list">
                {blockFields.length === 0 && <p className="data-empty">{uiText.noFieldsInBlock}</p>}
                {blockFields.map((field) => {
                  const isEditingField =
                    fieldFormState?.mode === "edit" && fieldFormState.fieldId === field.id;
                  return (
                    <div
                      key={field.id}
                      className={[
                        "schema-field-row",
                        draggedFieldId === field.id ? "is-dragging" : "",
                        isEditingField ? "is-expanded" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => handleFieldDrop(blockFields, field.id)}
                    >
                      <button
                        type="button"
                        className="drag-handle schema-drag-handle"
                        aria-label={`Перетащить поле ${field.label}`}
                        draggable
                        onDragStart={(event) => {
                          if (event.dataTransfer) {
                            event.dataTransfer.effectAllowed = "move";
                          }
                          setDraggedFieldId(field.id);
                        }}
                        onDragEnd={() => setDraggedFieldId(null)}
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
                      <span className="schema-field-code">{`${uiText.technicalCode}: ${field.code}`}</span>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          aria-label={`${uiText.editFormField} ${field.label}`}
                          onClick={() => openEditFieldForm(field)}
                        >
                          {uiText.edit}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          aria-label={`${uiText.archiveFormField} ${field.label}`}
                          onClick={() => {
                            setLocalError(null);
                            setSuccessMessage(null);
                            setFieldArchiveTarget(field);
                          }}
                        >
                          {uiText.moveToArchive}
                        </button>
                      </div>
                      {isEditingField && (
                        <div className="schema-field-inline-form">
                          <div className="panel-form schema-field-form-panel">
                            {renderFieldForm()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

function nextPosition(items: { position: number }[]) {
  if (items.length === 0) {
    return 0;
  }
  return Math.max(...items.map((item) => item.position)) + 1;
}
