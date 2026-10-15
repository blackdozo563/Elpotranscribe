const numbers = new Intl.NumberFormat("fr-FR");
export const number = (value: number) => numbers.format(value);
export function bytes(value: number) {
  const units = [
    "byte",
    "kilobyte",
    "megabyte",
    "gigabyte",
    "terabyte",
  ] as const;
  const index = Math.min(
    4,
    Math.max(0, Math.floor(Math.log10(Math.max(1, value)) / 3)),
  );
  return new Intl.NumberFormat("fr-FR", {
    style: "unit",
    unit: units[index],
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value / 1000 ** index);
}
export const exactDate = (milliseconds: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(milliseconds));
export function checkedDate(milliseconds: number, now = Date.now()) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    return "Date de vérification inconnue";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(milliseconds);
  day.setHours(0, 0, 0, 0);
  const distance = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (distance > 0) return `vérifié le ${exactDate(milliseconds)}`;
  return `vérifié ${Math.abs(distance) <= 7 ? new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" }).format(distance, "day") : `le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" }).format(milliseconds)}`}`;
}
