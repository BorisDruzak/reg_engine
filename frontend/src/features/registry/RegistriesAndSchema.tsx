import { useMemo } from "react";

import type { FormBlockRead, FormFieldRead, RegistryRead, RegistrySchemaRead } from "@/api/types";
import {
  activityLabel,
  booleanLabel,
  fieldTypeLabel,
  lifecycleStatusLabel,
  optionsSourceLabel,
  uiText,
} from "@/app/uiText";
import { Panel, SelectableList } from "@/components/common/DataSurfaces";
import { shortId } from "@/components/common/dataUtils";

export function RegistriesAndSchema({
  registries,
  schema,
  selectedRegistryId,
  onSelectRegistry,
}: {
  registries: RegistryRead[];
  schema: RegistrySchemaRead | null;
  selectedRegistryId: string;
  onSelectRegistry: (registryId: string) => void;
}) {
  const blocksById = useMemo(
    () => new Map((schema?.blocks ?? []).map((block) => [block.id, block])),
    [schema?.blocks],
  );

  return (
    <div className="stack">
      <div className="split-grid">
        <Panel title={uiText.registries}>
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
