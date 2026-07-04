import { Client } from "@notionhq/client";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import type { JobApplication } from "@/lib/db/schema/job-applications";

/**
 * Notion half of the hiring pipeline. The app DB is the source of truth;
 * this module only pushes new applications into the "Hiring Pipeline"
 * database. Feature-gated: missing env → silent no-op (rows stay
 * unsynced; the hourly cron retries once env is configured).
 *
 * Property names MUST match the Notion database exactly:
 * Name (title), Role (select), Status (select), Email (email),
 * Phone (phone_number), Facility (select), Certifications (rich_text),
 * Availability (multi_select), Resume (url), Applied (date),
 * Source (rich_text).
 */
const ROLE_LABELS: Record<JobApplication["role"], string> = {
  referee: "Referee",
  coach: "Coach",
  staff: "Staff",
};
const FACILITY_LABELS: Record<string, string> = {
  worthington: "Worthington",
  downtown: "Downtown",
  either: "Either",
};

export function isNotionConfigured(): boolean {
  return Boolean(import.meta.env.NOTION_API_KEY && import.meta.env.NOTION_ATS_DATABASE_ID);
}

export function buildApplicationPageParams(
  app: JobApplication,
  databaseId: string,
  appBaseUrl: string,
): CreatePageParameters {
  const properties: CreatePageParameters["properties"] = {
    Name: { title: [{ text: { content: `${app.firstName} ${app.lastName}` } }] },
    Role: { select: { name: ROLE_LABELS[app.role] } },
    Status: { select: { name: "New" } },
    Email: { email: app.email },
    Applied: { date: { start: app.createdAt.toISOString().slice(0, 10) } },
  };
  if (app.phone) properties["Phone"] = { phone_number: app.phone };
  if (app.preferredLocation && FACILITY_LABELS[app.preferredLocation]) {
    properties["Facility"] = { select: { name: FACILITY_LABELS[app.preferredLocation] } };
  }
  if (app.certifications) {
    properties["Certifications"] = { rich_text: [{ text: { content: app.certifications.slice(0, 2000) } }] };
  }
  if (app.availability.length > 0) {
    properties["Availability"] = { multi_select: app.availability.map((a) => ({ name: a })) };
  }
  if (app.resumeKey) {
    properties["Resume"] = { url: `${appBaseUrl.replace(/\/$/, "")}/api/admin/applications/${app.id}/resume` };
  }
  if (app.source) properties["Source"] = { rich_text: [{ text: { content: app.source.slice(0, 200) } }] };

  return {
    parent: { database_id: databaseId },
    properties,
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: app.experience.slice(0, 2000) } }] },
      },
    ],
  };
}

/** Returns the created Notion page id, or null (unconfigured / failed — logged, never throws). */
export async function createNotionApplicationPage(app: JobApplication): Promise<string | null> {
  if (!isNotionConfigured()) return null;
  try {
    const notion = new Client({ auth: import.meta.env.NOTION_API_KEY as string });
    const baseUrl = (import.meta.env.PUBLIC_APP_URL as string | undefined) ?? "https://aspiresportsohio.com";
    const page = await notion.pages.create(
      buildApplicationPageParams(app, import.meta.env.NOTION_ATS_DATABASE_ID as string, baseUrl),
    );
    return page.id;
  } catch (err) {
    console.error("[careers] notion sync failed", { applicationId: app.id, err });
    return null;
  }
}
