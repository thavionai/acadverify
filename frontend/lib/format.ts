/**
 * Render a disclosed credential field for display.
 *
 * GPA needs fixing to two decimals. The contract stores `gpaTimes100` as an
 * integer (4.00 is 400), the backend divides by 100, and JavaScript then
 * prints 4 — so a 4.00 average appeared on the verification page as "4".
 * A grade that loses its precision on screen reads as a different number to
 * the person checking it.
 *
 * Everything else is passed through untouched: these are values a verifier is
 * being asked to trust, so formatting must not reinterpret them.
 */
export function formatDisclosedValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";

  if (key === "gpa") {
    const numeric = typeof value === "number" ? value : Number(value);
    // A non-numeric GPA should still be shown rather than silently blanked.
    return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
  }

  return String(value);
}

export function formatLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function truncateMiddle(value: string, visibleChars = 6) {
  if (!value || value.length <= visibleChars * 2 + 1) return value;
  return `${value.slice(0, visibleChars)}\u2026${value.slice(-visibleChars)}`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
