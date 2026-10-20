import process from 'node:process';
import { createEbrplClient } from './index.js';

const usage = "Usage: npm run catalog -- search <title, author, or ISBN> | availability <record ID> [--branches EBRPL/JCR,EBRPL/SOU,EBRPL/BBR]";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const client = createEbrplClient();
  if (command === 'search' && args.length > 0 && !args.some(arg => arg.startsWith('--'))) {
    console.log(JSON.stringify(await client.searchBooks(args.join(' ')), null, 2));
    return;
  }
  if (command === 'availability') {
    const [recordId, flag, rawBranches, ...extra] = args;
    if (recordId && extra.length === 0 && (flag === undefined || (flag === '--branches' && rawBranches))) {
      const branches = rawBranches?.split(',').map(code => code.trim());
      console.log(JSON.stringify(await client.getAvailability(recordId, branches), null, 2));
      return;
    }
  }
  throw new Error(usage);
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Catalog command failed' }));
  process.exitCode = 1;
});
