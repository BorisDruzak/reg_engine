import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { archiveRegistry, createRegistry, updateRegistry } from "@/api/client";
import type { FormBlockRead, FormFieldRead, RegistryRead, RegistrySchemaRead } from "@/api/types";
import {
  activityLabel,
  booleanLabel,
  fieldTypeLabel,
  lifecycleStatusLabel,
  optionsSourceLabel,
  uiText,
} from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  ArchiveConfirmation,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { Panel, SelectableList } from "@/components/common/DataSurfaces";
import { shortId } from "@/components/common/dataUtils";

type RegistryFormState = {
  mode: "create" | "edit";
  registryId: string | null;
  code: string;
  name: string;
  description: string;
  lifecycleStatus: string;
};

export function RegistriesAndSchema({
  registries,
  schema,
  selectedRegistryId,
  token,
  onSelectRegistry,
}: {
  registries: RegistryRead[];
  schema: RegistrySchemaRead | null;
  selectedRegistryId: string;
  token: string;
  onSelectRegistry: (registryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<RegistryFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RegistryRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const blocksById = useMemo(
    () => new Map((schema?.blocks ?? []).map((block) => [block.id, block])),
    [schema?.blocks],
  );
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

    const code = formState.code.trim();
    const name = formState.name.trim();
    const description = formState.description.trim();
    if (!name || (formState.mode === "create" && !code)) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "create") {
      createMutation.mutate({
        code,
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
      <div className="split-grid">
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
                {formState.mode === "create" && (
                  <label>
                    {uiText.registryCode}
                    <input
                      value={formState.code}
                      onChange={(event) =>
                        setFormState({ ...formState, code: event.currentTarget.value })
                      }
                    />
                  </label>
                )}
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
        <Panel title={uiText.schemaBlocks}>
          <BlocksTable blocks={schema?.blocks ?? []} />
        </Panel>
      </div>
      <Panel title={uiText.schemaFields}>
        <FieldsTable fields={schema?.fields ?? []} blocksById={blocksById} />
      </Panel>
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
                    onClick={() => onEditRegistry(registry)}
                  >
                    {uiText.editRegistry} {registry.name}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onArchiveRegistry(registry)}
                  >
                    {uiText.archiveRegistry} {registry.name}
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

function BlocksTable({ blocks }: { blocks: FormBlockRead[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText.title}</th>
            <th>{uiText.code}</th>
            <th>{uiText.repeatable}</th>
            <th>{uiText.status}</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.id}>
              <td>{block.title}</td>
              <td>{block.code}</td>
              <td>{booleanLabel(block.is_repeatable)}</td>
              <td>{activityLabel(block.is_active)}</td>
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

function FieldsTable({
  fields,
  blocksById,
}: {
  fields: FormFieldRead[];
  blocksById: Map<string, FormBlockRead>;
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
            <th>{uiText.options}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.id}>
              <td>{field.label}</td>
              <td>{field.code}</td>
              <td>{blocksById.get(field.block_id)?.title ?? shortId(field.block_id)}</td>
              <td>{fieldTypeLabel(field.field_type)}</td>
              <td>{optionsSourceLabel(field.options_source_type)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
