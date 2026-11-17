/**
 * ASTEN! (ASISTEN TENAGA!) - Authentication & Session Lockout Guard
 */

const { AUTH_SESSION_MINUTES, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES } = require('../config/constants');

// In-memory / persistent session & lockout tracking
// Key format: `${botId}:${userId}`
const failedAttempts = new Map(); // key -> { count: number, lockedUntil: timestamp }
const activeSessions = new Map(); // key -> { authenticatedAt: timestamp, role: string, data: any }

/**
 * Check if user is locked out
 */
function isUserLocked(botId, userId) {
  const key = `${botId}:${userId}`;
  const record = failedAttempts.get(key);
  if (!record) return { locked: false, remainingSeconds: 0 };
  
  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, remainingSeconds };
  }
  
  if (record.lockedUntil && record.lockedUntil <= now) {
    // Lockout expired, reset attempts
    failedAttempts.delete(key);
  }
  
  return { locked: false, remainingSeconds: 0 };
}

/**
 * Record a failed attempt. If count >= MAX_LOGIN_ATTEMPTS, lock for 15 minutes.
 */
function recordFailedAttempt(botId, userId) {
  const key = `${botId}:${userId}`;
  const now = Date.now();
  const record = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  
  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + (LOCKOUT_DURATION_MINUTES * 60 * 1000);
    failedAttempts.set(key, record);
    return { locked: true, remainingAttempts: 0, remainingMinutes: LOCKOUT_DURATION_MINUTES };
  }
  
  failedAttempts.set(key, record);
  return { 
    locked: false, 
    remainingAttempts: MAX_LOGIN_ATTEMPTS - record.count, 
    remainingMinutes: 0 
  };
}

/**
 * Reset failed attempts upon successful login
 */
function resetFailedAttempts(botId, userId) {
  const key = `${botId}:${userId}`;
  failedAttempts.delete(key);
}

/**
 * Create or refresh user authenticated session (valid for 15 minutes)
 */
function createSession(botId, userId, role = 'admin', metadata = {}) {
  const key = `${botId}:${userId}`;
  const now = Date.now();
  activeSessions.set(key, {
    authenticatedAt: now,
    expiresAt: now + (AUTH_SESSION_MINUTES * 60 * 1000),
    role,
    metadata
  });
  resetFailedAttempts(botId, userId);
}

/**
 * Check if user has an active authenticated session
 */
function hasActiveSession(botId, userId) {
  const key = `${botId}:${userId}`;
  const session = activeSessions.get(key);
  if (!session) return false;
  
  const now = Date.now();
  if (session.expiresAt > now) {
    // Optionally refresh or keep remaining
    return true;
  }
  
  // Expired
  activeSessions.delete(key);
  return false;
}

/**
 * Clear session
 */
function clearSession(botId, userId) {
  const key = `${botId}:${userId}`;
  activeSessions.delete(key);
}

/**
 * Helper to safely delete message from Telegram chat (e.g. password input)
 */
async function safeDeleteMessage(ctx, messageId) {
  try {
    const id = messageId || ctx.message?.message_id;
    if (id && ctx.chat) {
      await ctx.telegram.deleteMessage(ctx.chat.id, id);
    }
  } catch (err) {
    // Telegram might not allow deleting message if too old or lacks permission; ignore safely
  }
}

module.exports = {
  isUserLocked,
  recordFailedAttempt,
  resetFailedAttempts,
  createSession,
  hasActiveSession,
  clearSession,
  safeDeleteMessage
};
