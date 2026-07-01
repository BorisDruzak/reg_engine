const transliterationMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ы: "y",
  э: "e",
  ю: "yu",
  я: "ya",
  ь: "",
  ъ: "",
};

export function generateTechnicalCode(
  source: string,
  prefix: string,
  existingCodes: Iterable<string> = [],
) {
  const fallback = normalizeTechnicalCode(prefix) || "item";
  const normalizedSource = normalizeTechnicalCode(source) || fallback;
  const base = /^\d/.test(normalizedSource) ? `${fallback}_${normalizedSource}` : normalizedSource;
  const usedCodes = new Set(
    Array.from(existingCodes, (code) => code.trim().toLowerCase()).filter(Boolean),
  );
  let candidate = base;
  let suffix = 2;
  while (usedCodes.has(candidate.toLowerCase())) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeTechnicalCode(value: string) {
  return Array.from(value.trim())
    .map((character) => transliterationMap[character.toLowerCase()] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
