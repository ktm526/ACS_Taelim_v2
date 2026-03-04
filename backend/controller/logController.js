/**
 * logController.js
 * ─────────────────────────────────────
 * 인터페이스 로그 조회 API
 */
const { queryLogs } = require('../services/logService');

/**
 * GET /api/logs
 *
 * Query params:
 *   page, pageSize, log_type, interface_id, status,
 *   direction, amr_name, from, to, keyword
 */
const getLogs = async (req, res) => {
  try {
    const result = await queryLogs(req.query);
    return res.json(result);
  } catch (err) {
    console.error('[LogController] 조회 오류:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { getLogs };
