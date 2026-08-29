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
