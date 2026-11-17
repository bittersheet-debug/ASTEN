/**
 * Test Access Code Creation via Bot Handler
 */

process.env.NODE_ENV = 'test';
process.env.DB_PATH = './data/test_access_code.db';

const fs = require('fs');
const path = require('path');

const testDbPath = path.resolve(__dirname, '../data/test_access_code.db');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/database/db');
const AccessCodeBotHandler = require('../src/bot/handlers/accessCodeBotHandler');
const LicenseModel = require('../src/models/LicenseModel');
const LogModel = require('../src/models/LogModel');

async function runTest() {
  console.log('🧪 Starting Access Code Bot Creation Test...');

  let repliedMessage = '';
  let replyOptions = null;

  const mockCtx = {
    from: { id: 123456789, username: 'testcreator' },
    chat: { id: 123456789, type: 'private' },
    botInfo: { id: 9167134826, username: 'Astenobot', first_name: 'ASTEN!' },
    message: { text: '/buatkode "Toko Sukses Makmur" 30 2' },
    reply: async (msg, opts) => {
      repliedMessage = msg;
      replyOptions = opts;
      return true;
    }
  };

  // 1. Test direct command execution: /buatkode "Toko Sukses Makmur" 30 2
  await AccessCodeBotHandler.handleCreateCodeCommand(mockCtx);

  console.log('--- Result Reply ---');
  console.log(repliedMessage);

  if (!repliedMessage.includes('KODE AKSES BERHASIL DIBUAT')) {
    throw new Error('Expected success message for code creation');
  }

  // Extract generated code from message
  const match = repliedMessage.match(/ASTEN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  if (!match) {
    throw new Error('Code format ASTEN-XXXX-XXXX-XXXX not found in response');
  }

  const generatedCode = match[0];
  console.log(`✅ Extracted code: ${generatedCode}`);

  // 2. Verify code exists in DB
  const codeInDb = LicenseModel.findByCode(generatedCode);
  if (!codeInDb) throw new Error('Code not found in database');
  if (codeInDb.owner_name !== 'Toko Sukses Makmur') throw new Error(`Wrong owner name: ${codeInDb.owner_name}`);
  if (codeInDb.max_bots !== 2) throw new Error(`Wrong max bots: ${codeInDb.max_bots}`);
  if (codeInDb.duration_days !== 30) throw new Error(`Wrong duration: ${codeInDb.duration_days}`);
  console.log('✅ Code successfully verified in SQLite database!');

  // 3. Verify activity log
  const logs = LogModel.getAll(10);
  const codeLog = logs.find(l => l.action === 'ACCESS_CODE_GENERATED');
  if (!codeLog) throw new Error('Log for ACCESS_CODE_GENERATED not found');
  console.log(`✅ Activity log recorded: ${codeLog.details}`);

  // 4. Test listing codes: /listkode
  let listMessage = '';
  await AccessCodeBotHandler.handleListCodes({
    from: { id: 123456789 },
    reply: async (msg) => { listMessage = msg; }
  });

  if (!listMessage.includes(generatedCode)) {
    throw new Error('Generated code not found in /listkode response');
  }
  console.log('✅ /listkode correctly lists the generated code!');

  // 5. Test activating the code
  const activation = await LicenseModel.activateCode(generatedCode, '987654321', 'owner_budi');
  if (!activation.success) throw new Error(`Activation failed: ${activation.message}`);
  console.log(`✅ Code activated by Owner: ${activation.owner.name} (${activation.owner.license_type})`);

  // Clean up test DB
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('\n🎉 ALL ACCESS CODE BOT CREATION TESTS PASSED 100%!');
}

runTest().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
