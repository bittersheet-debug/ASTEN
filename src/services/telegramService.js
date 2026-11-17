/**
 * ASTEN! (ASISTEN TENAGA!) - Telegram Bot API Service Helper
 */

const axios = require('axios');

const TelegramService = {
  /**
   * Validate Bot Token via getMe API
   */
  validateToken: async (token) => {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10000 });
      if (response.data && response.data.ok) {
        return {
          valid: true,
          bot: response.data.result // { id, is_bot, first_name, username, ... }
        };
      }
      return { valid: false, error: 'Token tidak valid' };
    } catch (err) {
      const msg = err.response?.data?.description || err.message;
      return { valid: false, error: msg };
    }
  },

  /**
   * Send message to user or chat, with precise error detection
   * (checks if buyer has blocked or not started the bot)
   */
  sendMessage: async (token, chatId, text, options = {}) => {
    try {
      const payload = {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: options.disable_web_page_preview !== undefined ? options.disable_web_page_preview : true,
        reply_markup: options.reply_markup || undefined
      };

      const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, payload, { timeout: 10000 });
      return { success: true, result: response.data.result };
    } catch (err) {
      const desc = err.response?.data?.description || err.message;
      const isChatNotFound = desc.includes('chat not found') || desc.includes('bot was blocked') || desc.includes('user is deactivated');
      return { 
        success: false, 
        error: desc,
        isChatNotFound
      };
    }
  },

  /**
   * Send photo (e.g., QRIS image)
   */
  sendPhoto: async (token, chatId, photo, caption, options = {}) => {
    try {
      const payload = {
        chat_id: chatId,
        photo,
        caption,
        parse_mode: options.parse_mode || 'HTML',
        reply_markup: options.reply_markup || undefined
      };
      const response = await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, payload, { timeout: 15000 });
      return { success: true, result: response.data.result };
    } catch (err) {
      return { success: false, error: err.response?.data?.description || err.message };
    }
  },

  /**
   * Delete message
   */
  deleteMessage: async (token, chatId, messageId) => {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/deleteMessage`, {
        chat_id: chatId,
        message_id: messageId
      }, { timeout: 8000 });
      return true;
    } catch (err) {
      return false;
    }
  },

  /**
   * Mute user in a group (can_send_messages = false)
   */
  muteUser: async (token, chatId, userId) => {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${token}/restrictChatMember`, {
        chat_id: chatId,
        user_id: userId,
        permissions: {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false
        }
      }, { timeout: 10000 });
      return { success: true, result: response.data.result };
    } catch (err) {
      return { success: false, error: err.response?.data?.description || err.message };
    }
  },

  /**
   * Unmute user in a group (restore default member permissions)
   */
  unmuteUser: async (token, chatId, userId) => {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${token}/restrictChatMember`, {
        chat_id: chatId,
        user_id: userId,
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_invite_users: true
        }
      }, { timeout: 10000 });
      return { success: true, result: response.data.result };
    } catch (err) {
      return { success: false, error: err.response?.data?.description || err.message };
    }
  },

  /**
   * Fetch active admins from group, EXCLUDING the Owner based on Telegram User ID!
   * Formats proper mentions without duplicates.
   */
  getAdminsForTagging: async (token, chatId, ownerTelegramId) => {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${token}/getChatAdministrators`, {
        params: { chat_id: chatId },
        timeout: 10000
      });

      if (!response.data || !response.data.ok) {
        return { success: false, mentions: [] };
      }

      const admins = response.data.result;
      const mentions = [];
      const seenIds = new Set();

      for (const item of admins) {
        const u = item.user;
        if (!u || u.is_bot) continue;

        // CRITICAL: Exclude Owner by Telegram User ID!
        if (ownerTelegramId && String(u.id) === String(ownerTelegramId)) {
          continue;
        }

        if (seenIds.has(u.id)) continue;
        seenIds.add(u.id);

        if (u.username) {
          mentions.push(`@${u.username}`);
        } else {
          const safeName = (u.first_name || 'Admin').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          mentions.push(`<a href="tg://user?id=${u.id}">${safeName}</a>`);
        }
      }

      return { success: true, mentions };
    } catch (err) {
      return { success: false, error: err.response?.data?.description || err.message, mentions: [] };
    }
  }
};

module.exports = TelegramService;
