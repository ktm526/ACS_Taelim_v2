/**
 * armService.js
 * ─────────────────────────────────────────────
 * AMR 로봇 팔(매니퓰레이터) TCP 명령 전송 및
 * DI 신호 기반 작업 완료 모니터링
 *
 * 프로토콜: navService와 동일한 헤더 구조
 * [0x5A][0x01][serial 2B BE][length 4B BE][api code 2B BE][reserved 6B][JSON]
 */
const net = require('net');
const { Amr, Task } = require('../model');
const amrService = require('./amrService');
const { sendTaskResult } = require('./mesStatusService');
const { writeLog } = require('./logService');

// ── 포트 & API 코드 (환경변수 또는 기본값) ──
const MANI_CMD_PORT  = Number(process.env.MANI_CMD_PORT || 19207);
const MANI_CMD_API   = Number(process.env.MANI_CMD_API  || 4021);  // 0x0FB5
const DOOSAN_STATE_API  = Number(process.env.DOOSAN_STATE_API  || 4022);
const DOOSAN_STATE_PORT = Number(process.env.DOOSAN_STATE_PORT || 19207);
const ROBOT_IO_PORT = Number(process.env.ROBOT_IO_PORT || 19210);
const ROBOT_DO_API  = Number(process.env.ROBOT_DO_API  || 6001);  // 0x1771
const ROBOT_DI_API  = Number(process.env.ROBOT_DI_API  || 6020);  // 0x1784

// ── DI/DO ID ──
const MANI_WORK_DO_ID  = Number(process.env.MANI_WORK_DO_ID  || 4);
const MANI_WORK_OK_DI  = Number(process.env.MANI_WORK_OK_DI  || 11);
const MANI_WORK_ERR_DI = Number(process.env.MANI_WORK_ERR_DI || 12);

// ── 타임아웃 ──
const MANI_WORK_TIMEOUT_MS = Number(process.env.MANI_WORK_TIMEOUT_MS || 600000); // 10분

let _serial = 0;

// ─────────────────────────────────────────────
//  TCP 패킷
// ─────────────────────────────────────────────

function _buildPkt(code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(16);
  head.writeUInt8(0x5A, 0);
  head.writeUInt8(0x01, 1);
  head.writeUInt16BE(++_serial & 0xffff, 2);
  head.writeUInt32BE(body.length, 4);
  head.writeUInt16BE(code, 8);
  return Buffer.concat([head, body]);
}

function sendTcpCommand(ip, port, apiCode, payload, timeout = 5000) {
  return new Promise((ok, ng) => {
    const sock = net.createConnection(port, ip);
    const chunks = [];
    let resolved = false;

    const finish = (err, response) => {
      if (resolved) return;
      resolved = true;
      sock.destroy();
      err ? ng(err) : ok(response);
    };

    sock.on('data', (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length >= 16) {
        const bodyLen = buf.readUInt32BE(4);
        if (buf.length >= 16 + bodyLen) {
          const bodyBuf = buf.slice(16, 16 + bodyLen);
          try {
            const resp = JSON.parse(bodyBuf.toString('utf8'));
            if (resp.ret_code !== undefined && resp.ret_code !== 0) {
              finish(new Error(resp.err_msg || `ret_code: ${resp.ret_code}`));
            } else {
              finish(null, resp);
            }
          } catch {
            finish(null, bodyBuf.toString('utf8'));
          }
        }
      }
    });

    sock.once('connect', () => sock.write(_buildPkt(apiCode, payload)));
    sock.once('error', (e) => finish(e));
    sock.setTimeout(timeout, () => {
      if (!resolved) {
        finish(chunks.length === 0 ? new Error('tcp timeout') : null);
      }
    });
  });
}

// ─────────────────────────────────────────────
//  로봇 팔 명령
// ─────────────────────────────────────────────

/**
 * 매니퓰레이터 명령 전송
 * @param {string} ip
 * @param {object} params - { from_location_id1, from_location_id2, to_location_id1, to_location_id2, vision_check }
 * @param {boolean} [isCancel=false] - true면 CMD_STOP="1" (CANCEL)
 */
async function sendManiCommand(ip, params, isCancel = false) {
  const cmdScript = {
    CMD_ID: String(params.CMD_ID || '0'),
    CMD_FROM_1: String(params.from_location_id1 || '0'),
    CMD_TO_1: String(params.to_location_id1 || '0'),
    CMD_FROM_2: String(params.from_location_id2 || '0'),
    CMD_TO_2: String(params.to_location_id2 || '0'),
    CMD_STOP: isCancel ? '1' : '0',
    VISION_CHECK: String(params.vision_check === 1 ? 1 : 0),
  };
  const body = {
    type: 'module',
    relative_path: 'doosan_cmd.py',
    script: JSON.stringify(cmdScript),
  };
  try {
    const resp = await sendTcpCommand(ip, MANI_CMD_PORT, MANI_CMD_API, body);
    writeLog({ log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'MANI_CMD', target: `${ip}:${MANI_CMD_PORT}`, method: 'TCP', status: 'SUCCESS', request_data: cmdScript, response_data: resp });
    return resp;
  } catch (e) {
    writeLog({ log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'MANI_CMD', target: `${ip}:${MANI_CMD_PORT}`, method: 'TCP', status: 'ERROR', request_data: cmdScript, error_message: e.message });
    throw e;
  }
}

