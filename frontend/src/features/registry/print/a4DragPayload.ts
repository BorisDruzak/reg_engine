export const A4_FIELD_DRAG_TYPE = "application/x-reg-engine-field-id";
export const A4_BLOCK_DRAG_TYPE = "application/x-reg-engine-block-id";

export type A4DragPayload = {
  kind: "field" | "block";
  id: string;
};

let currentPayload: A4DragPayload | null = null;

export function setA4DragPayload(payload: A4DragPayload) {
  currentPayload = payload;
}

export function getA4DragPayload() {
  return currentPayload;
}

export function clearA4DragPayload() {
  currentPayload = null;
}

export function encodeA4DragPayload(payload: A4DragPayload) {
  return `${payload.kind}:${payload.id}`;
}

export function decodeA4DragPayload(value: string): A4DragPayload | null {
  if (value.startsWith("field:")) {
    return { kind: "field", id: value.slice("field:".length) };
  }
  if (value.startsWith("block:")) {
    return { kind: "block", id: value.slice("block:".length) };
  }
  return null;
}
