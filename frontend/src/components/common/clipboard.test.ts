import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("copyTextToClipboard", () => {
  test("uses a temporary selected control when the Clipboard API is unavailable", async () => {
    await copyTextToClipboard("http://localhost/public/edit/token");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
