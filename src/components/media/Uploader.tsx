"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDB, type IDBPDatabase } from "idb";

type FileEntry = {
  key: string;
  file: File;
  name: string;
  size: number;
  assetId?: string;
  uploadId?: string;
  progress: number;
  state: "queued" | "requesting" | "uploading" | "completing" | "done" | "error";
  error?: string;
};

const PART_SIZE = 8 * 1024 * 1024; // 8 MB

async function openQueueDb(): Promise<IDBPDatabase> {
  return openDB("aspire-media-uploader", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "key" });
      }
    },
  });
}

async function saveEntry(
  db: IDBPDatabase,
  e: Omit<FileEntry, "file"> & { fileMeta: { name: string; size: number } }
) {
  await db.put("queue", e);
}

async function deleteEntry(db: IDBPDatabase, key: string) {
  await db.delete("queue", key);
}

async function loadEntries(
  db: IDBPDatabase
): Promise<Array<Omit<FileEntry, "file">>> {
  return db.getAll("queue");
}

export type UploaderProps = {
  sessionId: string;
  onAssetCompleted?: (assetId: string) => void;
};

export function Uploader({ sessionId, onAssetCompleted }: UploaderProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const entriesRef = useRef<FileEntry[]>([]);
  entriesRef.current = entries;

  const dbRef = useRef<IDBPDatabase | null>(null);

  useEffect(() => {
    (async () => {
      dbRef.current = await openQueueDb();
      const saved = await loadEntries(dbRef.current);
      const pending = saved.filter((s) => s.key.startsWith(`${sessionId}:`));
      if (pending.length > 0) {
        setEntries(
          pending.map((p) => ({
            ...(p as any),
            file: undefined as any,
            state: "error",
            error: "Session resumed — re-select the files to continue upload.",
          }))
        );
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const active = entriesRef.current.some((x) =>
        ["requesting", "uploading", "completing"].includes(x.state)
      );
      if (active) {
        e.preventDefault();
        e.returnValue = "Uploads in progress — leaving will interrupt them.";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const onFilesPicked = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const next: FileEntry[] = [];
      for (const file of Array.from(fileList)) {
        const key = `${sessionId}:${file.name}:${file.size}`;
        next.push({
          key,
          file,
          name: file.name,
          size: file.size,
          progress: 0,
          state: "queued",
        });
      }
      setEntries((prev) => [...prev, ...next]);
      if (dbRef.current) {
        for (const e of next) {
          await saveEntry(dbRef.current, {
            key: e.key,
            name: e.name,
            size: e.size,
            progress: 0,
            state: "queued",
            fileMeta: { name: e.name, size: e.size },
          } as any);
        }
      }
    },
    [sessionId]
  );

  const upload = useCallback(
    async (entry: FileEntry) => {
      const update = (patch: Partial<FileEntry>) =>
        setEntries((prev) =>
          prev.map((x) => (x.key === entry.key ? { ...x, ...patch } : x))
        );

      try {
        update({ state: "requesting" });
        const partCount = Math.max(1, Math.ceil(entry.size / PART_SIZE));
        const reqRes = await fetch(`/api/media/jobs/${sessionId}/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [
              {
                filename: entry.name,
                contentType: entry.file.type || "application/octet-stream",
                sizeBytes: entry.size,
                partCount,
              },
            ],
          }),
        });
        if (!reqRes.ok) throw new Error(`Request failed: ${reqRes.status}`);
        const reqJson = await reqRes.json();
        const { assetId, uploadId, partUrls } = reqJson.uploads[0];
        update({ assetId, uploadId, state: "uploading" });

        const etags: { ETag: string; PartNumber: number }[] = [];
        for (let i = 0; i < partCount; i++) {
          const start = i * PART_SIZE;
          const end = Math.min(entry.size, start + PART_SIZE);
          const blob = entry.file.slice(start, end);
          const putRes = await fetch(partUrls[i], {
            method: "PUT",
            body: blob,
          });
          if (!putRes.ok) throw new Error(`Part ${i + 1} failed: ${putRes.status}`);
          const etag = putRes.headers.get("etag") || '"fake-etag"';
          etags.push({ ETag: etag, PartNumber: i + 1 });
          update({ progress: (i + 1) / partCount });
        }

        update({ state: "completing" });
        const completeRes = await fetch(
          `/api/media/jobs/${sessionId}/uploads/${assetId}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadId, parts: etags }),
          }
        );
        if (!completeRes.ok)
          throw new Error(`Complete failed: ${completeRes.status}`);
        update({ state: "done", progress: 1 });
        if (dbRef.current) await deleteEntry(dbRef.current, entry.key);
        onAssetCompleted?.(assetId);
      } catch (err: any) {
        update({ state: "error", error: err?.message ?? String(err) });
      }
    },
    [sessionId, onAssetCompleted]
  );

  useEffect(() => {
    const active = entries.filter((e) =>
      ["requesting", "uploading", "completing"].includes(e.state)
    ).length;
    const queued = entries.filter((e) => e.state === "queued" && e.file);
    for (let i = 0; i < Math.min(3 - active, queued.length); i++) {
      upload(queued[i]);
    }
  }, [entries, upload]);

  const overallProgress = useMemo(() => {
    if (entries.length === 0) return 0;
    const sum = entries.reduce((acc, e) => acc + (e.progress || 0), 0);
    return sum / entries.length;
  }, [entries]);

  const completedCount = entries.filter((e) => e.state === "done").length;

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        onFilesPicked(e.dataTransfer.files);
      }}
      onDragOver={(e) => e.preventDefault()}
      className="rounded-2xl border-2 border-dashed border-ink/20 bg-cream p-8"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl">Upload files</h3>
          <p className="text-sm text-ink/60">
            Drag a folder in, or click to browse.
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm">
            {completedCount} / {entries.length} complete
          </div>
          <div className="mt-1 h-2 w-40 rounded-full bg-ink/10">
            <div
              className="h-2 rounded-full bg-ink"
              style={{ width: `${Math.round(overallProgress * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <label className="cursor-pointer rounded-md border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5">
          Browse files
          <input
            type="file"
            multiple
            hidden
            onChange={(e) => onFilesPicked(e.target.files)}
          />
        </label>
        <label className="cursor-pointer rounded-md border border-ink/20 px-3 py-1.5 text-sm hover:bg-ink/5">
          Browse folder
          <input
            type="file"
            hidden
            // @ts-expect-error non-standard but widely supported
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={(e) => onFilesPicked(e.target.files)}
          />
        </label>
      </div>

      <ul className="mt-6 space-y-2">
        {entries.map((e) => (
          <li
            key={e.key}
            className="flex items-center justify-between gap-4 rounded-md border border-ink/10 bg-white/50 px-3 py-2 text-sm"
          >
            <span className="truncate">{e.name}</span>
            <span className="shrink-0 text-xs text-ink/60">
              {Math.round((e.size / 1024 / 1024) * 10) / 10} MB
            </span>
            <span
              className={`shrink-0 text-xs ${
                e.state === "error" ? "text-red-700" : "text-ink/70"
              }`}
            >
              {e.state === "done"
                ? "Uploaded"
                : e.state === "error"
                ? `Error: ${e.error}`
                : `${Math.round(e.progress * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