/** DO 설정 */
async function setRobotDo(ip, doId, status) {
  const payload = { id: Number(doId), status: status === true || status === 1 };
  try {
    const resp = await sendTcpCommand(ip, ROBOT_IO_PORT, ROBOT_DO_API, payload);
    writeLog({ log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'ROBOT_DO', target: `${ip}:${ROBOT_IO_PORT}`, method: 'TCP', status: 'SUCCESS', request_data: payload, response_data: resp });
    return resp;
  } catch (e) {
    writeLog({ log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'ROBOT_DO', target: `${ip}:${ROBOT_IO_PORT}`, method: 'TCP', status: 'ERROR', request_data: payload, error_message: e.message });
    throw e;
  }
}

/** DI 설정 (리셋용) */
async function setRobotDi(ip, diId, status) {
  const payload = { id: Number(diId), status: status === true || status === 1 };
  try {
    const resp = await sendTcpCommand(ip, ROBOT_IO_PORT, ROBOT_DI_API, payload);
    writeLog({ log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'ROBOT_DI', target: `${ip}:${ROBOT_IO_PORT}`, method: 'TCP', status: 'SUCCESS', request_data: payload, response_data: resp });
    return resp;
  } catch (e) {
    writeLog({ log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'ROBOT_DI', target: `${ip}:${ROBOT_IO_PORT}`, method: 'TCP', status: 'ERROR', request_data: payload, error_message: e.message });
    throw e;
  }
}

// ─────────────────────────────────────────────
//  DI 센서 읽기 (AMR push 데이터의 additional_info에서)
// ─────────────────────────────────────────────

