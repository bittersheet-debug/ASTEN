/**
 * ASTEN! (ASISTEN TENAGA!) - Real-Time Server-Sent Events (SSE) Broadcaster
 * Pushes live updates to the web portal dashboard instantly without reloading!
 */

const clients = new Set();

const RealtimeService = {
  /**
   * Handle incoming SSE connection from frontend
   */
  handleConnection: (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    clients.add(res);

    // Initial keepalive heartbeat
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

    req.on('close', () => {
      clients.delete(res);
    });
  },

  /**
   * Broadcast an event to all connected web clients
   */
  broadcast: (eventType, data = {}) => {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch (err) {
        clients.delete(client);
      }
    }
  },

  /**
   * Keepalive ping to prevent timeouts on proxies / Cloudflare
   */
  sendHeartbeat: () => {
    for (const client of clients) {
      try {
        client.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (err) {
        clients.delete(client);
      }
    }
  },

  getClientCount: () => clients.size
};

// Send heartbeat every 20 seconds
setInterval(() => {
  RealtimeService.sendHeartbeat();
}, 20000);

module.exports = RealtimeService;
