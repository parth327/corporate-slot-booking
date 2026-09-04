// Prints the live database structure. Usage: node server/scripts/inspect-db.mjs
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const q = async (sql, params) => (await client.query(sql, params)).rows;

const enums = await q(`
  SELECT t.typname, string_agg(e.enumlabel, ' | ' ORDER BY e.enumsortorder) AS vals
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  GROUP BY 1 ORDER BY 1`);
console.log('ENUMS');
for (const e of enums) console.log(`  ${e.typname.padEnd(18)} ${e.vals}`);

const tables = await q(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`);

for (const { table_name } of tables) {
  const cols = await q(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [table_name]
  );
  console.log(`\nTABLE ${table_name}  (${cols.length} columns)`);
  for (const c of cols) {
    const nn = c.is_nullable === 'NO' ? 'NOT NULL' : '';
    const def = c.column_default ? `default ${c.column_default}` : '';
    console.log(`  ${c.column_name.padEnd(22)} ${c.data_type.padEnd(26)} ${nn.padEnd(9)} ${def}`);
  }
  const idx = await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ORDER BY 1`, [
    table_name,
  ]);
  for (const i of idx) console.log(`  idx  ${i.indexdef.replace(/^CREATE /, '')}`);
  const fks = await q(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype = 'f' ORDER BY 1`,
    [table_name]
  );
  for (const f of fks) console.log(`  fk   ${f.conname} ${f.def}`);
  const { count } = (await q(`SELECT count(*)::int AS count FROM ${table_name}`))[0];
  console.log(`  rows ${count}`);
}

await client.end();