function getDiStatus(additionalInfoStr, diId) {
  try {
    const info =
      typeof additionalInfoStr === 'string'
        ? JSON.parse(additionalInfoStr)
        : additionalInfoStr || {};
    const list = info.di_sensors || [];
    if (!Array.isArray(list)) return null;

    const sensor = list.find((s) => {
      const sid = s?.id ?? s?.no ?? s?.index ?? s?.channel ?? s?.ch;
      return Number(sid) === Number(diId);
    });
    if (!sensor) return null;

    const raw = sensor.status ?? sensor.value ?? sensor.state ?? sensor.on ?? sensor.active;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw === 1;
    if (typeof raw === 'string') return raw === '1' || raw.toLowerCase() === 'true';
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
//  백그라운드 모니터: 활성 ARM 태스크 DI 폴링
// ─────────────────────────────────────────────

/** task_id → { amrName, amrIp, startedAt } */
const activeArmTasks = new Map();
let monitorTimer = null;

async function pollArmTasks() {
  for (const [taskId, info] of activeArmTasks.entries()) {
    try {
      const task = await Task.findByPk(taskId);
      if (!task || task.task_status !== 'RUNNING') {
        activeArmTasks.delete(taskId);
        continue;
      }

      // 타임아웃 체크
      if (Date.now() - info.startedAt > MANI_WORK_TIMEOUT_MS) {
        console.error(`[ARM] Task#${taskId} 타임아웃 (${MANI_WORK_TIMEOUT_MS / 1000}s)`);
        await task.update({ task_status: 'ERROR', error_code: 'TIMEOUT', updated_at: new Date() });
        const amr = await Amr.findOne({ where: { amr_name: info.amrName } });
        if (amr) await amr.update({ task_id: 0, dest_station_id: null });
        try { await setRobotDo(info.amrIp, MANI_WORK_DO_ID, false); } catch {}
        activeArmTasks.delete(taskId);
        // MES에 태스크 결과 전송
        sendTaskResult({ task_id: taskId, amr_name: info.amrName, task_type: 'ARM', task_status: 'ERROR', error_code: 'TIMEOUT' });
        continue;
      }

      // AMR의 additional_info에서 DI 읽기
      const amr = await Amr.findOne({ where: { amr_name: info.amrName } });
      if (!amr) continue;

      const diOk = getDiStatus(amr.additional_info, MANI_WORK_OK_DI);
      const diErr = getDiStatus(amr.additional_info, MANI_WORK_ERR_DI);

      if (diOk === true) {
        // ── 성공 ──
        console.log(`[ARM] Task#${taskId} 성공 (DI${MANI_WORK_OK_DI}=1)`);
        // DI 리셋 (참조 코드: id=0 → DI11 리셋)
        try { await setRobotDi(info.amrIp, 0, false); } catch {}
        // DO 리셋
        try { await setRobotDo(info.amrIp, MANI_WORK_DO_ID, false); } catch {}
        await task.update({ task_status: 'FINISHED', updated_at: new Date() });
        await amr.update({ task_id: 0 });
        activeArmTasks.delete(taskId);
        console.log(`[ARM] Task#${taskId} FINISHED, AMR task_id → 0`);
        // MES에 태스크 결과 전송
        sendTaskResult({ task_id: taskId, amr_name: info.amrName, task_type: 'ARM', task_status: 'FINISHED', error_code: 0 });
      } else if (diErr === true) {
        // ── 에러 ──
        console.error(`[ARM] Task#${taskId} 에러 (DI${MANI_WORK_ERR_DI}=1)`);
        // DI 리셋 (참조 코드: id=1 → DI12 리셋)
        try { await setRobotDi(info.amrIp, 1, false); } catch {}
        // DO 리셋
        try { await setRobotDo(info.amrIp, MANI_WORK_DO_ID, false); } catch {}
        await task.update({ task_status: 'ERROR', error_code: 'MANI_ERROR', updated_at: new Date() });
        await amr.update({ task_id: 0 });
        activeArmTasks.delete(taskId);
        console.log(`[ARM] Task#${taskId} ERROR, AMR task_id → 0`);
        // MES에 태스크 결과 전송
        sendTaskResult({ task_id: taskId, amr_name: info.amrName, task_type: 'ARM', task_status: 'ERROR', error_code: 'MANI_ERROR' });
      }
    } catch (e) {
      console.error(`[ARM] 모니터링 오류 (task#${taskId}):`, e.message);
    }
  }
}

function startArmMonitor() {
  if (monitorTimer) return;
  monitorTimer = setInterval(pollArmTasks, 500); // 0.5초 폴링
  console.log('🦾 ARM Monitor started (DI polling: 500ms)');
}

// ─────────────────────────────────────────────
//  Doosan 로봇 팔 상태 조회
// ─────────────────────────────────────────────

const DOOSAN_STATE_MESSAGE = {
  type: 'module',
  relative_path: 'doosan_state.py',
};

/**
 * Doosan 매니퓰레이터의 실시간 상태를 TCP로 조회
 * 응답: TASK_STATUS, ROBOT_STATUS, JOINT_POSITION_1~6, JOINT_TORQUE_1~6, ...
 */
async function getDoosanArmState(ip) {
  try {
    const resp = await sendTcpCommand(
      ip,
      DOOSAN_STATE_PORT,
      DOOSAN_STATE_API,
      DOOSAN_STATE_MESSAGE,
      3000,
    );
    return resp || null;
  } catch (e) {
    console.warn(`[ARM] Doosan 상태 조회 실패 (${ip}): ${e.message}`);
    return null;
  }
}

/**
 * TASK_STATUS 확인 (0이 아니면 작업 중)
 */
async function checkDoosanTaskStatus(ip) {
  try {
    const state = await getDoosanArmState(ip);
    if (state) {
      const ts = state.TASK_STATUS;
      return ts !== '0' && ts !== 0;
    }
    return false;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
//  ARM 상태 캐시 (2초 주기 갱신)
// ─────────────────────────────────────────────

const ARM_CACHE_INTERVAL = 2000;
const armStateCache = new Map(); // ip → { data, updatedAt }
let cacheTimer = null;
let cacheRunning = false;

async function refreshArmCache() {
  if (cacheRunning) return;
  cacheRunning = true;
  try {
    const rows = await Amr.findAll({
      where: { ip: { [require('sequelize').Op.not]: null, [require('sequelize').Op.ne]: '' } },
      attributes: ['ip'],
      raw: true,
    });
    const results = await Promise.all(
      rows.map(({ ip }) => getDoosanArmState(ip).then(
        (data) => ({ ip, data }),
        () => ({ ip, data: null }),
      ))
    );
    const now = Date.now();
    for (const { ip, data } of results) {
      if (data) {
        armStateCache.set(ip, { data, updatedAt: now });
      }
    }
  } catch (e) {
    console.warn('[ARM-Cache] 갱신 오류:', e.message);
  } finally {
    cacheRunning = false;
  }
}

function startArmStateCache() {
  if (cacheTimer) return;
  refreshArmCache();
  cacheTimer = setInterval(refreshArmCache, ARM_CACHE_INTERVAL);
  console.log(`🦾 ARM State Cache started (${ARM_CACHE_INTERVAL}ms)`);
}

function getCachedArmState(ip) {
  const entry = armStateCache.get(ip);
  return entry ? entry.data : null;
}

async function ClearBuffer(ip) {
  // DI 리셋 (참조 코드: id=0 → DI11 리셋)
  try { await setRobotDi(ip, 0, false); } catch {}
  // DO 리셋
  try { await setRobotDo(ip, MANI_WORK_DO_ID, false); } catch {}
  // DI 리셋 (참조 코드: id=1 → DI12 리셋)
  try { await setRobotDi(ip, 1, false); } catch {}
  // DO 리셋
  try { await setRobotDo(ip, MANI_WORK_DO_ID, false); } catch {}
  // Refresh Cashe
  await refreshArmCache();
}

// ─────────────────────────────────────────────
//  외부 노출
// ─────────────────────────────────────────────

module.exports = {
  sendManiCommand,
  setRobotDo,
  setRobotDi,
  getDiStatus,
  activeArmTasks,
  startArmMonitor,
  getDoosanArmState,
  getCachedArmState,
  startArmStateCache,
  checkDoosanTaskStatus,
  ClearBuffer,
  MANI_WORK_DO_ID,
};
