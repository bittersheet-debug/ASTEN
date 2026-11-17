const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./data/asten.db');

console.log('--- BOTS ---');
console.log(db.prepare("SELECT bot_id, bot_name, bot_username, is_official, operational_status FROM bots").all());

console.log('--- OWNERS ---');
console.log(db.prepare("SELECT id, name, telegram_username, telegram_user_id, license_type, status FROM owners").all());

console.log('--- ACCESS CODES ---');
console.log(db.prepare("SELECT code, owner_name, license_type, status FROM access_codes").all());

console.log('--- PRODUCTS ---');
console.log(db.prepare("SELECT id, name, price, stock FROM products").all());
