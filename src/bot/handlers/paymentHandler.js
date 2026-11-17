/**
 * ASTEN! (ASISTEN TENAGA!) - Payment & Checkout Flow Handlers
 */

const { Markup } = require('telegraf');
const TransactionModel = require('../../models/TransactionModel');
const PaymentConfigModel = require('../../models/PaymentConfigModel');
const ProductModel = require('../../models/ProductModel');
const AdminModel = require('../../models/AdminModel');
const OwnerModel = require('../../models/OwnerModel');
const TelegramService = require('../../services/telegramService');
const LogModel = require('../../models/LogModel');
const config = require('../../config/config');
const fs = require('fs');

const PaymentHandler = {
  /**
   * Main /payment handler (and shared by custom payment aliases)
   */
  handlePaymentCommand: async (ctx, customAlias = null) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    // Must be Admin or Owner
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);
    const isAuthorized = owner || (admin && admin.is_active && admin.permissions.includes('can_create_payment'));

    if (!isAuthorized) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk membuat tagihan pembayaran.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    // Must be used via REPLY in group (or private with explicit target)
    const replyMessage = ctx.message?.reply_to_message;
    if (!replyMessage || !replyMessage.from) {
      const cmdName = customAlias || '/payment';
      return ctx.reply(
        `ℹ️ <b>Cara Menggunakan ${cmdName}:</b>\n\n` +
        `Admin wajib melakukan <b>REPLY</b> terhadap pesan pembeli di grup, kemudian ketik:\n` +
        `• <code>${cmdName}</code> (pilih produk dari daftar), ATAU\n` +
        `• <code>${cmdName} &lt;nominal&gt;</code> (contoh: <code>${cmdName} 25000</code>), ATAU\n` +
        `• <code>${cmdName} &lt;nama_produk&gt; &lt;nominal&gt;</code> (contoh: <code>${cmdName} Spotify 35000</code>)`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    const targetBuyer = replyMessage.from;
    if (targetBuyer.is_bot) {
      return ctx.reply('❌ Tidak dapat membuat tagihan untuk akun bot.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    // Determine product & amount from command arguments or reply
    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    parts.shift(); // remove command

    let productName = 'Pesanan Khusus';
    let unitPrice = 0;
    let quantity = 1;
    let productId = null;

    if (parts.length === 1 && !isNaN(parts[0])) {
      // e.g. /payment 25000
      unitPrice = parseFloat(parts[0]);
    } else if (parts.length >= 2 && !isNaN(parts[parts.length - 1])) {
      // e.g. /payment Netflix Premium 45000
      unitPrice = parseFloat(parts[parts.length - 1]);
      productName = parts.slice(0, parts.length - 1).join(' ');
    } else {
      // No amount provided, let Admin choose from available active products
      const activeProducts = ProductModel.getAllByBotId(botId, true);
      if (activeProducts.length > 0) {
        let selectMsg = `🛒 <b>Pilih Produk untuk Pembeli:</b> <a href="tg://user?id=${targetBuyer.id}">${targetBuyer.first_name || 'Pembeli'}</a>\n`;
        selectMsg += `Atau balas dengan nominal langsung: <code>${customAlias || '/payment'} &lt;nominal&gt;</code>`;

        const buttons = activeProducts.slice(0, 8).map(p => [
          Markup.button.callback(
            `📦 ${p.name} - Rp${Number(p.price).toLocaleString('id-ID')}`,
            `payprod_${p.id}_${targetBuyer.id}_${encodeURIComponent(targetBuyer.first_name || '')}`
          )
        ]);

        return ctx.reply(selectMsg, {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message?.message_id,
          ...Markup.inlineKeyboard(buttons)
        });
      } else {
        return ctx.reply(
          `⚠️ Silakan cantumkan nominal harga. Contoh:\n<code>${customAlias || '/payment'} 50000</code>`,
          { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
        );
      }
    }

    // Execute transaction creation and checkout delivery
    return PaymentHandler.executeCreateAndDeliverPayment({
      ctx,
      botId,
      groupId: ctx.chat.id,
      buyerUser: targetBuyer,
      productName,
      unitPrice,
      quantity,
      productId,
      adminId: userId
    });
  },

  /**
   * Core logic: Create transaction, calculate fee, and deliver privately
   */
  executeCreateAndDeliverPayment: async ({
    ctx,
    botId,
    groupId,
    buyerUser,
    productName,
    unitPrice,
    quantity,
    productId,
    adminId
  }) => {
    // Determine payment configuration to use (Admin-specific or default Owner config)
    const activeMethods = PaymentConfigModel.getActivePaymentMethods(botId, adminId);
    if (!activeMethods || activeMethods.length === 0) {
      return ctx.reply(
        `⚠️ <b>Metode Pembayaran Belum Tersedia!</b>\n\nAdmin belum mengonfigurasi rekening/e-wallet/QRIS yang aktif.\nSilakan atur di: <i>Private Chat &rarr; /settings &rarr; Pembayaran</i>.`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    // Check optional fee from the first active method or config
    let fee = 0;
    const methodWithFee = activeMethods.find(m => m.fee && Number(m.fee) > 0);
    if (methodWithFee) {
      fee = Number(methodWithFee.fee);
    }

    // Create transaction in database
    const tx = TransactionModel.create({
      botId,
      groupId: String(groupId),
      buyerId: buyerUser.id,
      buyerName: buyerUser.first_name || buyerUser.username || 'Pembeli',
      buyerUsername: buyerUser.username || '',
      productId,
      productName,
      quantity,
      unitPrice,
      fee,
      creatorAdminId: adminId
    });

    LogModel.log({
      botId,
      actorType: 'ADMIN',
      actorId: adminId,
      action: 'PAYMENT_GENERATED',
      details: `Transaksi ${tx.transaction_id} dibuat untuk pembeli ${buyerUser.id} (${productName} x${quantity}) Total: Rp${tx.total_amount}`
    });

    // Attempt to deliver payment instructions to Buyer in PRIVATE CHAT!
    const bot = require('../../models/BotModel').findByBotId(botId);
    let invoiceMsg = `🧾 <b>RINCIAN PEMBAYARAN ASTEN!</b>\n`;
    invoiceMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    invoiceMsg += `🔖 ID Transaksi: <code>${tx.transaction_id}</code>\n`;
    invoiceMsg += `📦 Produk: <b>${tx.product_name}</b>\n`;
    invoiceMsg += `🔢 Jumlah: <b>${tx.quantity} pcs</b>\n`;
    invoiceMsg += `💵 Harga Satuan: <b>Rp${Number(tx.unit_price).toLocaleString('id-ID')}</b>\n`;

    // Fee Rule: If fee > 0, display fee line. If fee is not set or 0, DO NOT display fee line or Rp0!
    if (tx.fee && Number(tx.fee) > 0) {
      invoiceMsg += `🏷️ Biaya Layanan / Fee: <b>Rp${Number(tx.fee).toLocaleString('id-ID')}</b>\n`;
    }

    invoiceMsg += `💰 <b>Total Tagihan: Rp${Number(tx.total_amount).toLocaleString('id-ID')}</b>\n`;
    invoiceMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    invoiceMsg += `⏰ Batas Waktu Pembayaran: <b>30 Menit</b>\n\n`;
    invoiceMsg += `Pilih salah satu metode pembayaran aktif berikut:`;

    const methodButtons = activeMethods.map(m => {
      let icon = '💳';
      if (m.method_type === 'EWALLET') icon = '📱';
      if (m.method_type === 'QRIS') icon = '📷';
      return [Markup.button.callback(`${icon} ${m.method_name}`, `payselect_${tx.transaction_id}_${m.id}`)];
    });

    const sendRes = await TelegramService.sendMessage(
      bot.bot_token,
      buyerUser.id,
      invoiceMsg,
      { reply_markup: { inline_keyboard: methodButtons } }
    );

    if (sendRes.success) {
      // 30-minute countdown starts now!
      TransactionModel.startPaymentCountdown(tx.transaction_id, null, sendRes.result?.message_id);

      // Notify the group with a clean confirmation (NEVER reveal bank/ewallet/qris to group!)
      return ctx.reply(
        `✅ <b>Instruksi Pembayaran Berhasil Dikirim!</b>\n\n` +
        `👤 Pembeli: <a href="tg://user?id=${buyerUser.id}">${buyerUser.first_name || 'Pembeli'}</a>\n` +
        `🔖 ID Transaksi: <code>${tx.transaction_id}</code>\n` +
        `💰 Total: <b>Rp${Number(tx.total_amount).toLocaleString('id-ID')}</b>\n` +
        `⏳ Batas waktu: <b>30 Menit</b>\n\n` +
        `<i>Detail pembayaran telah dikirim ke Private Chat demi keamanan & privasi transaksi.</i>`,
        {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message?.message_id,
          ...Markup.inlineKeyboard([
            [Markup.button.url('📩 Buka Private Chat', `https://t.me/${ctx.botInfo.username}`)]
          ])
        }
      );
    } else {
      // Failed to send to private chat (buyer hasn't pressed /start or has blocked the bot)
      const deepLink = `https://t.me/${ctx.botInfo.username}?start=pay_${tx.transaction_id}`;
      return ctx.reply(
        `⚠️ <b>Pembeli Belum Membuka Bot!</b>\n\n` +
        `Halo <a href="tg://user?id=${buyerUser.id}">${buyerUser.first_name || 'Pembeli'}</a>, bot tidak dapat mengirim pesan pribadi sebelum Anda menekan tombol Start.\n\n` +
        `Silakan klik tombol di bawah untuk mengambil rincian tagihan Anda:`,
        {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message?.message_id,
          ...Markup.inlineKeyboard([
            [Markup.button.url('👉 Ambil Tagihan Pembayaran', deepLink)]
          ])
        }
      );
    }
  },

  /**
   * Handle buyer selecting specific payment method
   */
  handlePaymentMethodSelected: async (ctx, txId, methodId) => {
    const botId = String(ctx.botInfo.id);
    const tx = TransactionModel.findByTransactionId(txId);
    if (!tx) {
      return ctx.answerCbQuery('❌ Transaksi tidak ditemukan atau telah kedaluwarsa.', { show_alert: true });
    }

    if (tx.status === 'EXPIRED') {
      return ctx.answerCbQuery('⏳ Transaksi telah kedaluwarsa (30 menit). Silakan minta tagihan baru.', { show_alert: true });
    }

    const method = PaymentConfigModel.findById(methodId);
    if (!method || !method.is_active) {
      return ctx.answerCbQuery('⚠️ Metode pembayaran ini sedang tidak aktif.', { show_alert: true });
    }

    let detailMsg = `💳 <b>DETAIL PEMBAYARAN: ${method.method_name.toUpperCase()}</b>\n`;
    detailMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    detailMsg += `🔖 ID Transaksi: <code>${tx.transaction_id}</code>\n`;
    detailMsg += `📦 Produk: <b>${tx.product_name}</b> (x${tx.quantity})\n`;

    // Fee Rule: If fee > 0, display fee line. If fee is not set or 0, DO NOT display fee line or Rp0!
    if (tx.fee && Number(tx.fee) > 0) {
      detailMsg += `🏷️ Biaya Tambahan: <b>Rp${Number(tx.fee).toLocaleString('id-ID')}</b>\n`;
    }

    detailMsg += `💰 <b>Total Transfer: Rp${Number(tx.total_amount).toLocaleString('id-ID')}</b>\n`;
    detailMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (method.method_type === 'QRIS') {
      detailMsg += `📷 <b>Instruksi Pembayaran QRIS:</b>\n`;
      detailMsg += `1. Simpan atau scan gambar QRIS di bawah ini.\n`;
      detailMsg += `2. Buka aplikasi E-Wallet / Mobile Banking Anda.\n`;
      detailMsg += `3. Masukkan nominal transfer tepat: <b>Rp${Number(tx.total_amount).toLocaleString('id-ID')}</b>\n`;
      if (method.caption) {
        detailMsg += `\n💬 Catatan: <i>${method.caption}</i>\n`;
      }
      detailMsg += `\n4. Setelah transfer berhasil, kirimkan bukti screenshot ke grup atau Admin kami untuk verifikasi via /done.`;

      await ctx.answerCbQuery('Menyiapkan QRIS...');

      // If QRIS has a photo file on disk
      if (method.qris_image_path && fs.existsSync(method.qris_image_path)) {
        return ctx.replyWithPhoto({ source: method.qris_image_path }, {
          caption: detailMsg,
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Ganti Metode Pembayaran', `reselect_pay_${tx.transaction_id}`)]
          ])
        });
      } else {
        // Fallback text QRIS
        return ctx.reply(detailMsg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Ganti Metode Pembayaran', `reselect_pay_${tx.transaction_id}`)]
          ])
        });
      }
    } else {
      // E-Wallet or Bank
      const typeLabel = method.method_type === 'EWALLET' ? 'Nomor E-Wallet' : 'Nomor Rekening';
      detailMsg += `🏦 ${typeLabel}: <code>${method.account_number}</code>\n`;
      detailMsg += `👤 Atas Nama: <b>${method.account_name}</b>\n`;
      if (method.caption) {
        detailMsg += `💬 Catatan: <i>${method.caption}</i>\n`;
      }
      detailMsg += `\n<i>(Tekan nomor rekening/e-wallet di atas untuk menyalin otomatis)</i>\n\n`;
      detailMsg += `⚠️ <b>Penting:</b>\nHarap transfer sesuai nominal yang tertera. Setelah transfer, kirim bukti pembayaran ke grup transaksi agar diverifikasi oleh Admin.`;

      await ctx.answerCbQuery('Detail pembayaran dimuat.');
      return ctx.editMessageText(detailMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⬅️ Ganti Metode Pembayaran', `reselect_pay_${tx.transaction_id}`)]
        ])
      });
    }
  },

  /**
   * Reselect payment method
   */
  handleReselectPayment: async (ctx, txId) => {
    const tx = TransactionModel.findByTransactionId(txId);
    if (!tx) {
      return ctx.answerCbQuery('Transaksi tidak ditemukan.', { show_alert: true });
    }
    const StartHandler = require('./startHandler');
    await ctx.answerCbQuery();
    return StartHandler.showBuyerPaymentInvoice(ctx, tx);
  },

  /**
   * /paymentlist command: list all active payment options
   */
  handlePaymentList: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const methods = PaymentConfigModel.getActivePaymentMethods(botId);

    if (methods.length === 0) {
      return ctx.reply('⚠️ Belum ada metode pembayaran aktif di toko ini.', { parse_mode: 'HTML' });
    }

    let msg = `💳 <b>DAFTAR METODE PEMBAYARAN TOKO</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    methods.forEach((m, i) => {
      let icon = '💳';
      if (m.method_type === 'EWALLET') icon = '📱';
      if (m.method_type === 'QRIS') icon = '📷';

      msg += `${i + 1}. ${icon} <b>${m.method_name}</b> (${m.method_type})\n`;
      if (m.fee && Number(m.fee) > 0) {
        msg += `   🏷️ Fee: Rp${Number(m.fee).toLocaleString('id-ID')}\n`;
      }
      if (m.caption) {
        msg += `   💬 <i>${m.caption}</i>\n`;
      }
      msg += `\n`;
    });

    msg += `<i>Catatan: Nomor rekening dan barcode QRIS akan diberikan secara personal di Private Chat saat melakukan pembayaran demi keamanan transaksi.</i>`;

    return ctx.reply(msg, { parse_mode: 'HTML' });
  }
};

module.exports = PaymentHandler;
