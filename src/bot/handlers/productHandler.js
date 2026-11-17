/**
 * ASTEN! (ASISTEN TENAGA!) - Product, Price & Stock Handlers
 */

const { Markup } = require('telegraf');
const ProductModel = require('../../models/ProductModel');
const OwnerModel = require('../../models/OwnerModel');
const AdminModel = require('../../models/AdminModel');

const ProductHandler = {
  handlePrice: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const products = ProductModel.getAllByBotId(botId, true); // Only active products

    if (products.length === 0) {
      return ctx.reply('📦 <b>Katalog Produk</b>\n\nSaat ini belum ada produk aktif yang terdaftar di toko ini.', { parse_mode: 'HTML' });
    }

    // Group by category
    const categories = {};
    products.forEach(p => {
      const cat = p.category || 'Umum';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(p);
    });

    let msg = `🛍️ <b>KATALOG HARGA & PRODUK (PRICELIST)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const [cat, items] of Object.entries(categories)) {
      msg += `📁 <b>KATEGORI: ${cat.toUpperCase()}</b>\n`;
      items.forEach((item, idx) => {
        let stockBadge = '🟢 Ready';
        if (item.stock === 0) stockBadge = '🔴 Stok Habis';
        else if (item.stock <= item.low_stock_threshold) stockBadge = `🟡 Sisa ${item.stock}`;

        msg += `<b>${idx + 1}. ${item.name}</b>\n`;
        if (item.description) msg += `   <i>${item.description}</i>\n`;
        msg += `   💵 Harga: <b>Rp${Number(item.price).toLocaleString('id-ID')}</b>\n`;
        msg += `   📦 Status: <b>${stockBadge}</b>\n\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    msg += `<i>Untuk melakukan pemesanan, silakan reply pesan di grup atau hubungi Admin kami!</i>`;

    return ctx.reply(msg, { parse_mode: 'HTML' });
  },

  handleSearch: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const text = ctx.message?.text || '';
    const parts = text.split(' ');
    parts.shift(); // Remove /search
    const query = parts.join(' ').trim();

    if (!query) {
      return ctx.reply('🔍 <b>Format Pencarian:</b>\nKetik: <code>/search &lt;nama produk&gt;</code>\nContoh: <code>/search netflix</code>', { parse_mode: 'HTML' });
    }

    const results = ProductModel.search(botId, query);
    if (results.length === 0) {
      return ctx.reply(`🔍 Produk dengan kata kunci "<b>${query}</b>" tidak ditemukan.`, { parse_mode: 'HTML' });
    }

    let msg = `🔍 <b>HASIL PENCARIAN PRODUK:</b> "${query}"\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    results.forEach((p, i) => {
      let stockBadge = '🟢 Ready';
      if (p.stock === 0) stockBadge = '🔴 Habis';
      else if (p.stock <= p.low_stock_threshold) stockBadge = `🟡 Sisa ${p.stock}`;

      msg += `<b>${i + 1}. ${p.name}</b> (${p.category})\n`;
      if (p.description) msg += `   <i>${p.description}</i>\n`;
      msg += `   💵 Rp${Number(p.price).toLocaleString('id-ID')} | Stok: ${stockBadge}\n\n`;
    });

    return ctx.reply(msg, { parse_mode: 'HTML' });
  },

  handleStock: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);

    // Stock management permission check
    const isAuthorized = owner || (admin && admin.is_active && (admin.permissions.includes('can_manage_stock') || admin.permissions.includes('can_manage_products')));

    if (!isAuthorized) {
      // General public stock view
      const stats = ProductModel.getStats(botId);
      return ctx.reply(
        `📦 <b>Informasi Stok Toko</b>\n\nTotal Produk Aktif: <b>${stats.totalProducts}</b>\nTotal Stok Tersedia: <b>${stats.totalStock} pcs</b>`,
        { parse_mode: 'HTML' }
      );
    }

    // Detailed Admin/Owner Stock View
    const stats = ProductModel.getStats(botId);
    const products = ProductModel.getAllByBotId(botId);

    let msg = `📊 <b>RINGKASAN PENGELOLAAN STOK TOKO</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📦 Total Jenis Produk: <b>${stats.totalProducts}</b>\n`;
    msg += `🔢 Total Akumulasi Stok: <b>${stats.totalStock} pcs</b>\n`;
    msg += `🟡 Stok Menipis (&le; limit): <b>${stats.lowStockCount} produk</b>\n`;
    msg += `🔴 Stok Habis (0): <b>${stats.outOfStockCount} produk</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `<b>Daftar Stok Produk Saat Ini:</b>\n`;
    products.forEach((p) => {
      let badge = '🟢';
      if (p.stock === 0) badge = '🔴';
      else if (p.stock <= p.low_stock_threshold) badge = '🟡';

      msg += `${badge} <b>${p.name}</b>: <code>${p.stock} pcs</code> (Min: ${p.low_stock_threshold})\n`;
    });

    const buttons = [
      [Markup.button.callback('🔄 Refresh Stok', 'refresh_stock_view')],
      [Markup.button.callback('📜 Riwayat Perubahan Stok', 'view_stock_logs')]
    ];

    return ctx.reply(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }
};

module.exports = ProductHandler;
