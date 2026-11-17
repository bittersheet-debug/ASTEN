const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('./data/asten.db');
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

const tables = [
  'owners',
  'access_codes',
  'bots',
  'admins',
  'products',
  'stock_history',
  'payment_configs',
  'custom_commands',
  'rnk_configs',
  'rnk_records',
  'group_settings',
  'activity_logs'
];

const seedData = {};

for (const table of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    seedData[table] = rows;
    console.log(`Exported ${table}: ${rows.length} rows`);
  } catch (err) {
    console.warn(`Could not export ${table}: ${err.message}`);
    seedData[table] = [];
  }
}

fs.writeFileSync(
  path.join(__dirname, '../data/seed.json'),
  JSON.stringify(seedData, null, 2),
  'utf8'
);

console.log('✅ Exported all tables to data/seed.json successfully!');
db.close();
