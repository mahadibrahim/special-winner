import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ActivitySchema, type Activity } from "./types/activity";
import { ArtifactTemplateSchema, type ArtifactTemplate } from "./types/artifact-template";
import { FeatureSchema, type Feature } from "./types/feature";
import { RoleSchema, type Role } from "./types/role";

export interface Catalog {
  roles: Role[];
  features: Feature[];
  artifacts: ArtifactTemplate[];
  activities: Activity[];
}

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

async function listYamlFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && YAML_EXTENSIONS.has(path.extname(e.name)))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`)
    .join("; ");
}

async function loadAndParse<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  const data = parseYaml(raw);
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Failed to parse ${file}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

async function loadDir<T>(rootDir: string, sub: string, schema: z.ZodType<T>): Promise<T[]> {
  const dir = path.join(rootDir, sub);
  const files = await listYamlFiles(dir);
  const items: T[] = [];
  for (const file of files) {
    items.push(await loadAndParse(file, schema));
  }
  return items;
}

export async function loadCatalog(rootDir: string): Promise<Catalog> {
  const [roles, features, artifacts, activities] = await Promise.all([
    loadDir(rootDir, "roles", RoleSchema),
    loadDir(rootDir, "features", FeatureSchema),
    loadDir(rootDir, "artifacts", ArtifactTemplateSchema),
    loadDir(rootDir, "activities", ActivitySchema),
  ]);
  return { roles, features, artifacts, activities };
}
