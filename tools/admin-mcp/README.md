# Aspire admin MCP

A scoped MCP server for catalog administration. It can **read** the catalog
(locations, sports, programs, seasons) and **create/edit programs & seasons**
— nothing else. There are no tools for refunds, deletes, registrations,
payments, users, or messaging, and the server-side token scopes enforce the
same boundary independently.

## Setup

1. **Mint a token** (staging first; prod via the Railway proxy URL):

   ```sh
   ./scripts/with-bws.sh npx tsx scripts/mint-admin-api-token.ts \
     --org <org-slug> --user <admin-email> \
     --name "owner admin MCP" \
     --scopes catalog:read,catalog:write --expires-days 180
   ```

   The raw token prints once. Store it in the macOS Keychain:

   ```sh
   security add-generic-password -a "Aspire" -s "aspire-admin-mcp" -w
   ```

2. **Install deps** (once): `cd tools/admin-mcp && npm install`

3. **Register with Claude Desktop** (`claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "aspire-admin": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/web-app/tools/admin-mcp/index.mjs"],
         "env": {
           "ASPIRE_ADMIN_TOKEN": "aspire_admin_...",
           "ASPIRE_BASE_URL": "https://aspiresportsohio.com"
         }
       }
     }
   }
   ```

   Or Claude Code: `claude mcp add aspire-admin -e ASPIRE_ADMIN_TOKEN=... -- node tools/admin-mcp/index.mjs`

## Safety model

- **Token, not session**: the server holds a scoped `x-admin-token`; only six
  endpoint methods on the API accept it (catalog reads + offerings POST +
  seasons PUT/POST + programs PUT). Every other admin endpoint rejects it.
- **Org-pinned**: the token carries its organization and the API additionally
  requires the request host to resolve to that same org.
- **Confirm-gated writes**: every mutating tool called without `confirm: true`
  returns a preview (a field-level diff for updates) and changes nothing.
- **Merge-safe updates**: `update_season`/`update_program` fetch the current
  row and merge your changes into the full payload, so unspecified fields
  keep their stored values.
- **Prices are cents** end-to-end (`priceCents: 12000` = $120).

## Revoking a token

```sql
UPDATE admin_api_tokens SET revoked_at = now() WHERE name = 'owner admin MCP';
```
