/** Curated Lulu formats. Admin picks a format; the pod_package_id is derived
 * here — raw SKUs never cross the API boundary. IDs are Lulu's documented
 * 6×9 (0600X0900) perfect-bound trade paperback on 60# uncoated white with
 * a matte cover; BW = black & white interior, FC = full color. Verify against
 * Lulu's spec generator before go-live (sandbox print-job validation will
 * also reject a bad id). */
export type LuluFormat = "6x9_bw" | "6x9_color";

export const LULU_FORMATS: Record<LuluFormat, { label: string; podPackageId: string }> = {
  "6x9_bw": { label: '6×9" paperback — black & white interior', podPackageId: "0600X0900BWSTDPB060UW444MXX" },
  "6x9_color": { label: '6×9" paperback — color interior', podPackageId: "0600X0900FCSTDPB060UW444MXX" },
};

export function isLuluFormat(s: string): s is LuluFormat {
  return s in LULU_FORMATS;
}

export function podPackageIdForFormat(f: LuluFormat): string {
  return LULU_FORMATS[f].podPackageId;
}
