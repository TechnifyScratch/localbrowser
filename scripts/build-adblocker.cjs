const { promises: fs } = require('node:fs');
const path = require('node:path');
const { FiltersEngine } = require('@ghostery/adblocker');

async function main() {
  const blocker = await FiltersEngine.fromPrebuiltFull(fetch);
  const output = path.join(__dirname, '..', 'build', 'adblocker-engine.bin');
  await fs.writeFile(output, blocker.serialize());
  process.stdout.write(`Wrote ${output}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
