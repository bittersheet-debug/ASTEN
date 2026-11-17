/**
 * ASTEN! (ASISTEN TENAGA!) - Production Database Purge / Clean Script
 * Removes all demo / test data and resets database to pristine production state.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../src/config/config');

console.log('[Clean-DB] Membersihkan seluruh data demo / testing dari database produksi...');

if (fs.existsSync(config.DB_PATH)) {
  const db = new DatabaseSync(config.DB_PATH);
  db.exec('PRAGMA foreign_keys = OFF;');

  const tables = [
    'activity_logs',
    'rnk_records',
    'rnk_configs',
    'custom_command_payment_aliases',
    'custom_command_replies',
    'transactions',
    'stock_logs',
    'payment_configs',
    'products',
    'admins',
    'groups',
    'bots',
    'access_codes',
    'owners'
  ];

  for (const table of tables) {
    db.exec(`DELETE FROM ${table};`);
  }

  // Reset auto-increment sequence counters
  try {
    db.exec("DELETE FROM sqlite_sequence;");
  } catch (e) {}

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('VACUUM;');
  db.close();
  console.log('[Clean-DB] ✅ Seluruh data demo berhasil dihapus! Database sekarang 100% BERSIH & SIAP PRODUKSI.');
} else {
  console.log('[Clean-DB] Database belum ada.');
}
