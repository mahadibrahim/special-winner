/**
 * Pure CSV builder for the admin "download orders" export (Task 4.4).
 * One row per order item — personalization name/number are flattened into
 * their own columns since a CSV row can't hold nested structure.
 */
export interface CsvRow {
  email: string;
  productName: string;
  size: string | null;
  personalization: { name?: string; number?: string } | null;
  quantity: number;
  status: string;
  // Order-level shipping fields (Task 4.2) — only populated for self-shipped
  // orders the org has marked shipped; blank for pickup/other statuses.
  carrier?: string | null;
  service?: string | null;
  trackingNumber?: string | null;
  // Bundle name this line was part of at checkout (Task 4.2) — blank for
  // non-bundle lines. Snapshotted on the order item, so it survives bundle edits/deletes.
  bundle?: string | null;
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildOrdersCsv(rows: CsvRow[]): string {
  const header = "email,product,size,name,number,quantity,status,carrier,service,tracking,bundle";
  const body = rows
    .map((r) =>
      [
        r.email,
        r.productName,
        r.size ?? "",
        r.personalization?.name ?? "",
        r.personalization?.number ?? "",
        String(r.quantity),
        r.status,
        r.carrier ?? "",
        r.service ?? "",
        r.trackingNumber ?? "",
        r.bundle ?? "",
      ]
        .map(esc)
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}
