import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { archiveOrgUnit, createOrgUnit, listOrgUnits, updateOrgUnit } from "@/api/client";
import type { OrganizationRead, OrgUnitRead, OrgUnitType } from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { activityLabel, uiText } from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { DataAlert } from "@/components/common/DataSurfaces";

type UnitFormState = {
  createRequestId: number | null;
  mode: "create" | "edit";
  unit: OrgUnitRead | null;
  unitType: OrgUnitType;
  name: string;
  parentId: string;
};

type Props = {
  organization: OrganizationRead;
  token: string;
  createUnitRequest: { requestId: number; unitType: OrgUnitType } | null;
  onCreateUnitRequestConsumed: () => void;
};

export function OrganizationUnitsPanel({
  organization,
  token,
  createUnitRequest,
  onCreateUnitRequestConsumed,
}: Props) {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<UnitFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<OrgUnitRead | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const unitsQuery = useQuery({
    queryKey: ["organization-org-units", token, organization.id],
    queryFn: () => listOrgUnits(token, organization.id),
  });
  const units = (unitsQuery.data?.items ?? []).filter(
    (unit) => unit.organization_id === organization.id,
  );
  const activeUnits = units.filter((unit) => unit.is_active);
  const createMutation = useMutation({
    mutationFn: (payload: {
      code: string;
      name: string;
      parent_id: string | null;
      unit_type: OrgUnitType;
    }) => createOrgUnit(token, organization.id, payload),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.organizationUnitCreated);
      await invalidateUnitData(queryClient, token, organization.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { unitId: string; name: string }) =>
      updateOrgUnit(token, payload.unitId, { name: payload.name }),
    onSuccess: async () => {
      setFormState(null);
      setSuccessMessage(uiText.organizationUnitUpdated);
      await invalidateUnitData(queryClient, token, organization.id);
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (unitId: string) => archiveOrgUnit(token, unitId),
    onSuccess: async () => {
      setArchiveTarget(null);
      setFormState(null);
      setSuccessMessage(uiText.organizationUnitArchived);
      await invalidateUnitData(queryClient, token, organization.id);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? updateMutation.error ?? archiveMutation.error);
  const isFormSubmitting = createMutation.isPending || updateMutation.isPending;
  const requestedCreateForm = createUnitRequest
    ? {
        createRequestId: createUnitRequest.requestId,
        mode: "create" as const,
        unit: null,
        unitType: createUnitRequest.unitType,
        name: "",
        parentId: "",
      }
    : null;
  const activeFormState =
    requestedCreateForm && formState?.createRequestId !== requestedCreateForm.createRequestId
      ? requestedCreateForm
      : (formState ?? requestedCreateForm);

  function openEditForm(unit: OrgUnitRead) {
    onCreateUnitRequestConsumed();
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      createRequestId: null,
      mode: "edit",
      unit,
      unitType: unit.type,
      name: unit.name,
      parentId: unit.parent_id ?? "",
    });
  }

  function openChildDepartmentForm(management: OrgUnitRead) {
    onCreateUnitRequestConsumed();
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      createRequestId: null,
      mode: "create",
      unit: null,
      unitType: "department",
      name: "",
      parentId: management.id,
    });
  }

  function closeForm() {
    setFormState(null);
    setLocalError(null);
    onCreateUnitRequestConsumed();
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeFormState) return;

    const name = activeFormState.name.trim();
    if (!name) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (activeFormState.mode === "edit" && activeFormState.unit) {
      updateMutation.mutate({ unitId: activeFormState.unit.id, name });
      return;
    }

    onCreateUnitRequestConsumed();
    createMutation.mutate({
      code: generateTechnicalCode(
        name,
        "unit",
        units.map((unit) => unit.code),
      ),
      name,
      parent_id:
        activeFormState.unitType === "management" ? null : activeFormState.parentId || null,
      unit_type: activeFormState.unitType,
    });
  }

  const archiveChildren = archiveTarget
    ? activeUnits.filter(
        (unit) => unit.type === "department" && unit.parent_id === archiveTarget.id,
      )
    : [];
  const editingUnit = activeFormState?.mode === "edit" ? activeFormState.unit : null;

  return (
    <section className="organization-units-panel">
      <div className="panel-feedback">
        <MutationFeedback
          error={activeFormState ? null : mutationError}
          successMessage={successMessage}
        />
      </div>
      {activeFormState?.mode === "create" && (
        <div className="panel-form">
          <AdminMutationForm
            title={
              activeFormState.unitType === "management"
                ? uiText.addManagement
                : uiText.addDepartment
            }
            submitLabel={uiText.create}
            isSubmitting={isFormSubmitting}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleFormSubmit}
          >
            <label>
              {uiText.organizationUnitName}
              <input
                value={activeFormState.name}
                onChange={(event) =>
                  setFormState({ ...activeFormState, name: event.currentTarget.value })
                }
              />
            </label>
          </AdminMutationForm>
        </div>
      )}
      {archiveTarget && (
        <AdminMutationDialog
          title={uiText.archiveOrganizationUnit}
          onCancel={() => setArchiveTarget(null)}
        >
          <div className="archive-confirmation">
            <p>
              {uiText.organizationUnit}: {archiveTarget.name}
            </p>
            {archiveChildren.length > 0 && (
              <>
                <p>{uiText.archiveManagementChildren}</p>
                <ul className="organization-unit-archive-children">
                  {archiveChildren.map((child) => (
                    <li key={child.id}>{child.name}</li>
                  ))}
                </ul>
              </>
            )}
            <p>{uiText.archiveOrganizationUnitConfirmation}</p>
            <div className="admin-mutation-actions">
              <button type="button" className="ghost-button" onClick={() => setArchiveTarget(null)}>
                {uiText.cancel}
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={archiveMutation.isPending}
                onClick={() => archiveMutation.mutate(archiveTarget.id)}
              >
                {archiveMutation.isPending ? uiText.archiving : uiText.archive}
              </button>
            </div>
          </div>
        </AdminMutationDialog>
      )}
      {unitsQuery.isLoading ? (
        <p className="data-empty">{uiText.loading}</p>
      ) : (
        <>
          <DataAlert error={unitsQuery.error} />
          {!unitsQuery.error && (
            <OrganizationUnitTree
              units={activeUnits}
              editingUnit={editingUnit}
              editName={activeFormState?.mode === "edit" ? activeFormState.name : ""}
              editError={mutationError}
              isEditSubmitting={updateMutation.isPending}
              onCancelEdit={closeForm}
              onChangeEditName={(name) =>
                setFormState((current) => (current ? { ...current, name } : current))
              }
              onCreateChildDepartment={openChildDepartmentForm}
              onEdit={openEditForm}
              onArchive={setArchiveTarget}
              onSubmitEdit={handleFormSubmit}
            />
          )}
        </>
      )}
    </section>
  );
}

