/**
 * ASTEN! (ASISTEN TENAGA!) - Product & Stock Model
 */

const db = require('../database/db');

const ProductModel = {
  create: ({ botId, name, category = 'Umum', description = '', price, stock = 0, lowStockThreshold = 5, photoUrl = null }) => {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO products (
        bot_id, name, category, description, price, stock,
        low_stock_threshold, photo_url, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const result = stmt.run(
      String(botId),
      name.trim(),
      category.trim(),
      description,
      Number(price),
      Math.max(0, parseInt(stock, 10)),
      Math.max(1, parseInt(lowStockThreshold, 10)),
      photoUrl,
      now,
      now
    );

    const productId = result.lastInsertRowid;

    // Record initial stock log
    if (stock > 0) {
      db.prepare(`
        INSERT INTO stock_logs (bot_id, product_id, change_qty, previous_qty, new_qty, reason, changed_by, created_at)
        VALUES (?, ?, ?, 0, ?, 'Initial Stock', 'SYSTEM', ?)
      `).run(String(botId), productId, stock, stock, now);
    }

    return ProductModel.findById(productId);
  },

  findById: (id) => {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  },

  getAllByBotId: (botId, onlyActive = false) => {
    let sql = 'SELECT * FROM products WHERE bot_id = ?';
    if (onlyActive) {
      sql += ' AND is_active = 1';
    }
    sql += ' ORDER BY category ASC, name ASC';
    return db.prepare(sql).all(String(botId));
  },

  search: (botId, query) => {
    const term = `%${query.trim().toLowerCase()}%`;
    return db.prepare(`
      SELECT * FROM products 
      WHERE bot_id = ? AND is_active = 1 AND (LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(description) LIKE ?)
      ORDER BY name ASC
    `).all(String(botId), term, term, term);
  },

  update: (id, { name, category, description, price, lowStockThreshold, photoUrl, isActive }) => {
    const current = ProductModel.findById(id);
    if (!current) return null;

    const now = Date.now();
    db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        low_stock_threshold = COALESCE(?, low_stock_threshold),
        photo_url = COALESCE(?, photo_url),
        is_active = COALESCE(?, is_active),
        updated_at = ?
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      category ? category.trim() : null,
      description !== undefined ? description : null,
      price !== undefined ? Number(price) : null,
      lowStockThreshold !== undefined ? parseInt(lowStockThreshold, 10) : null,
      photoUrl !== undefined ? photoUrl : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      now,
      id
    );

    return ProductModel.findById(id);
  },

  /**
   * Adjust stock and log the audit trail.
   * Prevents stock from becoming negative!
   */
  adjustStock: (id, changeQty, reason = 'Manual Adjustment', changedBy = 'ADMIN') => {
    const product = ProductModel.findById(id);
    if (!product) {
      return { success: false, message: 'Produk tidak ditemukan.' };
    }

    const previousQty = product.stock;
    const newQty = previousQty + changeQty;

    if (newQty < 0) {
      return { 
        success: false, 
        message: `Stok tidak mencukupi! Stok saat ini: ${previousQty}, permintaan pengurangan: ${Math.abs(changeQty)}.` 
      };
    }

    const now = Date.now();
    db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?')
      .run(newQty, now, id);

    db.prepare(`
      INSERT INTO stock_logs (bot_id, product_id, change_qty, previous_qty, new_qty, reason, changed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product.bot_id, id, changeQty, previousQty, newQty, reason, String(changedBy), now);

    const isLowStock = newQty > 0 && newQty <= product.low_stock_threshold;
    const isOutOfStock = newQty === 0;

    return {
      success: true,
      previousQty,
      newQty,
      isLowStock,
      isOutOfStock,
      product: ProductModel.findById(id)
    };
  },

  getStockLogs: (botId, productId = null) => {
    if (productId) {
      return db.prepare(`
        SELECT sl.*, p.name as product_name
        FROM stock_logs sl
        JOIN products p ON sl.product_id = p.id
        WHERE sl.bot_id = ? AND sl.product_id = ?
        ORDER BY sl.created_at DESC LIMIT 100
      `).all(String(botId), productId);
    }
    return db.prepare(`
      SELECT sl.*, p.name as product_name
      FROM stock_logs sl
      JOIN products p ON sl.product_id = p.id
      WHERE sl.bot_id = ?
      ORDER BY sl.created_at DESC LIMIT 100
    `).all(String(botId));
  },

  delete: (id) => {
    return db.prepare('DELETE FROM products WHERE id = ?').run(id);
  },

  getStats: (botId) => {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE bot_id = ?').get(String(botId)).count;
    const totalStock = db.prepare('SELECT SUM(stock) as sum FROM products WHERE bot_id = ?').get(String(botId)).sum || 0;
    const lowStockCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE bot_id = ? AND stock > 0 AND stock <= low_stock_threshold').get(String(botId)).count;
    const outOfStockCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE bot_id = ? AND stock = 0').get(String(botId)).count;
    return { totalProducts, totalStock, lowStockCount, outOfStockCount };
  }
};

module.exports = ProductModel;
