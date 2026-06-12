#!/usr/bin/env python3
"""Normalize a `pg_dump --schema-only` dump for semantic comparison.

Used by .github/workflows/schema-drift.yml. A naive text diff of two
dumps flags differences that are NOT schema drift:

1. Server-version formatting noise — PG17 vs PG18 servers emit
   different `\\restrict`/`\\unrestrict` tokens, "Dumped from database
   version" headers, and PG18 adds a "-- *not* creating schema" block.
   (Staging is currently PG18, prod PG17 — see the workflow comments.)
2. Column ORDER inside CREATE TABLE — a column added via migration on
   one DB and via an earlier `db:push` on the other lands at a
   different ordinal position. Postgres column order is semantically
   irrelevant to the application (drizzle selects by name), so the
   normalizer sorts column/constraint lines within each CREATE TABLE
   block before diffing.

Reads one dump from argv[1], writes the normalized dump to stdout.
Stdlib only — the CI job runs it with the runner's system python3.
"""

import re
import sys

NOISE_PATTERNS = [
    re.compile(r"^\\(un)?restrict\s"),
    re.compile(r"^-- Dumped (from database|by pg_dump) version"),
    # PG18 emits an explanatory block about not re-creating the public
    # schema; PG17 emits nothing. Both states mean "public schema as
    # initdb made it".
    re.compile(r"^-- \*not\* creating schema, since initdb creates it"),
    re.compile(r"^COMMENT ON SCHEMA public IS '';"),
]

CREATE_TABLE_RE = re.compile(r"^CREATE (?:UNLOGGED )?TABLE [^(]+\($")

# PG18-only object-comment headers (the public-schema blocks) — matched
# as whole `--` / `-- Name: …` / `--` groups so no orphan delimiters
# survive.
NOISE_COMMENT_HEADERS = re.compile(
    r"^-- Name: (public; Type: SCHEMA|SCHEMA public; Type: COMMENT);"
)


def is_noise(line: str) -> bool:
    return any(p.search(line) for p in NOISE_PATTERNS)


def normalize(lines: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if is_noise(line):
            i += 1
            continue
        # Skip the full `--` / `-- Name: …` / `--` comment group for
        # noise-only objects.
        if (
            line == "--"
            and i + 2 < n
            and NOISE_COMMENT_HEADERS.match(lines[i + 1])
            and lines[i + 2] == "--"
        ):
            i += 3
            continue
        out.append(line)
        if CREATE_TABLE_RE.match(line):
            # Collect the body up to the closing ");" at depth 0.
            body: list[str] = []
            i += 1
            while i < n and not lines[i].startswith(");"):
                body.append(lines[i])
                i += 1
            # Sort the body entries with trailing commas stripped, then
            # re-attach commas to every entry but the last. pg_dump
            # emits exactly one column/constraint definition per line,
            # so line-wise sorting is safe.
            stripped = [e.rstrip().rstrip(",") for e in body]
            stripped.sort()
            for j, e in enumerate(stripped):
                out.append(e + ("," if j < len(stripped) - 1 else ""))
            if i < n:
                out.append(lines[i])  # the ");" line
        i += 1
    # Collapse runs of blank lines the noise-stripping may have created.
    collapsed: list[str] = []
    for line in out:
        if line == "" and collapsed and collapsed[-1] == "":
            continue
        collapsed.append(line)
    return collapsed


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: normalize-schema-dump.py <dump.sql>")
    with open(sys.argv[1], encoding="utf-8") as f:
        lines = f.read().splitlines()
    sys.stdout.write("\n".join(normalize(lines)) + "\n")


if __name__ == "__main__":
    main()
