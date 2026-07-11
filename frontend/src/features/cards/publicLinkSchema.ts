import type { FormBlockRead, FormFieldRead } from "@/api/types";

export function eligiblePublicLinkSchema(blocks: FormBlockRead[], fields: FormFieldRead[]) {
  const eligibleFields = fields.filter(
    (field) =>
      field.is_active &&
      field.public_visible &&
      field.public_editable &&
      !["file_ref", "static_text"].includes(field.field_type),
  );
  const eligibleBlockIds = new Set(eligibleFields.map((field) => field.block_id));
  const eligibleBlocks = blocks.filter(
    (block) =>
      block.is_active &&
      block.public_visible &&
      block.public_editable &&
      eligibleBlockIds.has(block.id),
  );
  const allowedBlockIds = new Set(eligibleBlocks.map((block) => block.id));
  return {
    blocks: eligibleBlocks,
    fields: eligibleFields.filter((field) => allowedBlockIds.has(field.block_id)),
  };
}
