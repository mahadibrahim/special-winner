// Build preflight (#578): a bare `npm run build` in a checkout with no
// secrets used to run for minutes and then die with a bewildering
// "Cannot read properties of null (reading 'select')" thrown from whichever
// prerendered page queried the DB first (guides/*, community/*, the
// minibook). Nothing pointed at the real cause: DATABASE_URL was missing.
//
// This fails FAST with the one-line explanation instead. dotenv mirrors the
// dev script's loading so a `.env` checkout still just works; Netlify/CI set
// the variable in the environment.
import "dotenv/config";

if (!process.env.DATABASE_URL) {
  console.error(
    "\n[build-preflight] DATABASE_URL is not set.\n\n" +
      "The production build prerenders pages that query the database at\n" +
      "build time, so it cannot run without one. Either:\n" +
      "  - run through Bitwarden:  ./scripts/with-bws.sh npm run build\n" +
      "  - or provide a .env file with DATABASE_URL (see .env.example)\n",
  );
  process.exit(1);
}
