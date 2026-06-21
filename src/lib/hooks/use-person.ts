import { useEffect, useState } from "react";
import type { PersonProfile } from "@/lib/person/person-types";

export function usePerson(target: { id: string; as: "family_member" | "user" } | null) {
  const [data, setData] = useState<PersonProfile | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setData(null); setError(null); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/person/${target.id}?as=${target.as}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((j: PersonProfile) => { if (alive) setData(j); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [target?.id, target?.as]);

  return { data, isLoading, error };
}
