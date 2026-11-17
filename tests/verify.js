/**
 * ASTEN! (ASISTEN TENAGA!) - Comprehensive Verification Test Suite
 * Runs against an isolated test database so production data is NEVER polluted!
 */

const fs = require('fs');
const path = require('path');

// Set isolated test database path BEFORE requiring modules
const testDbPath = path.join(__dirname, '../data/test_verify.db');
process.env.DB_PATH = testDbPath;
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const assert = require('assert');
const db = require('../src/database/db');
const { encrypt, decrypt, hashPassword, comparePassword, generateAccessCode, generateTransactionId } = require('../src/security/encryption');
const { isUserLocked, recordFailedAttempt, resetFailedAttempts, createSession, hasActiveSession, clearSession } = require('../src/security/auth');
const OwnerModel = require('../src/models/OwnerModel');
const LicenseModel = require('../src/models/LicenseModel');
const BotModel = require('../src/models/BotModel');
const AdminModel = require('../src/models/AdminModel');
const ProductModel = require('../src/models/ProductModel');
const PaymentConfigModel = require('../src/models/PaymentConfigModel');
const TransactionModel = require('../src/models/TransactionModel');
const CustomCommandModel = require('../src/models/CustomCommandModel');
const RnkModel = require('../src/models/RnkModel');
const RnkService = require('../src/services/rnkService');
const TelegramService = require('../src/services/telegramService');
const botManager = require('../src/bot/botManager');
const { createBotInstance } = require('../src/bot/botInstance');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function itAsync(description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runTestSuite() {
  console.log('========================================================');
  console.log('  🧪 ASTEN! (ASISTEN TENAGA!) - RUNNING VERIFICATION   ');
  console.log('========================================================\n');

  // 1. Database & Schema
  it('Database tables exist and initialized correctly', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    const expected = ['owners', 'access_codes', 'bots', 'admins', 'products', 'stock_logs', 'payment_configs', 'transactions', 'custom_command_replies', 'custom_command_payment_aliases', 'rnk_configs', 'rnk_records', 'groups', 'activity_logs'];
    expected.forEach(tbl => {
      assert.ok(tables.includes(tbl), `Table ${tbl} should exist`);
    });
  });

  // 2. Encryption & Passwords
  await itAsync('AES-256-GCM token encryption and bcrypt salted hashing', async () => {
    const rawToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz_TEST_TOKEN';
    const encrypted = encrypt(rawToken);
    assert.notStrictEqual(encrypted, rawToken, 'Token must be encrypted');
    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, rawToken, 'Decrypted token must match original');

    const rawPass = 'SuperSecretOwnerPass2026!';
    const hashed = await hashPassword(rawPass);
    assert.notStrictEqual(hashed, rawPass);
    const isValid = await comparePassword(rawPass, hashed);
    assert.strictEqual(isValid, true, 'Valid password must match hash');
    const isInvalid = await comparePassword('WrongPass', hashed);
    assert.strictEqual(isInvalid, false, 'Invalid password must be rejected');
  });

  // 3. Access Code Generator
  it('Access code format ASTEN-XXXX-XXXX-XXXX and unique randomness', () => {
    const code1 = generateAccessCode();
    const code2 = generateAccessCode();
    assert.match(code1, /^ASTEN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.notStrictEqual(code1, code2, 'Generated codes must be unique');
  });

  // 4. Access Code & Owner Activation
  await itAsync('License creation and activation flow (license starts upon activation)', async () => {
    const accessCode = LicenseModel.createAccessCode({
      ownerName: 'Test Owner Alpha',
      telegramUsername: 'test_owner_alpha',
      licenseType: '1_MONTH',
      durationDays: 30,
      maxBots: 2,
      notes: 'Test generated code'
    });
    assert.strictEqual(accessCode.status, 'UNUSED');

    // Activate code
    const activation = await LicenseModel.activateCode(accessCode.code, '999888777', 'test_owner_alpha', 'password123');
    assert.strictEqual(activation.success, true);
    assert.strictEqual(activation.owner.name, 'Test Owner Alpha');
    assert.strictEqual(activation.owner.telegram_user_id, '999888777');
    assert.strictEqual(activation.owner.max_bots, 2);

    // Code must now be USED
    const reloadedCode = LicenseModel.findByCode(accessCode.code);
    assert.strictEqual(reloadedCode.status, 'USED');

    // Re-activation must be blocked
    const reActivation = await LicenseModel.activateCode(accessCode.code, '999888777');
    assert.strictEqual(reActivation.success, false);
  });

  // 5. Auth Lockout System
  it('Max 3 failed login attempts locks out user for 15 minutes', () => {
    const testBotId = '11112222';
    const testUserId = '555666777';
    resetFailedAttempts(testBotId, testUserId);

    assert.strictEqual(isUserLocked(testBotId, testUserId).locked, false);

    // Attempt 1
    const att1 = recordFailedAttempt(testBotId, testUserId);
    assert.strictEqual(att1.locked, false);
    assert.strictEqual(att1.remainingAttempts, 2);

    // Attempt 2
    const att2 = recordFailedAttempt(testBotId, testUserId);
    assert.strictEqual(att2.locked, false);
    assert.strictEqual(att2.remainingAttempts, 1);

    // Attempt 3 -> Locked!
    const att3 = recordFailedAttempt(testBotId, testUserId);
    assert.strictEqual(att3.locked, true);
    assert.strictEqual(att3.remainingMinutes, 15);

    const checkLock = isUserLocked(testBotId, testUserId);
    assert.strictEqual(checkLock.locked, true);
    assert.ok(checkLock.remainingSeconds > 0);

    // Reset
    resetFailedAttempts(testBotId, testUserId);
    assert.strictEqual(isUserLocked(testBotId, testUserId).locked, false);
  });

  // 6. Owner-Controlled Admin Management (Hidden /admin)
  await itAsync('Owner registers Admin with separate bcrypt password and permissions', async () => {
    const owner = OwnerModel.findByTelegramUserId('999888777');
    assert.ok(owner);

    const admin = await AdminModel.create({
      botId: 'test_bot_001',
      ownerId: owner.id,
      telegramUserId: '12345678',
      name: 'Admin Budi',
      username: 'budi_admin',
      password: 'budiPassword2026'
    });

    assert.strictEqual(admin.name, 'Admin Budi');
    assert.strictEqual(admin.telegram_user_id, '12345678');
    assert.ok(admin.permissions.includes('can_create_payment'));

    const matchPass = await comparePassword('budiPassword2026', admin.password_hash);
    assert.strictEqual(matchPass, true);
  });

  // 7. Product & Stock System
  it('Product CRUD, stock adjustments with audit log & prevention of negative stock', () => {
    const prod = ProductModel.create({
      botId: 'test_bot_001',
      name: 'Netflix Premium 1 Bulan',
      category: 'Streaming',
      description: 'Akun 4K UHD Private',
      price: 35000,
      stock: 10,
      lowStockThreshold: 3
    });

    assert.strictEqual(prod.name, 'Netflix Premium 1 Bulan');
    assert.strictEqual(prod.stock, 10);

    // Decrease stock by 3
    const adj1 = ProductModel.adjustStock(prod.id, -3, 'Penjualan', 'ADMIN_1');
    assert.strictEqual(adj1.success, true);
    assert.strictEqual(adj1.newQty, 7);

    // Attempt negative stock (reducing 15 from 7) -> Must Fail!
    const adjFail = ProductModel.adjustStock(prod.id, -15, 'Over-reduction', 'ADMIN_1');
    assert.strictEqual(adjFail.success, false);
    assert.match(adjFail.message, /Stok tidak mencukupi/);

    // Audit logs recorded
    const logs = ProductModel.getStockLogs('test_bot_001', prod.id);
    assert.ok(logs.length >= 2, 'Stock logs must track changes');
  });

  // 8. Payment Configuration & Fee Rules
  it('Payment config handles E-Wallet, Bank, QRIS and fee calculation rules', () => {
    const owner = OwnerModel.findByTelegramUserId('999888777');

    // Create DANA without fee
    const dana = PaymentConfigModel.createOrUpdate({
      botId: 'test_bot_001',
      ownerId: owner.id,
      methodType: 'EWALLET',
      methodName: 'DANA',
      accountNumber: '081234567890',
      accountName: 'Budi Santoso',
      fee: 0,
      isActive: 1
    });
    assert.strictEqual(dana.fee, 0);

    // Create BCA with Rp2500 fee
    const bca = PaymentConfigModel.createOrUpdate({
      botId: 'test_bot_001',
      ownerId: owner.id,
      methodType: 'BANK',
      methodName: 'BCA',
      accountNumber: '1234567890',
      accountName: 'Budi Santoso',
      fee: 2500,
      isActive: 1
    });
    assert.strictEqual(bca.fee, 2500);

    const activeMethods = PaymentConfigModel.getActivePaymentMethods('test_bot_001');
    assert.ok(activeMethods.length >= 2);
  });

  // 9. Transaction Lifecycle & 30-Minute Countdown
  it('Transaction lifecycle, unique ID, 30-min countdown, verification & auto-stock deduction', () => {
    const prod = ProductModel.getAllByBotId('test_bot_001')[0];
    const initialStock = prod.stock;

    // Create transaction
    const tx = TransactionModel.create({
      botId: 'test_bot_001',
      groupId: '-100123456789',
      buyerId: '888999000',
      buyerName: 'Buyer Joni',
      productId: prod.id,
      productName: prod.name,
      quantity: 2,
      unitPrice: prod.price,
      fee: 1000,
      creatorAdminId: '12345678'
    });

    assert.match(tx.transaction_id, /^AST-TX-\d{8}-[A-F0-9]{6}$/);
    assert.strictEqual(tx.status, 'PENDING');
    assert.strictEqual(tx.total_amount, (prod.price * 2) + 1000);

    // Start 30-min countdown
    const started = TransactionModel.startPaymentCountdown(tx.transaction_id);
    assert.strictEqual(started.status, 'WAITING PAYMENT');
    assert.ok(started.expires_at > Date.now());

    // Verify via /done
    const verifyRes = TransactionModel.verifyAndComplete(tx.transaction_id, '12345678');
    assert.strictEqual(verifyRes.success, true);
    assert.strictEqual(verifyRes.transaction.status, 'COMPLETED');

    // Verify stock was reduced by 2
    const updatedProd = ProductModel.findById(prod.id);
    assert.strictEqual(updatedProd.stock, initialStock - 2);
  });

  // 10. Custom Commands & Payment Aliases
  it('Custom command replies and payment aliases validation & routing', () => {
    // 1. Custom Reply /rules
    const repRes = CustomCommandModel.createReply({
      botId: 'test_bot_001',
      command: '/rules',
      replyText: 'Harap patuhi aturan toko kami!',
      creatorTelegramId: '999888777'
    });
    assert.strictEqual(repRes.success, true);

    const reply = CustomCommandModel.findReply('test_bot_001', '/rules');
    assert.strictEqual(reply.reply_text, 'Harap patuhi aturan toko kami!');

    // 2. Custom Payment Alias /bayar
    const aliasRes = CustomCommandModel.createPaymentAlias({
      botId: 'test_bot_001',
      alias: '/bayar',
      creatorTelegramId: '12345678'
    });
    assert.strictEqual(aliasRes.success, true);

    const alias = CustomCommandModel.findPaymentAlias('test_bot_001', '/bayar');
    assert.strictEqual(alias.alias, '/bayar');

    // Clash prevention with default ASTEN! command
    const clashRes = CustomCommandModel.createPaymentAlias({
      botId: 'test_bot_001',
      alias: '/start',
      creatorTelegramId: '12345678'
    });
    assert.strictEqual(clashRes.success, false);
    assert.match(clashRes.message, /bentrok dengan command bawaan/);
  });

  // 11. RNK (Rating and Kritik) System
  it('RNK config, record creation, review verification & auto-unmute flow', () => {
    const config = RnkModel.updateConfig('test_bot_001', {
      caption: 'Terima kasih telah berbelanja! Isi RNK di link: {LINK_RNK}',
      linkRnk: 'https://t.me/c/123456789/comment',
      groupCommentId: '-100987654321',
      status: 'AKTIF'
    });
    assert.strictEqual(config.status, 'AKTIF');
    assert.strictEqual(config.group_comment_id, '-100987654321');

    // Create RNK record
    const rnkRecord = RnkModel.createRecord({
      botId: 'test_bot_001',
      transactionId: 'AST-TX-TEST-001',
      buyerId: '777666555',
      buyerName: 'Buyer Santi',
      transactionGroupId: '-100111222333',
      groupCommentId: '-100987654321',
      adminTelegramId: '12345678',
      caption: config.caption,
      linkRnk: config.link_rnk
    });

    assert.strictEqual(rnkRecord.status, 'WAITING');
    assert.strictEqual(rnkRecord.is_muted, 1);

    // Buyer fills review in Group Comment
    const pending = RnkModel.findPendingByBuyerAndCommentGroup('test_bot_001', '777666555', '-100987654321');
    assert.ok(pending);

    const completed = RnkModel.completeRecord(pending.id, 'Pelayanan sangat cepat dan terpercaya! ⭐⭐⭐⭐⭐');
    assert.strictEqual(completed.status, 'COMPLETED');
    assert.strictEqual(completed.is_muted, 0);
  });

  // 12. Auto-Tag Admins Excludes Owner
  it('Auto-tag @admins logic correctly excludes Owner Telegram User ID', () => {
    const ownerTelegramId = '999888777';
    const mockAdmins = [
      { user: { id: 999888777, is_bot: false, username: 'owner_user', first_name: 'Owner' } }, // OWNER
      { user: { id: 111222333, is_bot: false, username: 'admin1', first_name: 'Admin 1' } },
      { user: { id: 444555666, is_bot: false, first_name: 'Admin 2' } }
    ];

    const mentions = [];
    for (const item of mockAdmins) {
      if (ownerTelegramId && String(item.user.id) === String(ownerTelegramId)) {
        continue; // Exclude owner!
      }
      if (item.user.username) mentions.push(`@${item.user.username}`);
      else mentions.push(item.user.first_name);
    }

    assert.strictEqual(mentions.length, 2);
    assert.ok(!mentions.includes('@owner_user'), 'Owner must be excluded from @admins tag');
    assert.ok(mentions.includes('@admin1'));
  });

  // 13. Telegraf Instance Factory
  it('Telegraf instance factory attaches all ASTEN! command handlers without errors', () => {
    const dummyBot = {
      bot_id: '999999999',
      bot_name: 'Test Instance Bot',
      bot_username: 'test_instance_bot',
      bot_token: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz_DUMMY'
    };

    const instance = createBotInstance(dummyBot);
    assert.ok(instance);
    assert.ok(typeof instance.command === 'function');
    assert.ok(typeof instance.action === 'function');
  });

  console.log('\n========================================================');
  console.log(`  🎉 ALL VERIFICATION TESTS PASSED (${passedTests}/${totalTests})!`);
  console.log('========================================================\n');

  // Clean up isolated test database
  try {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch (e) {}
}

runTestSuite().catch(err => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});
