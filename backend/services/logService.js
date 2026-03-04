/**
 * logService.js
 * ─────────────────────────────────────────────
 * 인터페이스 로그 기록 및 조회 서비스
 *
 * 로그 대상:
 *   API  — MONITORING, MOVE_COMMAND, ARM_COMMAND, TASK_RESULT
 *   TCP  — NAV_CMD, MANI_CMD, ROBOT_DO, ROBOT_DI
 */
const { Op } = require('sequelize');
const InterfaceLog = require('../model/InterfaceLog');

// ── 오래된 로그 자동 삭제 주기 ──
const LOG_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/**
 * 로그 기록
 *
 * @param {object} opts
 * @param {'API'|'TCP'} opts.log_type
 * @param {'INBOUND'|'OUTBOUND'} opts.direction
 * @param {string} opts.interface_id
 * @param {string} [opts.target]
 * @param {string} [opts.method]
 * @param {'SUCCESS'|'ERROR'} opts.status
 * @param {object|string} [opts.request_data]
 * @param {object|string} [opts.response_data]
 * @param {string} [opts.error_message]
 * @param {string} [opts.amr_name]
 * @param {number} [opts.task_id]
 */
async function writeLog(opts) {
  try {
    await InterfaceLog.create({
      timestamp: new Date(),
      log_type: opts.log_type,
      direction: opts.direction,
      interface_id: opts.interface_id,
      target: opts.target || null,
      method: opts.method || null,
      status: opts.status || 'SUCCESS',
      request_data: typeof opts.request_data === 'object'
        ? JSON.stringify(opts.request_data)
        : opts.request_data || null,
      response_data: typeof opts.response_data === 'object'
        ? JSON.stringify(opts.response_data)
        : opts.response_data || null,
      error_message: opts.error_message || null,
      amr_name: opts.amr_name || null,
      task_id: opts.task_id ?? null,
    });
  } catch (e) {
    // 로그 기록 실패가 비즈니스 로직에 영향을 주면 안 됨
    console.error('[LogService] 로그 기록 실패:', e.message);
  }
}

/**
 * 로그 조회 (페이지네이션 + 필터)
 *
 * @param {object} query
 * @param {number} [query.page=1]
 * @param {number} [query.pageSize=50]
 * @param {string} [query.log_type]
 * @param {string} [query.interface_id]
 * @param {string} [query.status]
 * @param {string} [query.direction]
 * @param {string} [query.amr_name]
 * @param {string} [query.from]  ISO 날짜
 * @param {string} [query.to]    ISO 날짜
 * @param {string} [query.keyword] 요청/응답 내용 검색
 */
async function queryLogs(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;

  const where = {};

  if (query.log_type) where.log_type = query.log_type;
  if (query.interface_id) where.interface_id = query.interface_id;
  if (query.interface_ids) {
    // 콤마 구분 다중 interface_id 필터
    const ids = query.interface_ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) where.interface_id = { [Op.in]: ids };
  }
  if (query.exclude_interface) {
    const excl = query.exclude_interface.split(',').map((s) => s.trim()).filter(Boolean);
    if (excl.length === 1) {
      where.interface_id = { ...(where.interface_id || {}), [Op.ne]: excl[0] };
    } else if (excl.length > 1) {
      where.interface_id = { ...(where.interface_id || {}), [Op.notIn]: excl };
    }
  }
  if (query.status) where.status = query.status;
  if (query.direction) where.direction = query.direction;
  if (query.amr_name) where.amr_name = query.amr_name;

  if (query.from || query.to) {
    where.timestamp = {};
    if (query.from) where.timestamp[Op.gte] = new Date(query.from);
    if (query.to) where.timestamp[Op.lte] = new Date(query.to);
  }

  if (query.keyword) {
    where[Op.or] = [
      { request_data: { [Op.like]: `%${query.keyword}%` } },
      { response_data: { [Op.like]: `%${query.keyword}%` } },
      { error_message: { [Op.like]: `%${query.keyword}%` } },
    ];
  }

  const { count, rows } = await InterfaceLog.findAndCountAll({
    where,
    order: [['timestamp', 'DESC']],
    limit: pageSize,
    offset,
  });

  return {
    total: count,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
    data: rows,
  };
}

/**
 * 오래된 로그 삭제
 */
async function cleanupOldLogs() {
  try {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await InterfaceLog.destroy({
      where: { timestamp: { [Op.lt]: cutoff } },
    });
    if (deleted > 0) {
      console.log(`[LogService] ${deleted}건의 오래된 로그 삭제 (${LOG_RETENTION_DAYS}일 이전)`);
    }
  } catch (e) {
    console.error('[LogService] 로그 정리 오류:', e.message);
  }
}

/**
 * 로그 정리 스케줄러 시작
 */
function startLogCleanup() {
  setInterval(cleanupOldLogs, CLEANUP_INTERVAL_MS);
  console.log(`🗑️  Log Cleanup scheduled (retention: ${LOG_RETENTION_DAYS} days)`);
}

module.exports = { writeLog, queryLogs, startLogCleanup };
