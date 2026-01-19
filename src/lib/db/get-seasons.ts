import { getDb } from "./index";
import { seasons } from "./schema/programs";
import { eq } from "drizzle-orm";

async function getSeasons() {
  const openSeasons = await getDb()
    .select()
    .from(seasons)
    .where(eq(seasons.status, "open"))
    .limit(3);

  console.log("Open seasons for testing:");
  openSeasons.forEach((s) => {
    console.log(`  - ${s.name}: /register/${s.id} ($${s.priceCents / 100})`);
  });
}

getSeasons()
  .catch(console.error)
  .finally(() => process.exit(0));