function OrganizationUnitTree({
  units,
  editingUnit,
  editName,
  editError,
  isEditSubmitting,
  onCancelEdit,
  onChangeEditName,
  onCreateChildDepartment,
  onEdit,
  onArchive,
  onSubmitEdit,
}: {
  units: OrgUnitRead[];
  editingUnit: OrgUnitRead | null;
  editName: string;
  editError: unknown;
  isEditSubmitting: boolean;
  onCancelEdit: () => void;
  onChangeEditName: (name: string) => void;
  onCreateChildDepartment: (management: OrgUnitRead) => void;
  onEdit: (unit: OrgUnitRead) => void;
  onArchive: (unit: OrgUnitRead) => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const managements = units.filter((unit) => unit.type === "management");
  const rootDepartments = units.filter(
    (unit) => unit.type === "department" && unit.parent_id === null,
  );
  if (managements.length === 0 && rootDepartments.length === 0) {
    return <p className="data-empty">{uiText.noData}</p>;
  }

  return (
    <ul className="organization-unit-tree" role="tree" aria-label={uiText.organizationUnitTree}>
      {managements.map((management) => (
        <OrganizationUnitTreeNode
          key={management.id}
          unit={management}
          level={1}
          children={units.filter(
            (unit) => unit.type === "department" && unit.parent_id === management.id,
          )}
          editingUnit={editingUnit}
          editName={editName}
          editError={editError}
          isEditSubmitting={isEditSubmitting}
          onCancelEdit={onCancelEdit}
          onChangeEditName={onChangeEditName}
          onCreateChildDepartment={onCreateChildDepartment}
          onEdit={onEdit}
          onArchive={onArchive}
          onSubmitEdit={onSubmitEdit}
        />
      ))}
      {rootDepartments.map((department) => (
        <OrganizationUnitTreeNode
          key={department.id}
          unit={department}
          level={1}
          children={[]}
          editingUnit={editingUnit}
          editName={editName}
          editError={editError}
          isEditSubmitting={isEditSubmitting}
          onCancelEdit={onCancelEdit}
          onChangeEditName={onChangeEditName}
          onCreateChildDepartment={onCreateChildDepartment}
          onEdit={onEdit}
          onArchive={onArchive}
          onSubmitEdit={onSubmitEdit}
        />
      ))}
    </ul>
  );
}

function OrganizationUnitTreeNode({
  unit,
  level,
  children,
  editingUnit,
  editName,
  editError,
  isEditSubmitting,
  onCancelEdit,
  onChangeEditName,
  onCreateChildDepartment,
  onEdit,
  onArchive,
  onSubmitEdit,
}: {
  unit: OrgUnitRead;
  level: number;
  children: OrgUnitRead[];
  editingUnit: OrgUnitRead | null;
  editName: string;
  editError: unknown;
  isEditSubmitting: boolean;
  onCancelEdit: () => void;
  onChangeEditName: (name: string) => void;
  onCreateChildDepartment: (management: OrgUnitRead) => void;
  onEdit: (unit: OrgUnitRead) => void;
  onArchive: (unit: OrgUnitRead) => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isEditing = editingUnit?.id === unit.id;
  const isManagement = unit.type === "management";
  const canToggleChildren = isManagement;

  function toggleChildren() {
    if (canToggleChildren) {
      setIsExpanded((expanded) => !expanded);
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      !canToggleChildren ||
      event.target !== event.currentTarget ||
      (event.key !== "Enter" && event.key !== " ")
    ) {
      return;
    }
    event.preventDefault();
    toggleChildren();
  }

  return (
    <li>
      <div
        className={[
          "organization-unit-row",
          canToggleChildren ? "organization-unit-row-expandable" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="treeitem"
        aria-level={level}
        aria-expanded={canToggleChildren ? isExpanded : undefined}
        tabIndex={canToggleChildren ? 0 : undefined}
        onClick={toggleChildren}
        onKeyDown={handleRowKeyDown}
      >
        {isEditing ? (
          <form
            className="organization-unit-inline-name-form"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onSubmit={onSubmitEdit}
          >
            <label>
              {uiText.organizationUnitName}
              <input
                autoFocus
                value={editName}
                onChange={(event) => onChangeEditName(event.currentTarget.value)}
              />
            </label>
            <div className="organization-unit-inline-name-actions">
              <button type="submit" className="primary-button" disabled={isEditSubmitting}>
                {isEditSubmitting ? uiText.saving : uiText.save}
              </button>
              <button type="button" className="ghost-button" onClick={onCancelEdit}>
                {uiText.cancel}
              </button>
              <button type="button" className="danger-button" onClick={() => onArchive(unit)}>
                {uiText.moveToArchive}
              </button>
            </div>
            <MutationFeedback error={editError} successMessage={null} />
          </form>
        ) : (
          <div className="organization-unit-main">
            <button
              type="button"
              className="organization-unit-name"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(unit);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {unit.name}
            </button>
            <span className="organization-unit-kind">
              {unit.type === "management" ? uiText.management : uiText.department}
            </span>
          </div>
        )}
        {!isEditing && (
          <span className="organization-unit-status">{activityLabel(unit.is_active)}</span>
        )}
      </div>
      {isManagement && isExpanded && (
        <>
          <ul role="group">
            {children.map((child) => (
              <OrganizationUnitTreeNode
                key={child.id}
                unit={child}
                level={level + 1}
                children={[]}
                editingUnit={editingUnit}
                editName={editName}
                editError={editError}
                isEditSubmitting={isEditSubmitting}
                onCancelEdit={onCancelEdit}
                onChangeEditName={onChangeEditName}
                onCreateChildDepartment={onCreateChildDepartment}
                onEdit={onEdit}
                onArchive={onArchive}
                onSubmitEdit={onSubmitEdit}
              />
            ))}
          </ul>
          <button
            type="button"
            className="ghost-button"
            onClick={(event) => {
              event.stopPropagation();
              onCreateChildDepartment(unit);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {uiText.addDepartment}
          </button>
        </>
      )}
    </li>
  );
}

async function invalidateUnitData(
  queryClient: ReturnType<typeof useQueryClient>,
  token: string,
  organizationId: string,
) {
  await queryClient.invalidateQueries({
    queryKey: ["organization-org-units", token, organizationId],
  });
  await queryClient.invalidateQueries({ queryKey: ["audit-events", token] });
}
