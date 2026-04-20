"use client";

export type TaggerAsset = {
  id: string;
  preview_url: string;
  thumbnail_url: string | null;
  captured_at: string | null;
  burst_group_id: string | null;
  width?: number | null;
  height?: number | null;
  tags: Array<{
    id: string;
    family_member_id: string | null;
    team_id: string | null;
    tag_scope: "player" | "team" | "both_teams";
    source: string;
  }>;
};

type Props = {
  asset: TaggerAsset | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

export function TaggerAssetViewer({
  asset,
  index,
  total,
  onPrev,
  onNext,
}: Props) {
  return (
    <div className="flex h-full w-full flex-col" data-testid="asset-viewer">
      <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous asset"
          className="rounded border px-2 py-1 hover:bg-neutral-50"
          data-testid="nav-prev"
        >
          <span aria-hidden>&larr;</span>
        </button>
        <span data-testid="nav-position">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next asset"
          className="rounded border px-2 py-1 hover:bg-neutral-50"
          data-testid="nav-next"
        >
          <span aria-hidden>&rarr;</span>
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-950">
        {asset ? (
          <img
            src={asset.preview_url}
            alt="Current asset"
            className="max-h-full max-w-full object-contain"
            data-testid="asset-image"
            data-asset-id={asset.id}
          />
        ) : (
          <span className="text-white">No assets.</span>
        )}
      </div>
    </div>
  );
}
