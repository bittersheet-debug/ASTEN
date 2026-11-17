/**
 * ASTEN! (ASISTEN TENAGA!) - Activity Logs & System Stats Routes
 */

const express = require('express');
const router = express.Router();
const LogModel = require('../../models/LogModel');
const OwnerModel = require('../../models/OwnerModel');
const BotModel = require('../../models/BotModel');
const LicenseModel = require('../../models/LicenseModel');

// Get activity logs
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const logs = LogModel.getAll(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get overall system dashboard metrics for Portal
router.get('/metrics', (req, res) => {
  try {
    const owners = OwnerModel.getAll();
    const botStats = BotModel.getStats();
    const licenseStats = LicenseModel.getStats();
    const recentLogs = LogModel.getAll(10);

    const activeLicenses = owners.filter(o => o.status === 'ACTIVE').length;
    const expiredLicenses = owners.filter(o => o.status === 'EXPIRED').length;
    const permanentLicenses = owners.filter(o => o.license_type === 'PERMANENT').length;

    res.json({
      success: true,
      stats: {
        totalOwners: owners.length,
        totalBots: botStats.allBots || botStats.total,
        activeBots: botStats.active,
        inactiveBots: botStats.inactive,
        onlineBots: botStats.online,
        offlineBots: botStats.offline,
        errorBots: botStats.error,
        validApiBots: botStats.validApi,
        officialBotCount: botStats.officialCount,
        activeLicenses,
        expiredLicenses,
        permanentLicenses,
        totalAccessCodes: licenseStats.total,
        unusedAccessCodes: licenseStats.unused,
        usedAccessCodes: licenseStats.used
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        nodeVersion: process.version,
        platform: process.platform
      },
      recentActivity: recentLogs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
