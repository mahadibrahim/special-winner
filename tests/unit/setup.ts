// Load .env so unit tests that exercise DB helpers (e.g. soccerone/venues)
// can connect when DATABASE_URL is present. Pure logic tests are unaffected.
import "dotenv/config";
