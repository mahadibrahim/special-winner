"use client";

import { useEffect, useState } from "react";

type StaffRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  active: boolean | null;
};

export function StaffDirectory() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const load = () =>
    fetch("/api/admin/media/staff")
      .then((r) => r.json())
      .then((j) => setRows(j.staff ?? []));
  useEffect(() => {
    load();
  }, []);

  const invite = async () => {
    await fetch("/api/admin/media/staff/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, firstName, lastName }),
    });
    setEmail("");
    setFirstName("");
    setLastName("");
    load();
  };

  return (
    <div className="p-6">
      <h1 className="font-serif text-3xl">Media staff</h1>
      <div className="mt-4 flex gap-2">
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-ink/20 px-2 py-1 text-sm"
        />
        <input
          placeholder="first"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-md border border-ink/20 px-2 py-1 text-sm"
        />
        <input
          placeholder="last"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="rounded-md border border-ink/20 px-2 py-1 text-sm"
        />
        <button
          onClick={invite}
          className="rounded-md bg-ink px-3 py-1.5 text-sm text-cream"
        >
          Invite
        </button>
      </div>

      <ul className="mt-6 space-y-2 text-sm">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex justify-between rounded-md border border-ink/10 bg-white/50 px-3 py-2"
          >
            <span>
              {r.firstName} {r.lastName} — {r.email}
            </span>
            <span className="text-xs text-ink/60">
              {r.active ? "active" : "inactive"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
