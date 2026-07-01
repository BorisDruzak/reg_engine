import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import {
  archiveFormBlock,
  archiveFormField,
  archiveReferenceItem,
  archiveReferenceList,
  archiveRegistry,
  createFormBlock,
  createFormField,
  createReferenceItem,
  createReferenceList,
  createRegistry,
  listReferenceItems,
  listReferenceLists,
  updateReferenceItem,
  updateReferenceList,
  updateFormBlock,
  updateFormField,
  updateRegistry,
} from "@/api/client";
import type {
  FormBlockRead,
  FormFieldRead,
  OrganizationRead,
  ReferenceItemRead,
  ReferenceListRead,
  RegistryRead,
  RegistrySchemaRead,
} from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import {
  activityLabel,
  booleanLabel,
  fieldTypeLabel,
  lifecycleStatusLabel,
  optionsSourceLabel,
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
  publicVisible: boolean;
  publicEditable: boolean;
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
  const blocksById = useMemo(
    () => new Map((schema?.blocks ?? []).map((block) => [block.id, block])),
    [schema?.blocks],
  );
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
            <>
              <Panel title={uiText.cardSchema}>
                <div className="schema-workspace">
                  <SchemaBlocksPanel
                    blocks={schema?.blocks ?? []}
                    selectedRegistryId={selectedRegistryId}
                    token={token}
                  />
                </div>
              </Panel>
              <Panel title={uiText.schemaFields}>
                <SchemaFieldsPanel
                  blocks={schema?.blocks ?? []}
                  blocksById={blocksById}
                  fields={schema?.fields ?? []}
                  referenceLists={referenceLists}
                  token={token}
                />
              </Panel>
            </>
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

function SchemaBlocksPanel({
  blocks,
  selectedRegistryId,
  token,
}: {
  blocks: FormBlockRead[];
  selectedRegistryId: string;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<BlockFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FormBlockRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const createMutation = useMutation({
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
      setFormState(null);
      setSuccessMessage(uiText.formBlockCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const updateMutation = useMutation({
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
      setFormState(null);
      setSuccessMessage(uiText.formBlockUpdated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (blockId: string) => archiveFormBlock(token, blockId),
    onSuccess: async () => {
      setArchiveTarget(null);
      setSuccessMessage(uiText.formBlockArchived);
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
      blockId: null,
      code: "",
      title: "",
      description: "",
      position: "0",
      isRepeatable: false,
      publicVisible: true,
      publicEditable: false,
    });
  }

  function openEditForm(block: FormBlockRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
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

  function closeForm() {
    setFormState(null);
    setLocalError(null);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState) {
      return;
    }

    const title = formState.title.trim();
    const description = formState.description.trim();
    if (!title) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      createMutation.mutate({
        code: generateTechnicalCode(
          title,
          "block",
          blocks.map((block) => block.code),
        ),
        title,
        description: description || null,
        position: positionNumber(formState.position),
        is_repeatable: formState.isRepeatable,
        public_visible: formState.publicVisible,
        public_editable: formState.publicEditable,
      });
      return;
    }

    if (formState.blockId) {
      updateMutation.mutate({
        blockId: formState.blockId,
        title,
        description: description || null,
        position: positionNumber(formState.position),
      });
    }
  }

  return (
    <div className="stack">
      <div className="panel-toolbar">
        <button
          type="button"
          className="primary-button"
          disabled={!selectedRegistryId}
          onClick={openCreateForm}
        >
          {uiText.createFormBlock}
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
            title={formState.mode === "create" ? uiText.createFormBlock : uiText.editFormBlock}
            submitLabel={formState.mode === "create" ? uiText.create : uiText.save}
            isSubmitting={isFormSubmitting}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleFormSubmit}
          >
            <label>
              {uiText.formBlockTitle}
              <input
                value={formState.title}
                onChange={(event) =>
                  setFormState({ ...formState, title: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.formBlockDescription}
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState({ ...formState, description: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.formBlockPosition}
              <input
                type="number"
                value={formState.position}
                onChange={(event) =>
                  setFormState({ ...formState, position: event.currentTarget.value })
                }
              />
            </label>
            {formState.mode === "create" && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.isRepeatable}
                    onChange={(event) =>
                      setFormState({ ...formState, isRepeatable: event.currentTarget.checked })
                    }
                  />
                  {uiText.repeatableBlock}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.publicVisible}
                    onChange={(event) =>
                      setFormState({ ...formState, publicVisible: event.currentTarget.checked })
                    }
                  />
                  {uiText.publicVisibleBlock}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.publicEditable}
                    onChange={(event) =>
                      setFormState({ ...formState, publicEditable: event.currentTarget.checked })
                    }
                  />
                  {uiText.publicEditableBlock}
                </label>
              </>
            )}
          </AdminMutationForm>
        </div>
      )}
      {archiveTarget && (
        <AdminMutationDialog title={uiText.archiveFormBlock}>
          <ArchiveConfirmation
            entityLabel={uiText.formBlock}
            itemLabel={archiveTarget.title}
            isPending={archiveMutation.isPending}
            onCancel={() => setArchiveTarget(null)}
            onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      <BlocksTable
        blocks={blocks}
        onArchiveBlock={(block) => {
          setLocalError(null);
          setSuccessMessage(null);
          setArchiveTarget(block);
        }}
        onEditBlock={openEditForm}
      />
    </div>
  );
}

function BlocksTable({
  blocks,
  onEditBlock,
  onArchiveBlock,
}: {
  blocks: FormBlockRead[];
  onEditBlock: (block: FormBlockRead) => void;
  onArchiveBlock: (block: FormBlockRead) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.title}</th>
            <th>{uiText.code}</th>
            <th>{uiText.repeatable}</th>
            <th>{uiText.status}</th>
            <th>{uiText.action}</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.id}>
              <td>{block.title}</td>
              <td>{block.code}</td>
              <td>{booleanLabel(block.is_repeatable)}</td>
              <td>{activityLabel(block.is_active)}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.editFormBlock} ${block.title}`}
                    onClick={() => onEditBlock(block)}
                  >
                    {uiText.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveFormBlock} ${block.title}`}
                    onClick={() => onArchiveBlock(block)}
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

async function invalidateRegistryData(queryClient: QueryClient, token: string) {
  await queryClient.invalidateQueries({ queryKey: ["registries", token] });
  await queryClient.invalidateQueries({ queryKey: ["registry-schema", token] });
  await queryClient.invalidateQueries({ queryKey: ["cards", token] });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}

function SchemaFieldsPanel({
  blocks,
  fields,
  blocksById,
  referenceLists,
  token,
}: {
  blocks: FormBlockRead[];
  fields: FormFieldRead[];
  blocksById: Map<string, FormBlockRead>;
  referenceLists: ReferenceListRead[];
  token: string;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<FieldFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FormFieldRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const createMutation = useMutation({
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
        public_visible: payload.public_visible,
        public_editable: payload.public_editable,
      }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.formFieldCreated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: {
      fieldId: string;
      label: string;
      description: string | null;
      position: number;
      required_mode: string;
      is_active: boolean;
    }) =>
      updateFormField(token, payload.fieldId, {
        label: payload.label,
        description: payload.description,
        position: payload.position,
        required_mode: payload.required_mode,
        is_active: payload.is_active,
      }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.formFieldUpdated);
      await invalidateRegistryData(queryClient, token);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (fieldId: string) => archiveFormField(token, fieldId),
    onSuccess: async () => {
      setArchiveTarget(null);
      setSuccessMessage(uiText.formFieldArchived);
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
      fieldId: null,
      blockId: blocks[0]?.id ?? "",
      code: "",
      label: "",
      description: "",
      fieldType: "text",
      position: "0",
      requiredMode: "not_required",
      optionsSourceId: "",
      isActive: true,
      publicVisible: true,
      publicEditable: false,
    });
  }

  function openEditForm(field: FormFieldRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
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
      publicVisible: field.public_visible,
      publicEditable: field.public_editable,
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

    const label = formState.label.trim();
    const blockId = formState.blockId.trim();
    const description = formState.description.trim();
    const optionsSourceId = formState.optionsSourceId.trim();
    if (!label || (formState.mode === "create" && !blockId)) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      const usesReferenceList = referenceBackedFieldTypes.has(formState.fieldType);
      createMutation.mutate({
        blockId,
        code: generateTechnicalCode(
          label,
          "field",
          fields.map((field) => field.code),
        ),
        label,
        field_type: formState.fieldType,
        description: description || null,
        position: positionNumber(formState.position),
        required_mode: formState.requiredMode,
        options_source_type: usesReferenceList && optionsSourceId ? "reference_list" : null,
        options_source_id: usesReferenceList && optionsSourceId ? optionsSourceId : null,
        public_visible: formState.publicVisible,
        public_editable: formState.publicEditable,
      });
      return;
    }

    if (formState.fieldId) {
      updateMutation.mutate({
        fieldId: formState.fieldId,
        label,
        description: description || null,
        position: positionNumber(formState.position),
        required_mode: formState.requiredMode,
        is_active: formState.isActive,
      });
    }
  }

  return (
    <div className="stack">
      <div className="panel-toolbar">
        <button
          type="button"
          className="primary-button"
          disabled={blocks.length === 0}
          onClick={openCreateForm}
        >
          {uiText.createFormField}
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
            title={formState.mode === "create" ? uiText.createFormField : uiText.editFormField}
            submitLabel={formState.mode === "create" ? uiText.create : uiText.save}
            isSubmitting={isFormSubmitting}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleFormSubmit}
          >
            {formState.mode === "create" && (
              <>
                <label>
                  {uiText.formBlock}
                  <select
                    value={formState.blockId}
                    onChange={(event) =>
                      setFormState({ ...formState, blockId: event.currentTarget.value })
                    }
                  >
                    {blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {uiText.formFieldType}
                  <select
                    value={formState.fieldType}
                    onChange={(event) =>
                      setFormState({
                        ...formState,
                        fieldType: event.currentTarget.value,
                        optionsSourceId: referenceBackedFieldTypes.has(event.currentTarget.value)
                          ? formState.optionsSourceId
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
              </>
            )}
            <label>
              {uiText.formFieldLabel}
              <input
                value={formState.label}
                onChange={(event) =>
                  setFormState({ ...formState, label: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.formFieldDescription}
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState({ ...formState, description: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.formFieldPosition}
              <input
                type="number"
                value={formState.position}
                onChange={(event) =>
                  setFormState({ ...formState, position: event.currentTarget.value })
                }
              />
            </label>
            <label>
              {uiText.formFieldRequiredMode}
              <select
                value={formState.requiredMode}
                onChange={(event) =>
                  setFormState({ ...formState, requiredMode: event.currentTarget.value })
                }
              >
                <option value="not_required">{uiText.notRequiredField}</option>
                <option value="required">{uiText.requiredField}</option>
                <option value="required_on_publish">{uiText.requiredOnPublishField}</option>
              </select>
            </label>
            {formState.mode === "create" && (
              <>
                {referenceBackedFieldTypes.has(formState.fieldType) && (
                  <label>
                    {uiText.referenceListForField}
                    <select
                      value={formState.optionsSourceId}
                      onChange={(event) =>
                        setFormState({ ...formState, optionsSourceId: event.currentTarget.value })
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
                <label>
                  <input
                    type="checkbox"
                    checked={formState.publicVisible}
                    onChange={(event) =>
                      setFormState({ ...formState, publicVisible: event.currentTarget.checked })
                    }
                  />
                  {uiText.publicVisibleField}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.publicEditable}
                    onChange={(event) =>
                      setFormState({ ...formState, publicEditable: event.currentTarget.checked })
                    }
                  />
                  {uiText.publicEditableField}
                </label>
              </>
            )}
            {formState.mode === "edit" && (
              <label>
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(event) =>
                    setFormState({ ...formState, isActive: event.currentTarget.checked })
                  }
                />
                {uiText.activeFormField}
              </label>
            )}
          </AdminMutationForm>
        </div>
      )}
      {archiveTarget && (
        <AdminMutationDialog title={uiText.archiveFormField}>
          <ArchiveConfirmation
            entityLabel={uiText.formField}
            itemLabel={archiveTarget.label}
            isPending={archiveMutation.isPending}
            onCancel={() => setArchiveTarget(null)}
            onConfirm={() => archiveMutation.mutate(archiveTarget.id)}
          />
        </AdminMutationDialog>
      )}
      <FieldsTable
        blocksById={blocksById}
        fields={fields}
        onArchiveField={(field) => {
          setLocalError(null);
          setSuccessMessage(null);
          setArchiveTarget(field);
        }}
        onEditField={openEditForm}
      />
    </div>
  );
}

function FieldsTable({
  fields,
  blocksById,
  onEditField,
  onArchiveField,
}: {
  fields: FormFieldRead[];
  blocksById: Map<string, FormBlockRead>;
  onEditField: (field: FormFieldRead) => void;
  onArchiveField: (field: FormFieldRead) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.field}</th>
            <th>{uiText.code}</th>
            <th>{uiText.block}</th>
            <th>{uiText.type}</th>
            <th>{uiText.formFieldRequiredMode}</th>
            <th>{uiText.options}</th>
            <th>{uiText.status}</th>
            <th>{uiText.action}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.id}>
              <td>{field.label}</td>
              <td>{field.code}</td>
              <td>{blocksById.get(field.block_id)?.title ?? shortId(field.block_id)}</td>
              <td>{fieldTypeLabel(field.field_type)}</td>
              <td>{requiredModeLabel(field.required_mode)}</td>
              <td>{optionsSourceLabel(field.options_source_type)}</td>
              <td>{activityLabel(field.is_active)}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.editFormField} ${field.label}`}
                    onClick={() => onEditField(field)}
                  >
                    {uiText.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveFormField} ${field.label}`}
                    onClick={() => onArchiveField(field)}
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
  const activeReferenceList =
    referenceLists.find((referenceList) => referenceList.id === activeReferenceListId) ?? null;
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
    mutationFn: (payload: { listId: string; name: string; description: string | null }) =>
      updateReferenceList(token, payload.listId, {
        name: payload.name,
        description: payload.description,
      }),
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
    onSuccess: async () => {
      setItemFormState(null);
      setSuccessMessage(uiText.referenceItemUpdated);
      await invalidateReferenceData(queryClient, token, selectedRegistryId, activeReferenceListId);
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

  function openEditListForm(referenceList: ReferenceListRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setItemFormState(null);
    setListFormState({
      mode: "edit",
      listId: referenceList.id,
      code: referenceList.code,
      name: referenceList.name,
      description: referenceList.description ?? "",
      ownerOrganizationId: referenceList.owner_organization_id ?? "",
      inheritToDescendants: referenceList.inherit_to_descendants,
      lockedForDescendants: referenceList.locked_for_descendants,
      managedBySystemOnly: referenceList.managed_by_system_only,
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
        name,
        description: description || null,
      });
    }
  }

  function handleItemFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemFormState || !activeReferenceListId) {
      return;
    }

    const label = itemFormState.label.trim();
    const description = itemFormState.description.trim();
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
        description: description || null,
        position: positionNumber(itemFormState.position),
      });
      return;
    }

    if (itemFormState.itemId) {
      updateItemMutation.mutate({
        itemId: itemFormState.itemId,
        label,
        description: description || null,
        position: positionNumber(itemFormState.position),
      });
    }
  }

  return (
    <div className="stack">
      <div className="split-grid">
        <div className="stack">
          <div className="panel-toolbar">
            <button
              type="button"
              className="primary-button"
              disabled={!selectedRegistryId}
              onClick={openCreateListForm}
            >
              {uiText.createReferenceList}
            </button>
          </div>
          <div className="panel-feedback">
            <MutationFeedback
              error={listFormState || itemFormState ? null : mutationError}
              successMessage={successMessage}
            />
          </div>
          {listFormState && (
            <div className="panel-form">
              <AdminMutationForm
                title={
                  listFormState.mode === "create"
                    ? uiText.createReferenceList
                    : uiText.editReferenceList
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
                    <label>
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
                    <label>
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
                    <label>
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
            </div>
          )}
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
          <SelectableList
            items={referenceLists.map((referenceList) => ({
              id: referenceList.id,
              title: referenceList.name,
              detail: `${referenceList.code} / ${organizationLabel(
                referenceList.owner_organization_id,
              )}`,
            }))}
            selectedId={activeReferenceListId}
            onSelect={(referenceListId) => {
              setSelectedReferenceListId(referenceListId);
              setLocalError(null);
              setSuccessMessage(null);
            }}
          />
          <ReferenceListsTable
            organizationLabel={organizationLabel}
            referenceLists={referenceLists}
            onArchiveReferenceList={(referenceList) => {
              setLocalError(null);
              setSuccessMessage(null);
              setListArchiveTarget(referenceList);
            }}
            onEditReferenceList={openEditListForm}
          />
        </div>
        <div className="stack">
          <h3>{uiText.referenceItems}</h3>
          <div className="panel-toolbar">
            <button
              type="button"
              className="primary-button"
              disabled={!activeReferenceList}
              onClick={openCreateItemForm}
            >
              {uiText.createReferenceItem}
            </button>
          </div>
          {itemFormState && (
            <div className="panel-form">
              <AdminMutationForm
                title={
                  itemFormState.mode === "create"
                    ? uiText.createReferenceItem
                    : uiText.editReferenceItem
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
                <label>
                  {uiText.referenceItemDescription}
                  <textarea
                    value={itemFormState.description}
                    onChange={(event) =>
                      setItemFormState({
                        ...itemFormState,
                        description: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                {itemFormState.mode === "create" && (
                  <label>
                    {uiText.parentReferenceItem}
                    <select
                      value={itemFormState.parentId}
                      onChange={(event) =>
                        setItemFormState({ ...itemFormState, parentId: event.currentTarget.value })
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
                <label>
                  {uiText.referenceItemPosition}
                  <input
                    type="number"
                    value={itemFormState.position}
                    onChange={(event) =>
                      setItemFormState({ ...itemFormState, position: event.currentTarget.value })
                    }
                  />
                </label>
              </AdminMutationForm>
            </div>
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
          <ReferenceItemsTable
            referenceItems={referenceItems}
            onArchiveReferenceItem={(item) => {
              setLocalError(null);
              setSuccessMessage(null);
              setItemArchiveTarget(item);
            }}
            onEditReferenceItem={openEditItemForm}
          />
        </div>
      </div>
    </div>
  );
}

function ReferenceListsTable({
  organizationLabel,
  referenceLists,
  onEditReferenceList,
  onArchiveReferenceList,
}: {
  organizationLabel: (organizationId: string | null) => string;
  referenceLists: ReferenceListRead[];
  onEditReferenceList: (referenceList: ReferenceListRead) => void;
  onArchiveReferenceList: (referenceList: ReferenceListRead) => void;
}) {
  if (referenceLists.length === 0) {
    return null;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.referenceListName}</th>
            <th>{uiText.code}</th>
            <th>{uiText.referenceListOwnerOrganization}</th>
            <th>{uiText.inheritReferenceListToDescendants}</th>
            <th>{uiText.lockedForDescendants}</th>
            <th>{uiText.status}</th>
            <th>{uiText.action}</th>
          </tr>
        </thead>
        <tbody>
          {referenceLists.map((referenceList) => (
            <tr key={referenceList.id}>
              <td>{referenceList.name}</td>
              <td>{referenceList.code}</td>
              <td>{organizationLabel(referenceList.owner_organization_id)}</td>
              <td>{booleanLabel(referenceList.inherit_to_descendants)}</td>
              <td>{booleanLabel(referenceList.locked_for_descendants)}</td>
              <td>{activityLabel(referenceList.is_active)}</td>
              <td>
                <div className="row-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.editReferenceList} ${referenceList.name}`}
                    onClick={() => onEditReferenceList(referenceList)}
                  >
                    {uiText.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    aria-label={`${uiText.archiveReferenceList} ${referenceList.name}`}
                    onClick={() => onArchiveReferenceList(referenceList)}
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

function ReferenceItemsTable({
  referenceItems,
  onEditReferenceItem,
  onArchiveReferenceItem,
}: {
  referenceItems: ReferenceItemRead[];
  onEditReferenceItem: (item: ReferenceItemRead) => void;
  onArchiveReferenceItem: (item: ReferenceItemRead) => void;
}) {
  if (referenceItems.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.referenceItemLabel}</th>
            <th>{uiText.code}</th>
            <th>{uiText.parentReferenceItem}</th>
            <th>{uiText.referenceItemPosition}</th>
            <th>{uiText.status}</th>
            <th>{uiText.action}</th>
          </tr>
        </thead>
        <tbody>
          {referenceItems.map((item) => (
            <tr key={item.id}>
              <td>{item.label}</td>
              <td>{item.code}</td>
              <td>{item.parent_id ? shortId(item.parent_id) : uiText.none}</td>
              <td>{item.position}</td>
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

function positionNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
