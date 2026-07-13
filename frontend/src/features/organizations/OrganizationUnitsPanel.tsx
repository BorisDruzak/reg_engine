import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { archiveOrgUnit, createOrgUnit, listOrgUnits, updateOrgUnit } from "@/api/client";
import type { OrganizationRead, OrgUnitRead, OrgUnitType } from "@/api/types";
import { generateTechnicalCode } from "@/app/technicalCode";
import { activityLabel, organizationUnitsTitle, uiText } from "@/app/uiText";
import {
  AdminMutationDialog,
  AdminMutationForm,
  MutationFeedback,
} from "@/components/common/AdminMutation";
import { DataAlert } from "@/components/common/DataSurfaces";

type UnitFormState = {
  mode: "create" | "edit";
  unit: OrgUnitRead | null;
  unitType: OrgUnitType;
  name: string;
  parentId: string;
};

type Props = {
  organization: OrganizationRead;
  token: string;
  onClose: () => void;
};

export function OrganizationUnitsPanel({ organization, token, onClose }: Props) {
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
  const managements = activeUnits.filter((unit) => unit.type === "management");
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
      setSuccessMessage(uiText.organizationUnitArchived);
      await invalidateUnitData(queryClient, token, organization.id);
    },
  });
  const mutationError = localError
    ? new Error(localError)
    : (createMutation.error ?? updateMutation.error ?? archiveMutation.error);
  const isFormSubmitting = createMutation.isPending || updateMutation.isPending;

  function openCreateForm(unitType: OrgUnitType) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "create",
      unit: null,
      unitType,
      name: "",
      parentId: "",
    });
  }

  function openEditForm(unit: OrgUnitRead) {
    setLocalError(null);
    setSuccessMessage(null);
    setFormState({
      mode: "edit",
      unit,
      unitType: unit.type === "management" ? "management" : "department",
      name: unit.name,
      parentId: unit.parent_id ?? "",
    });
  }

  function closeForm() {
    setFormState(null);
    setLocalError(null);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState) return;

    const name = formState.name.trim();
    if (!name) {
      setLocalError(uiText.requiredFields);
      return;
    }

    setLocalError(null);
    setSuccessMessage(null);
    if (formState.mode === "edit" && formState.unit) {
      updateMutation.mutate({ unitId: formState.unit.id, name });
      return;
    }

    createMutation.mutate({
      code: generateTechnicalCode(
        name,
        "unit",
        units.map((unit) => unit.code),
      ),
      name,
      parent_id: formState.unitType === "management" ? null : formState.parentId || null,
      unit_type: formState.unitType,
    });
  }

  const archiveChildren = archiveTarget
    ? activeUnits.filter(
        (unit) => unit.type === "department" && unit.parent_id === archiveTarget.id,
      )
    : [];

  return (
    <section className="data-panel organization-units-panel">
      <header>
        <h3>{organizationUnitsTitle(organization.name)}</h3>
        <button type="button" className="ghost-button" onClick={onClose}>
          {uiText.close}
        </button>
      </header>
      <div className="panel-toolbar organization-units-toolbar">
        <button
          type="button"
          className="primary-button"
          onClick={() => openCreateForm("management")}
        >
          {uiText.addManagement}
        </button>
        <button type="button" className="ghost-button" onClick={() => openCreateForm("department")}>
          {uiText.addDepartment}
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
            title={
              formState.mode === "create"
                ? formState.unitType === "management"
                  ? uiText.addManagement
                  : uiText.addDepartment
                : uiText.editOrganizationUnit
            }
            submitLabel={formState.mode === "create" ? uiText.create : uiText.save}
            isSubmitting={isFormSubmitting}
            error={mutationError}
            successMessage={null}
            onCancel={closeForm}
            onSubmit={handleFormSubmit}
          >
            <label>
              {uiText.organizationUnitName}
              <input
                value={formState.name}
                onChange={(event) =>
                  setFormState({ ...formState, name: event.currentTarget.value })
                }
              />
            </label>
            {formState.mode === "create" && formState.unitType === "department" && (
              <label>
                {uiText.parentManagement}
                <select
                  value={formState.parentId}
                  onChange={(event) =>
                    setFormState({ ...formState, parentId: event.currentTarget.value })
                  }
                >
                  <option value="">{uiText.noParentManagement}</option>
                  {managements.map((management) => (
                    <option key={management.id} value={management.id}>
                      {management.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
              onEdit={openEditForm}
              onArchive={setArchiveTarget}
            />
          )}
        </>
      )}
    </section>
  );
}

function OrganizationUnitTree({
  units,
  onEdit,
  onArchive,
}: {
  units: OrgUnitRead[];
  onEdit: (unit: OrgUnitRead) => void;
  onArchive: (unit: OrgUnitRead) => void;
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
          onEdit={onEdit}
          onArchive={onArchive}
        />
      ))}
      {rootDepartments.map((department) => (
        <OrganizationUnitTreeNode
          key={department.id}
          unit={department}
          level={1}
          children={[]}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      ))}
    </ul>
  );
}

function OrganizationUnitTreeNode({
  unit,
  level,
  children,
  onEdit,
  onArchive,
}: {
  unit: OrgUnitRead;
  level: number;
  children: OrgUnitRead[];
  onEdit: (unit: OrgUnitRead) => void;
  onArchive: (unit: OrgUnitRead) => void;
}) {
  return (
    <li>
      <div className="organization-unit-row" role="treeitem" aria-level={level}>
        <div className="organization-unit-main">
          <strong>{unit.name}</strong>
          <span className="organization-unit-kind">
            {unit.type === "management" ? uiText.management : uiText.department}
          </span>
          <span>
            {uiText.technicalCode}: {unit.code}
          </span>
        </div>
        <span className="organization-unit-status">{activityLabel(unit.is_active)}</span>
        <div className="row-actions">
          <button
            type="button"
            className="ghost-button"
            aria-label={`${uiText.editOrganizationUnit} ${unit.name}`}
            onClick={() => onEdit(unit)}
          >
            {uiText.edit}
          </button>
          <button
            type="button"
            className="ghost-button"
            aria-label={`${uiText.archiveOrganizationUnit} ${unit.name}`}
            onClick={() => onArchive(unit)}
          >
            {uiText.moveToArchive}
          </button>
        </div>
      </div>
      {children.length > 0 && (
        <ul role="group">
          {children.map((child) => (
            <OrganizationUnitTreeNode
              key={child.id}
              unit={child}
              level={level + 1}
              children={[]}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </ul>
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
