#!/usr/bin/env tsx
const command = process.argv[2];

const commands: Record<string, () => Promise<number>> = {
  validate: async () => {
    console.log("[ops-catalog] validate (not yet implemented)");
    return 0;
  },
  render: async () => {
    console.log("[ops-catalog] render (not yet implemented)");
    return 0;
  },
};

async function main() {
  if (!command || !commands[command]) {
    console.error(`Usage: ops-catalog <validate|render> [options]`);
    process.exit(1);
  }
  const code = await commands[command]();
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
