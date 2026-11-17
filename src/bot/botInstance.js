/**
 * ASTEN! (ASISTEN TENAGA!) - Bot Instance Factory
 */

const { Telegraf, Markup } = require('telegraf');
const StartHandler = require('./handlers/startHandler');
const ProductHandler = require('./handlers/productHandler');
const PaymentHandler = require('./handlers/paymentHandler');
const DoneHandler = require('./handlers/doneHandler');
const CancelHandler = require('./handlers/cancelHandler');
const CustomCommandHandler = require('./handlers/customCommandHandler');
const AdminHandler = require('./handlers/adminHandler');
const SettingsHandler = require('./handlers/settingsHandler');
const RnkHandler = require('./handlers/rnkHandler');
const GroupHandler = require('./handlers/groupHandler');
const OrderHandler = require('./handlers/orderHandler');
const AccessCodeBotHandler = require('./handlers/accessCodeBotHandler');
const ProductModel = require('../models/ProductModel');
const TransactionModel = require('../models/TransactionModel');
const RnkModel = require('../models/RnkModel');
const PaymentConfigModel = require('../models/PaymentConfigModel');
const { clearSession } = require('../security/auth');

function createBotInstance(botRecord) {
  const botToken = botRecord.bot_token;
  if (!botToken) {
    throw new Error(`Bot token not found for bot ID: ${botRecord.bot_id}`);
  }

  const bot = new Telegraf(botToken);

  // Global Error Handler so one bad update never crashes the process
  bot.catch((err, ctx) => {
    console.error(`[Bot Error - ${botRecord.bot_name} (${botRecord.bot_id})]:`, err.message);
  });

  // --- Pipeline Middlewares ---

  // 1. Group Comment review listener for RNK
  bot.use(RnkHandler.processGroupCommentListener);

  // 2. @admins Auto Tag Mention in group chats
  bot.use(GroupHandler.processAdminTagMention);

  // 3. Admin registration multi-step flow in Private Chat
  bot.use(AdminHandler.processAdminFlowMessage);

  // 4. Settings password verification flow in Private Chat
  bot.use(SettingsHandler.processSettingsAuthMessage);

  // 5. Custom Command Replies & Payment Aliases Router
  bot.use(CustomCommandHandler.processMessage);

  // 6. Access Code Wizard inputs (Prompt: buat kode akses @astenobot)
  bot.use(AccessCodeBotHandler.processWizardMessage);

  // 7. Access Code Activation & Bot Token Onboarding (Section 20)
  bot.use(StartHandler.processOnboardingMessage);

  // --- Core Commands (Sistem Utama ASTEN!) ---
  bot.command('start', StartHandler.handleStart);
  bot.command('help', StartHandler.handleHelp);
  bot.command('menu', StartHandler.handleMenu);
  bot.command('price', ProductHandler.handlePrice);
  bot.command('product', ProductHandler.handlePrice);
  bot.command('search', ProductHandler.handleSearch);
  bot.command('stock', ProductHandler.handleStock);
  bot.command('order', OrderHandler.handleOrder);
  bot.command('transaction', OrderHandler.handleTransaction);
  bot.command('payment', (ctx) => PaymentHandler.handlePaymentCommand(ctx));
  bot.command('done', DoneHandler.handleDone);
  bot.command('paymentlist', PaymentHandler.handlePaymentList);
  bot.command('paymentsettings', SettingsHandler.handleSettings);
  bot.command('paymentcancel', CancelHandler.handleCancel);
  bot.command('settings', SettingsHandler.handleSettings);
  bot.command('rnk', RnkHandler.handleRnkCommand);
  bot.command('mybots', StartHandler.handleMyBots);
  bot.command('addbot', StartHandler.handleAddBot);
  bot.command('status', StartHandler.handleSystemStatus);

  // Access Code Creation Commands (@Astenobot feature)
  bot.command(['buatkode', 'createcode', 'gencode'], AccessCodeBotHandler.handleCreateCodeCommand);
  bot.command(['listkode', 'daftarkode', 'codes'], AccessCodeBotHandler.handleListCodes);

  // Register Access Code Callbacks
  AccessCodeBotHandler.registerCallbacks(bot);

  // Hidden Owner Command (NOT shown in public menus or commands list)
  bot.command('admin', AdminHandler.handleHiddenAdminCommand);

  // Group Status Tracking (Auto Group Activation)
  bot.on('my_chat_member', GroupHandler.handleMyChatMemberUpdate);

  // --- Action / Callback Query Handlers ---
  bot.action('cmd_price', (ctx) => {
    ctx.answerCbQuery();
    return ProductHandler.handlePrice(ctx);
  });

  bot.action('cmd_search', (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('🔍 Silakan ketik: <code>/search &lt;nama produk&gt;</code>', { parse_mode: 'HTML' });
  });

  bot.action('cmd_my_tx', (ctx) => {
    ctx.answerCbQuery();
    return OrderHandler.handleTransaction(ctx);
  });

  bot.action('cmd_pay_info', (ctx) => {
    ctx.answerCbQuery();
    return PaymentHandler.handlePaymentList(ctx);
  });

  bot.action('cmd_settings', (ctx) => {
    ctx.answerCbQuery();
    return SettingsHandler.handleSettings(ctx);
  });

  bot.action('btn_status_sistem', async (ctx) => {
    ctx.answerCbQuery();
    return StartHandler.handleSystemStatus(ctx);
  });

  bot.action('btn_my_bots', async (ctx) => {
    ctx.answerCbQuery();
    return StartHandler.handleMyBots(ctx);
  });

  bot.action('cmd_help_official', async (ctx) => {
    ctx.answerCbQuery();
    return StartHandler.handleHelp(ctx);
  });

  // Buyer selecting payment method
  bot.action(/^payselect_([^_]+)_(\d+)$/, async (ctx) => {
    const txId = ctx.match[1];
    const methodId = parseInt(ctx.match[2], 10);
    return PaymentHandler.handlePaymentMethodSelected(ctx, txId, methodId);
  });

  // Buyer reselecting payment method
  bot.action(/^reselect_pay_(.+)$/, async (ctx) => {
    const txId = ctx.match[1];
    return PaymentHandler.handleReselectPayment(ctx, txId);
  });

  // Admin confirming specific transaction via /done
  bot.action(/^confirm_done_(.+)$/, async (ctx) => {
    const txId = ctx.match[1];
    await ctx.answerCbQuery('Memproses verifikasi...');
    return DoneHandler.executeDoneVerification(ctx, txId, String(ctx.from.id));
  });

  // Admin selecting product for /payment
  bot.action(/^payprod_(\d+)_(\d+)_(.*)$/, async (ctx) => {
    const productId = parseInt(ctx.match[1], 10);
    const buyerId = ctx.match[2];
    const buyerName = decodeURIComponent(ctx.match[3]);

    const product = ProductModel.findById(productId);
    if (!product) {
      return ctx.answerCbQuery('Produk tidak ditemukan.', { show_alert: true });
    }

    await ctx.answerCbQuery(`Produk ${product.name} dipilih.`);
    return PaymentHandler.executeCreateAndDeliverPayment({
      ctx,
      botId: String(ctx.botInfo.id),
      groupId: ctx.chat.id,
      buyerUser: { id: buyerId, first_name: buyerName },
      productName: product.name,
      unitPrice: product.price,
      quantity: 1,
      productId: product.id,
      adminId: String(ctx.from.id)
    });
  });

  bot.action('owner_add_bot_prompt', async (ctx) => {
    await ctx.answerCbQuery();
    return StartHandler.handleAddBot(ctx);
  });

  bot.action(/^restart_owner_bot_(.+)$/, async (ctx) => {
    const targetBotId = ctx.match[1];
    const botManager = require('./botManager');
    await ctx.answerCbQuery('Memulai restart bot...');
    try {
      await botManager.restartBot(targetBotId);
      await ctx.reply(`✅ Bot ID <code>${targetBotId}</code> berhasil direstart!`, { parse_mode: 'HTML' });
      return StartHandler.handleMyBots(ctx);
    } catch (err) {
      return ctx.reply(`❌ Gagal restart: ${err.message}`);
    }
  });

  bot.action(/^toggle_owner_bot_(.+)$/, async (ctx) => {
    const targetBotId = ctx.match[1];
    const botManager = require('./botManager');
    const BotModel = require('../models/BotModel');
    const botRec = BotModel.findByBotId(targetBotId);
    if (!botRec) return ctx.answerCbQuery('Bot tidak ditemukan.');

    const isRunning = botManager.activeInstances.has(targetBotId);
    await ctx.answerCbQuery(isRunning ? 'Menghentikan bot...' : 'Menjalankan bot...');

    try {
      if (isRunning) {
        await botManager.stopBot(targetBotId);
        BotModel.updateStatus(targetBotId, 'INACTIVE');
      } else {
        await botManager.startBot(botRec);
      }
      return StartHandler.handleMyBots(ctx);
    } catch (err) {
      return ctx.reply(`❌ Gagal mengubah status: ${err.message}`);
    }
  });

  // Settings Navigation Callbacks
  bot.action('back_to_main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    return SettingsHandler.handleSettings(ctx);
  });

  bot.action('lock_session', async (ctx) => {
    clearSession(String(ctx.botInfo.id), String(ctx.from.id));
    await ctx.answerCbQuery('Sesi Anda telah dikunci.');
    return ctx.editMessageText('🔒 Sesi telah dikunci demi keamanan. Silakan buka /settings kembali dan masukkan password jika ingin melanjutkan.');
  });

  bot.action('set_payments', async (ctx) => {
    await ctx.answerCbQuery();
    return SettingsHandler.showPaymentSettingsMenu(ctx, null);
  });

  bot.action('set_admin_payments', async (ctx) => {
    await ctx.answerCbQuery();
    return SettingsHandler.showPaymentSettingsMenu(ctx, String(ctx.from.id));
  });

  bot.action('set_owner_rnk', async (ctx) => {
    await ctx.answerCbQuery();
    return SettingsHandler.showRnkSettingsMenu(ctx);
  });

  bot.action('rnk_toggle_status', async (ctx) => {
    const rnk = RnkModel.getConfig(String(ctx.botInfo.id));
    const newStatus = rnk.status === 'AKTIF' ? 'BELUM AKTIF' : 'AKTIF';
    RnkModel.updateConfig(String(ctx.botInfo.id), { status: newStatus });
    await ctx.answerCbQuery(`Status RNK diubah menjadi ${newStatus}`);
    return SettingsHandler.showRnkSettingsMenu(ctx);
  });

  bot.action('rnk_preview', async (ctx) => {
    const rnk = RnkModel.getConfig(String(ctx.botInfo.id));
    const linkRnk = rnk.link_rnk || 'https://t.me/your_group_comment';
    const preview = rnk.caption.replace('{LINK_RNK}', linkRnk);
    await ctx.answerCbQuery();
    return ctx.reply(`👁️ <b>PREVIEW PESAN RNK PEMBELI:</b>\n\n${preview}`, { parse_mode: 'HTML' });
  });

  return bot;
}

module.exports = { createBotInstance };
