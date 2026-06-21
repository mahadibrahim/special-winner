export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}
