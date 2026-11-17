/**
 * Test /itsme Hidden Command and /start Default User Behavior
 */

process.env.NODE_ENV = 'test';
process.env.DB_PATH = './data/test_itsme.db';

const fs = require('fs');
const path = require('path');

const testDbPath = path.resolve(__dirname, '../data/test_itsme.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/database/db');
const StartHandler = require('../src/bot/handlers/startHandler');
const LicenseModel = require('../src/models/LicenseModel');

async function runTest() {
  console.log('🧪 Starting /itsme and /start Test...');

  // 1. Test /start as ordinary new user
  let startMsg = '';
  let startOpts = null;
  const mockStartCtx = {
    from: { id: 111222333, username: 'pembeli_baru' },
    chat: { id: 111222333, type: 'private' },
    botInfo: { id: 9167134826, username: 'Astenobot', first_name: 'ASTEN!' },
    message: { text: '/start' },
    reply: async (msg, opts) => {
      startMsg = msg;
      startOpts = opts;
      return true;
    }
  };

  await StartHandler.handleStart(mockStartCtx);

  console.log('--- /start Reply ---');
  console.log(startMsg);

  // Must have button "Masukkan Kode Akses Anda"
  const startButtons = startOpts?.reply_markup?.inline_keyboard?.flat() || [];
  const hasAccessCodeButton = startButtons.some(b => b.callback_data === 'btn_input_access_code');
  if (!hasAccessCodeButton) {
    throw new Error('Button "btn_input_access_code" NOT found in /start response!');
  }

  // Must NOT expose "Buat Kode Akses" to ordinary user
  const hasSecretButton = startButtons.some(b => b.callback_data === 'btn_buat_kode_start');
  if (hasSecretButton) {
    throw new Error('Secret button "btn_buat_kode_start" should NOT appear in default /start!');
  }
  console.log('✅ /start for ordinary user displays clean "Masukkan Kode Akses Anda" button only.');

  // 2. Test hidden command /itsme
  let itsMeMsg = '';
  let itsMeOpts = null;
  const mockItsMeCtx = {
    from: { id: 111222333, username: 'pembeli_baru' },
    chat: { id: 111222333, type: 'private' },
    botInfo: { id: 9167134826, username: 'Astenobot', first_name: 'ASTEN!' },
    message: { text: '/itsme' },
    reply: async (msg, opts) => {
      itsMeMsg = msg;
      itsMeOpts = opts;
      return true;
    }
  };

  await StartHandler.handleItsMe(mockItsMeCtx);

  console.log('--- /itsme Reply ---');
  console.log(itsMeMsg);

  const itsMeButtons = itsMeOpts?.reply_markup?.inline_keyboard?.flat() || [];
  const hasBuatKode = itsMeButtons.some(b => b.callback_data === 'btn_buat_kode_start');
  const hasDaftarKode = itsMeButtons.some(b => b.callback_data === 'btn_daftar_kode');
  const hasDaftarBot = itsMeButtons.some(b => b.callback_data === 'owner_add_bot_prompt');

  if (!hasBuatKode || !hasDaftarKode || !hasDaftarBot) {
    throw new Error('Hidden command /itsme missing required buttons (buat kode, daftar kode, daftarkan bot)!');
  }
  console.log('✅ /itsme displays all 3 secret master features: Buat Kode, Daftar Kode, Daftarkan Bot Baru.');

  // 3. Test entering valid access code
  const codeRec = LicenseModel.createAccessCode({
    ownerName: 'Toko Test',
    licenseType: '1_MONTH',
    durationDays: 30,
    maxBots: 1
  });

  let activationMsg = '';
  const mockActivationCtx = {
    from: { id: 111222333, username: 'owner_resmi' },
    chat: { id: 111222333, type: 'private' },
    botInfo: { id: 9167134826, username: 'Astenobot' },
    reply: async (msg) => { activationMsg = msg; }
  };

  await StartHandler.processAccessCodeActivation(mockActivationCtx, codeRec.code);

  console.log('--- Activation Reply ---');
  console.log(activationMsg);

  if (!activationMsg.includes('Aktivasi Owner berhasil')) {
    throw new Error('Expected activation success message');
  }
  if (!activationMsg.includes('@BotFather')) {
    throw new Error('Expected BotFather token prompt upon activation');
  }
  console.log('✅ Access code activation succeeded and prompted for BotFather API token!');

  // Clean up
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('\n🎉 ALL /itsme AND /start TESTS PASSED 100%!');
}

runTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
