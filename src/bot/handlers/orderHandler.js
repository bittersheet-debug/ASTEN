/**
 * ASTEN! (ASISTEN TENAGA!) - Order & Transaction Status Handlers
 */

const { Markup } = require('telegraf');
const TransactionModel = require('../../models/TransactionModel');
const ProductModel = require('../../models/ProductModel');

const OrderHandler = {
  handleOrder: async (ctx) => {
    let msg = `🛒 <b>PANDUAN PEMESANAN TOKO</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `Untuk melakukan pemesanan barang/jasa di toko ini, ikuti langkah mudah berikut:\n\n`;
    msg += `1. Lihat daftar produk dan harga dengan mengetik <code>/price</code>.\n`;
    msg += `2. Di grup toko, sebutkan produk yang ingin Anda beli, atau minta Admin membuatkan tagihan.\n`;
    msg += `3. Admin kami akan melakukan <b>REPLY</b> pesan Anda menggunakan <code>/payment</code>.\n`;
    msg += `4. Rincian tagihan akan dikirimkan langsung ke <b>Private Chat</b> Anda secara aman.\n`;
    msg += `5. Lakukan transfer sesuai nominal, lalu kirim screenshot bukti transfer ke grup.\n`;
    msg += `6. Admin akan memverifikasi menggunakan <code>/done</code> dan pesanan Anda langsung diproses!\n\n`;
    msg += `<i>Ada pertanyaan? Silakan tag Admin toko di grup.</i>`;

    return ctx.reply(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📦 Lihat Pricelist', 'cmd_price')],
        [Markup.button.callback('📜 Cek Status Transaksi Saya', 'cmd_my_tx')]
      ])
    });
  },

  handleTransaction: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const txs = TransactionModel.getAllByBotId(botId, 50).filter(t => String(t.buyer_id) === userId);

    if (txs.length === 0) {
      return ctx.reply('📜 <b>Riwayat Transaksi</b>\n\nAnda belum memiliki riwayat transaksi di toko ini.', { parse_mode: 'HTML' });
    }

    let msg = `📜 <b>RIWAYAT TRANSAKSI ANDA</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    txs.slice(0, 5).forEach((t, i) => {
      let statusIcon = '⏳';
      if (t.status === 'COMPLETED' || t.status === 'PAID') statusIcon = '✅';
      if (t.status === 'EXPIRED') statusIcon = '⏰';
      if (t.status === 'CANCELLED') statusIcon = '🚫';

      msg += `${i + 1}. <b>${t.transaction_id}</b>\n`;
      msg += `   📦 Produk: <b>${t.product_name}</b> (x${t.quantity})\n`;
      msg += `   💰 Total: <b>Rp${Number(t.total_amount).toLocaleString('id-ID')}</b>\n`;
      msg += `   📊 Status: ${statusIcon} <b>${t.status}</b>\n\n`;
    });

    return ctx.reply(msg, { parse_mode: 'HTML' });
  }
};

module.exports = OrderHandler;
