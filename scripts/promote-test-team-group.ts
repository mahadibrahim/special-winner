/**
 * One-shot: pick a real team, ensure a `team_groups` row exists for it,
 * and call `promoteGroupToActive` with the provided Telegram chat_id.
 *
 * Usage:
 *   npx tsx scripts/promote-test-team-group.ts <telegramChatId>
 *
 * Example:
 *   npx tsx scripts/promote-test-team-group.ts -5220873084
 *
 * Picks the first team it finds in the DB (for a test run). Prints the
 * team name, organization, and resulting group state.
 */
import "dotenv/config";
import { getDb } from "@/lib/db";
import {
  teams,
  teamGroups,
  seasons,
  programs,
  locations,
  organizations,
  sports,
} from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { promoteGroupToActive } from "@/lib/messaging/group-lifecycle";

const chatId = process.argv[2];
if (!chatId || !chatId.startsWith("-")) {
  console.error(
    "Telegram chat_id required as first arg. Must start with '-' (negative).",
  );
  process.exit(1);
}

async function main() {
  const db = getDb();

  // Grab the first team with its full context
  const [team] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      seasonId: teams.seasonId,
      programId: seasons.programId,
      programName: programs.name,
      sportName: sports.name,
      audienceType: programs.audienceType,
      locationId: programs.locationId,
      orgId: locations.organizationId,
      orgSlug: organizations.slug,
      seasonName: seasons.name,
    })
    .from(teams)
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .leftJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .limit(1);

  if (!team) {
    console.error(
      "No teams found in the DB. Seed at least one team before running.",
    );
    process.exit(1);
  }

  console.log(
    `Picked team: ${team.teamName} (id ${team.teamId})\n` +
      `  Program: ${team.programName} (${team.sportName ?? "no sport"})\n` +
      `  Season:  ${team.seasonName}\n` +
      `  Org:     ${team.orgSlug}\n`,
  );

  // Does a team_group row already exist (non-archived)?
  const existing = await db.query.teamGroups.findFirst({
    where: and(
      eq(teamGroups.teamId, team.teamId),
      ne(teamGroups.status, "archived"),
    ),
  });

  let teamGroupId: string;
  const computedName =
    `${team.orgSlug} ${team.sportName ?? team.programName} ${team.teamName} — ${team.seasonName} ${
      team.audienceType === "players" ? "Players" : "Parents"
    }`.slice(0, 128);

  if (existing) {
    teamGroupId = existing.id;
    console.log(`Team group row already exists (status: ${existing.status})`);
  } else {
    const [row] = await db
      .insert(teamGroups)
      .values({
        teamId: team.teamId,
        programId: team.programId,
        organizationId: team.orgId,
        audienceType: team.audienceType,
        name: computedName,
        status: "pending_manual_creation",
      })
      .returning({ id: teamGroups.id });
    teamGroupId = row.id;
    console.log(`Created team_group row: ${teamGroupId}`);
  }

  console.log(`\nPromoting to active with chat_id ${chatId}...`);
  await promoteGroupToActive(teamGroupId, chatId);

  const final = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
  });
  console.log("\nResulting team_group row:");
  console.log({
    id: final?.id,
    name: final?.name,
    status: final?.status,
    telegramChatId: final?.telegramChatId,
    inviteLink: final?.inviteLink,
  });

  console.log(
    "\nDone. Log into admin, go to this team's page, and send a test broadcast.",
  );
}

main()
  .catch((err) => {
    console.error("\nFailed:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
