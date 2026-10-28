import { closeDb, dbEngine, ensureSchema } from '../apps/api/src/db';

async function main() {
  try {
    await ensureSchema();
    console.log(`✔ schema applied (${dbEngine})`);
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error('✖ migration failed:', error.message);
  process.exit(1);
});
