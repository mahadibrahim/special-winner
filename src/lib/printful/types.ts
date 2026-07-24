// Minimal Printful v1 store API shapes — only the fields Phase 1 reads.

export interface PrintfulFile {
  type: string; // "preview" | "default" | ...
  preview_url?: string;
  url?: string | null;
}

export interface PrintfulSyncProductSummary {
  id: number; // sync_product_id
  external_id: string;
  name: string;
  thumbnail_url: string;
  variants: number; // variant count
  synced: number;
}

export interface PrintfulSyncVariant {
  id: number; // sync_variant_id
  external_id: string;
  sync_product_id: number;
  name: string; // e.g. "Unisex Staple Tee / Black / M"
  synced: boolean;
  variant_id: number; // catalog variant id (Phase 2 rates/orders)
  retail_price: string; // "25.00"
  sku: string | null;
  currency: string;
  files?: PrintfulFile[];
}

export interface PrintfulSyncProductDetail {
  sync_product: {
    id: number;
    external_id: string;
    name: string;
    thumbnail_url: string;
  };
  sync_variants: PrintfulSyncVariant[];
}

export interface PrintfulListResponse<T> {
  code: number;
  result: T;
  paging?: { total: number; offset: number; limit: number };
  error?: { reason: string; message: string };
}
