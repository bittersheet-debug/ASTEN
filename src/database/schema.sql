-- ASTEN! (ASISTEN TENAGA!) Database Schema (SQLite)

CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    telegram_username TEXT,
    telegram_user_id TEXT UNIQUE,
    password_hash TEXT,
    license_type TEXT NOT NULL,
    license_expires_at INTEGER,
    max_bots INTEGER DEFAULT 1,
    status TEXT DEFAULT 'ACTIVE',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS access_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    owner_name TEXT NOT NULL,
    telegram_username TEXT,
    telegram_user_id TEXT,
    license_type TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    max_bots INTEGER DEFAULT 1,
    status TEXT DEFAULT 'UNUSED',
    notes TEXT,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    used_by_owner_id INTEGER,
    FOREIGN KEY(used_by_owner_id) REFERENCES owners(id)
);

CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT UNIQUE NOT NULL,
    owner_id INTEGER NOT NULL,
    owner_telegram_id TEXT NOT NULL,
    bot_token_encrypted TEXT NOT NULL,
    bot_name TEXT NOT NULL,
    bot_username TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    is_official INTEGER DEFAULT 0,
    operational_status TEXT DEFAULT 'ONLINE', -- ONLINE, OFFLINE, CONNECTING, RESTARTING, ERROR, DISABLED
    api_status TEXT DEFAULT 'VALID', -- VALID, INVALID
    connection_status TEXT DEFAULT 'CONNECTED', -- CONNECTED, DISCONNECTED
    last_health_check INTEGER,
    error_message TEXT,
    restart_count INTEGER DEFAULT 0,
    webhook_url TEXT,
    settings_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(owner_id) REFERENCES owners(id)
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    telegram_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT,
    password_hash TEXT NOT NULL,
    permissions_json TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    is_payment_responsible INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(bot_id, telegram_user_id)
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Umum',
    description TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    photo_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    change_qty INTEGER NOT NULL,
    previous_qty INTEGER NOT NULL,
    new_qty INTEGER NOT NULL,
    reason TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    admin_telegram_id TEXT, -- NULL for default/owner payment, or Admin Telegram User ID
    method_type TEXT NOT NULL, -- EWALLET, BANK, QRIS
    method_name TEXT NOT NULL, -- DANA, BCA, QRIS, etc.
    account_number TEXT,
    account_name TEXT,
    caption TEXT,
    qris_image_path TEXT,
    fee REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    bot_id TEXT NOT NULL,
    group_id TEXT,
    buyer_id TEXT NOT NULL,
    buyer_name TEXT,
    buyer_username TEXT,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    fee REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    creator_admin_id TEXT NOT NULL,
    payment_config_id INTEGER,
    payment_details_json TEXT,
    status TEXT DEFAULT 'PENDING',
    invoice_sent_at INTEGER,
    expires_at INTEGER,
    verified_at INTEGER,
    verified_by TEXT,
    proof_file_id TEXT,
    buyer_chat_message_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_command_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    command TEXT NOT NULL,
    reply_text TEXT NOT NULL,
    media_url TEXT,
    creator_telegram_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(bot_id, command)
);

CREATE TABLE IF NOT EXISTS custom_command_payment_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    creator_telegram_id TEXT NOT NULL,
    group_id TEXT,
    is_active INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(bot_id, alias)
);

CREATE TABLE IF NOT EXISTS rnk_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT UNIQUE NOT NULL,
    caption TEXT NOT NULL,
    link_rnk TEXT,
    group_comment_id TEXT,
    status TEXT DEFAULT 'BELUM AKTIF',
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rnk_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    buyer_name TEXT,
    transaction_group_id TEXT NOT NULL,
    group_comment_id TEXT,
    admin_telegram_id TEXT NOT NULL,
    caption TEXT,
    link_rnk TEXT,
    requested_at INTEGER NOT NULL,
    submitted_at INTEGER,
    status TEXT DEFAULT 'WAITING',
    is_muted INTEGER DEFAULT 0,
    unmuted_at INTEGER,
    review_content TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    group_title TEXT,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    permissions_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(bot_id, group_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT,
    owner_id INTEGER,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
CREATE INDEX IF NOT EXISTS idx_admins_bot_user ON admins(bot_id, telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_products_bot ON products(bot_id);
CREATE INDEX IF NOT EXISTS idx_tx_bot_status ON transactions(bot_id, status);
CREATE INDEX IF NOT EXISTS idx_tx_buyer ON transactions(bot_id, buyer_id);
CREATE INDEX IF NOT EXISTS idx_rnk_waiting ON rnk_records(bot_id, buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_logs_bot ON activity_logs(bot_id, created_at);
