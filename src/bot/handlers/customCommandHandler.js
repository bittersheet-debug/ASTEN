/**
 * ASTEN! (ASISTEN TENAGA!) - Custom Command & Payment Alias Router
 */

const CustomCommandModel = require('../../models/CustomCommandModel');
const PaymentHandler = require('./paymentHandler');

const CustomCommandHandler = {
  /**
   * Middleware to check and process custom replies and payment aliases
   */
  processMessage: async (ctx, next) => {
    const text = ctx.message?.text;
    if (!text || !text.startsWith('/')) {
      return next();
    }

    const botId = String(ctx.botInfo.id);
    const cmdToken = text.trim().split(/\s+/)[0].toLowerCase();
    // Strip username mention from command if present (e.g. /bayar@my_bot)
    const cmd = cmdToken.split('@')[0];

    // 1. Check if it's a Custom Payment Alias (/bayar, /pay, /tagih, etc.)
    const paymentAlias = CustomCommandModel.findPaymentAlias(botId, cmd);
    if (paymentAlias && paymentAlias.is_active) {
      CustomCommandModel.incrementAliasUsage(botId, cmd);
      return PaymentHandler.handlePaymentCommand(ctx, cmd);
    }

    // 2. Check if it's a Custom Command Reply (/rules, /info, /halo, etc.)
    const customReply = CustomCommandModel.findReply(botId, cmd);
    if (customReply && customReply.is_active) {
      if (customReply.media_url) {
        return ctx.replyWithPhoto(customReply.media_url, {
          caption: customReply.reply_text,
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id
        });
      } else {
        return ctx.reply(customReply.reply_text, {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id
        });
      }
    }

    // Not a custom command, proceed to regular handlers
    return next();
  }
};

module.exports = CustomCommandHandler;
