/**
 * AMR Monitor Service
 * ─────────────────────────────────────────────
 * AMR 로봇과 TCP 통신으로 Push 데이터를 수신하여
 * DB(Amrs 테이블)에 실시간 상태를 반영한다.
 *
 * 프로토콜:
 *   [0x5A] [3 byte reserved] [4 byte payload length (BE)] [8 byte reserved] [JSON payload]
 *   ─ header(1) + reserved(3) + length(4) + reserved(8) = 16 byte header
 */

const net = require('net');
const { Op } = require('sequelize');
const Amr = require('../model/Amr');
const Task = require('../model/Task');
const { sendTaskResult } = require('./mesStatusService');
const { writeLog } = require('./logService');
const { sendCancelNav } = require('./navService');

// ─── 설정 ────────────────────────────────────
const PUSH_PORT = Number(process.env.AMR_PUSH_PORT || 19301);
const RECONNECT_INTERVAL = 1000;   // 재연결 시도 주기 (ms)
const STALE_TIMEOUT = 3000;        // 수신 없음 → 연결 끊김 판정 (ms)
const TIME_STALE_TIMEOUT = 5000;  // AMR time 값 변화 없음 → 재연결 (ms)

// ─── 런타임 상태 ──────────────────────────────
const sockets = new Map();          // ip → socket
const connectingIps = new Set();    // 연결 시도 중인 ip
const lastRecTime = new Map();      // amr_name → Date.now()
const lastTimeValue = new Map();    // amr_name → json.time
const lastTimeUpdate = new Map();   // amr_name → Date.now()
const connectedState = new Map();   // ip → boolean (연결 상태 변화 추적용)
const lastAttemptLogAt = new Map(); // ip|event|reason → Date.now()
const socketCloseReasons = new WeakMap(); // socket → close reason

// ─── 유예 에러 (일시적 에러코드 → 일정 시간 후 ERROR 처리) ──
const DEFERRED_ERROR_CODES = new Set(['52200', '52313']);
const DEFERRED_ERROR_TIMEOUT = 30000; // 30초
const deferredErrorStart = new Map(); // amr_name → Date.now() (유예 시작 시각)

// ─────────────────────────────────────────────
//  상태 매핑 유틸
// ─────────────────────────────────────────────

/**
 * AMR push JSON의 task_status(숫자)를 문자열로 변환
 * 허용 상태: ERROR | STOP | E-STOP | IDLE | MOVING | NO_CONN
 */
function mapTaskStatus(tsRaw, json) {
  const isEmergency = json.emergency === true;
  const isStopped = json.is_stop === true;
  const hasErrors = Array.isArray(json.errors) && json.errors.length > 0;

  if (isEmergency) return 'E-STOP';
  if (hasErrors) return 'ERROR';
  if (isStopped) return 'STOP';
  if ([0, 1, 4].includes(tsRaw)) return 'IDLE';
  if (tsRaw === 2) return 'MOVING';
  return 'IDLE';
}

/**
 * errors 배열에서 첫 번째 에러 상세 추출
 */
function extractErrorDetail(json) {
  if (!Array.isArray(json.errors) || json.errors.length === 0) return null;
  const first = json.errors[0];
  const code = String(first.code ?? first.error_code ?? 'ERR');
  const message =
    first.message ??
    first.msg ??
    first.error_message ??
    first.err_msg ??
    first.description ??
    null;
  return { code, message };
}

/**
 * errors 배열에서 에러 코드 추출
 */
function extractErrorCode(json) {
  const detail = extractErrorDetail(json);
  return detail ? detail.code : null;
}

/**
 * 정지 코드 추출
 */
function extractStopCode(json) {
  if (json.emergency === true) return 'E-STOP';
  if (json.is_stop === true) return 'STOP';
  return null;
}

function normalizeStationId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function getTaskTargetStation(task) {
  if (!task?.param) return null;
  try {
    const parsed = typeof task.param === 'string' ? JSON.parse(task.param) : task.param;
    return normalizeStationId(parsed?.station_id ?? parsed?.dest_station ?? parsed?.target_station);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
//  DB 업데이트
// ─────────────────────────────────────────────

async function markDisconnected(where) {
  try {
    await Amr.update(
      { status: 'NO_CONN', timestamp: new Date() },
      { where }
    );
  } catch (e) {
    console.error('[AMR-Monitor] markDisconnected error:', e.message);
  }
}

function shouldLogAttempt(ip, event, reason, throttleMs = 3000) {
  if (!throttleMs) return true;

  const key = `${ip}|${event}|${reason || ''}`;
  const now = Date.now();
  const lastAt = lastAttemptLogAt.get(key) || 0;

  if (now - lastAt < throttleMs) return false;
  lastAttemptLogAt.set(key, now);
  return true;
}

async function resolveAmrNameByIp(ip) {
  try {
    const row = await Amr.findOne({ where: { ip } });
    return row?.amr_name || null;
  } catch {
    return null;
  }
}

async function logAmrConnectionEvent({
  ip,
  status,
  event,
  reason,
  amrName = null,
  throttleMs = 0,
  direction = 'OUTBOUND',
}) {
  if (!shouldLogAttempt(ip, event, reason, throttleMs)) return;

  const resolvedAmrName = amrName || (await resolveAmrNameByIp(ip));

  writeLog({
    log_type: 'TCP',
    direction,
    interface_id: 'AMR_CONN',
    target: `${ip}:${PUSH_PORT}`,
    method: 'TCP',
    status,
    request_data: { event, reason: reason || '' },
    error_message: status === 'ERROR' ? (reason || '연결 끊김') : null,
    amr_name: resolvedAmrName,
  });
}

function setSocketCloseReason(sock, reason) {
  if (!sock || !reason) return;
  socketCloseReasons.set(sock, reason);
}

function consumeSocketCloseReason(sock) {
  if (!sock) return null;
  const reason = socketCloseReasons.get(sock) || null;
  if (reason) socketCloseReasons.delete(sock);
  return reason;
}

function destroySocketWithReason(sock, reason) {
  if (!sock) return;
  setSocketCloseReason(sock, reason);
  sock.destroy();
}

/**
 * AMR 연결 상태 변경 시 로그 기록 (상태 변화가 있을 때만)
 */
async function logAmrConnection(ip, connected, reason) {
  const prev = connectedState.get(ip);
  if (prev === connected) return; // 상태 변화 없음 → 로그 안 남김
  connectedState.set(ip, connected);
  await logAmrConnectionEvent({
    ip,
    status: connected ? 'SUCCESS' : 'ERROR',
    event: connected ? 'CONNECTED' : 'DISCONNECTED',
    reason,
    direction: connected ? 'INBOUND' : 'OUTBOUND',
  });
}

// ─────────────────────────────────────────────
//  Push 데이터 핸들러
// ─────────────────────────────────────────────

function handlePush(sock, ip) {
  let buf = Buffer.alloc(0);
  let idle_cnt = 0;

  sock.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    // 패킷 파싱 루프 (16 byte header + payload)
    while (buf.length >= 16) {
      // 헤더 검증 (0x5A)
      if (buf.readUInt8(0) !== 0x5a) {
        buf = Buffer.alloc(0);
        break;
      }
      
      const payloadLen = buf.readUInt32BE(4);
      if (buf.length < 16 + payloadLen) break; // 아직 전체 패킷 안 옴
      
      const payload = buf.slice(16, 16 + payloadLen).toString('utf8');
      buf = buf.slice(16 + payloadLen);
      
      // JSON 파싱
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      
      const name = json.vehicle_id || json.robot_id;
      if (!name) continue;
      
      // ── time 값 변화 추적 ──
      const currentTime = json.time;
      const lastTime = lastTimeValue.get(name);
      const now = Date.now();
      
      if (lastTime !== currentTime) {
        lastTimeValue.set(name, currentTime);
        lastTimeUpdate.set(name, now);
      }
      
      // ── 상태 계산 ──
      const tsRaw =
      typeof json.task_status === 'number'
      ? json.task_status
      : typeof json.taskStatus === 'number'
      ? json.taskStatus
      : null;
      
      let is_Idle = [0, 1, 4].includes(tsRaw);
      let statusStr = mapTaskStatus(tsRaw, json);

      // ── 필드 추출 ──
      const posX = json.x ?? json.position?.x ?? 0;
      const posY = json.y ?? json.position?.y ?? 0;
      const deg = json.angle ?? json.position?.yaw ?? 0;

      const battery =
        typeof json.battery_level === 'number'
          ? Math.round(json.battery_level * 100)
          : typeof json.battery === 'number'
            ? json.battery
            : null;

      const currentStation =
        json.current_station ||
        json.currentStation ||
        (Array.isArray(json.finished_path)
          ? json.finished_path.slice(-1)[0]
          : null);

      const destStation =
        json.target_id ||
        json.targetId ||
        json.target_label ||
        json.next_station ||
        json.nextStation ||
        null;

      const normalizedCurrentStation = normalizeStationId(currentStation);
      const normalizedPushDestStation = normalizeStationId(destStation);

      // ── 유예 에러 처리 (052200 등 일시적 에러) ──
      // 에러가 유예 대상 코드만으로 구성되면 30초간 ERROR를 보류
      if (statusStr === 'ERROR') {
        const errCodes = (json.errors || []).map(
          (e) => String(e.code ?? e.error_code ?? '')
        );
        const allDeferred = errCodes.length > 0 && errCodes.every((c) => DEFERRED_ERROR_CODES.has(c));

        if (allDeferred) {
          const started = deferredErrorStart.get(name);
          if (!started) {
            deferredErrorStart.set(name, Date.now());
            console.log(`[AMR-Monitor] ${name}: 유예 에러 감지 (${errCodes.join(',')}) → 30초 대기 시작`);
            statusStr = 'MOVING';
          } else if (Date.now() - started < DEFERRED_ERROR_TIMEOUT) {
            statusStr = 'MOVING';
          } else {
            console.log(`[AMR-Monitor] ${name}: 유예 에러 30초 초과 → ERROR 처리 + NAV 취소`);
            deferredErrorStart.delete(name);
            // 네비게이션 취소 명령 전송
            sendCancelNav(ip).then(() => {
              console.log(`[AMR-Monitor] ${name}: NAV 취소 명령 전송 완료`);
            }).catch((e) => {
              console.warn(`[AMR-Monitor] ${name}: NAV 취소 실패 (무시): ${e.message}`);
            });
          }
        } else {
          deferredErrorStart.delete(name);
        }
      } else {
        // 에러가 사라졌으면 유예 타이머 해제
        if (deferredErrorStart.has(name)) {
          console.log(`[AMR-Monitor] ${name}: 유예 에러 해소 → 타이머 해제`);
          deferredErrorStart.delete(name);
        }
      }

      // ── 태스크 상태 자동 관리 ──
      // AMR이 RUNNING 태스크를 가지고 있을 때:
      //   - ERROR/E-STOP → 모든 태스크 ERROR, AMR task_id → 0
      //   - IDLE + MOVE 태스크 → FINISHED, AMR task_id → 0
      //   - IDLE + ARM 태스크 → 상태를 MOVING으로 오버라이드 (DI 모니터가 완료 처리)
      try {
        const runningTask = await Task.findOne({
          where: { amr_name: name, task_status: 'RUNNING' },
        });

        if (runningTask) {
          const amrRow = await Amr.findOne({ where: { amr_name: name } });
          const taskTargetStation = getTaskTargetStation(runningTask);
          const dbDestStation = normalizeStationId(amrRow?.dest_station_id);
          const targetStation = taskTargetStation || dbDestStation || normalizedPushDestStation;
          const isMoveAndArrived =
            runningTask.task_type === 'MOVE' &&
            is_Idle &&
            normalizedCurrentStation &&
            targetStation &&
            normalizedCurrentStation === targetStation;

          if (runningTask.task_type === 'MOVE') {
            if (isMoveAndArrived) {
              idle_cnt++;
            } else {
              idle_cnt = 0;
            }
          }

          // console.log(`is_Idle : ${is_Idle}, cnt : ${idle_cnt}`);
          if (statusStr === 'ERROR' || statusStr === 'E-STOP') {
            // 에러/비상정지 → 모든 태스크 타입 ERROR
            const errCode = extractErrorCode(json) || statusStr;
            await runningTask.update({
              task_status: 'ERROR',
              error_code: errCode,
              updated_at: new Date(),
            });
            if (amrRow) {
              await amrRow.update({ task_id: 0, dest_station_id: null });
            }
            console.log(
              `[AMR-Monitor] ${statusStr} 감지 → Task#${runningTask.task_id} ERROR`
            );
            // MES에 태스크 결과 전송
            sendTaskResult({
              task_id: runningTask.task_id,
              amr_name: name,
              task_type: runningTask.task_type,
              task_status: 'ERROR',
              error_code: errCode,
            });
          // } else if (statusStr === 'IDLE' && runningTask.task_type === 'MOVE') {
          } else if (isMoveAndArrived && idle_cnt > 4) {
            // MOVE 태스크: 목표 스테이션 도착 + IDLE 유지 → FINISHED
            idle_cnt = 0;
            await runningTask.update({
              task_status: 'FINISHED',
              updated_at: new Date(),
            });
            if (amrRow) {
              await amrRow.update({ task_id: 0, dest_station_id: null });
            }
            console.log(
              `[AMR-Monitor] 도착 확인 (${normalizedCurrentStation}) + IDLE 유지 → MOVE Task#${runningTask.task_id} FINISHED`
            );
            // MES에 태스크 결과 전송
            sendTaskResult({
              task_id: runningTask.task_id,
              amr_name: name,
              task_type: 'MOVE',
              task_status: 'FINISHED',
              error_code: 0,
            });
          } else if (statusStr === 'IDLE' && runningTask.task_type === 'ARM') {
            // ARM 태스크: AMR은 물리적으로 IDLE이지만 팔 작업 중 → MOVING 오버라이드
            statusStr = 'STOP';
          }
        }
      } catch {
        // DB 조회 실패 시 무시
      }

      const currentMap = json.current_map || null;
      const errorDetail = extractErrorDetail(json);
      const errorCode = errorDetail?.code || null;
      const errorMessage = errorDetail?.message || null;
      const stopCode = extractStopCode(json);

      // ── 확장 정보 (additional_info) ──
      const additionalInfo = {
        // 속도
        vx: json.vx ?? 0,
        vy: json.vy ?? 0,
        w: json.w ?? 0,

        // 잭 정보
        jack: json.jack || {},

        // 충전/비상 플래그
        charging: json.charging === true,
        emergency: json.emergency === true,

        // 온도
        battery_temp: json.battery_temp ?? null,
        controller_temp: json.controller_temp ?? null,

        // 전압/전류
        voltage: json.voltage ?? null,
        current: json.current ?? null,

        // 상세 상태
        task_status_raw: tsRaw,
        running_status: json.running_status ?? json.runningStatus ?? 0,
        blocked: json.blocked === true,
        slowed: json.slowed === true,
        confidence: json.confidence ?? 0,

        // 에러/경고
        errors: json.errors || [],
        warnings: json.warnings || [],
        error_message: errorMessage,

        // DI/DO 센서
        di_sensors: json.DI || json.di || json.digital_inputs || [],
        do_sensors: json.DO || json.do_sensors || json.digital_outputs || [],

        // 모터 정보
        motor_info: json.motor_info || [],

        // IMU
        imu: {
          acc_x: json.acc_x ?? 0,
          acc_y: json.acc_y ?? 0,
          acc_z: json.acc_z ?? 0,
          pitch: json.pitch ?? 0,
          roll: json.roll ?? 0,
          yaw: json.yaw ?? json.angle ?? 0,
        },

        // 주행 거리/시간
        odo: json.odo ?? 0,
        today_odo: json.today_odo ?? 0,
        today_time: json.today_time ?? 0,
        total_time: json.total_time ?? 0,

        // 버전
        version: json.version ?? null,
        model: json.model ?? null,
      };

      // ── DB 업데이트 ──
      const payload4db = {
        amr_name: name,
        ip,
        map: currentMap,
        pos_x: posX,
        pos_y: posY,
        deg,
        status: statusStr,
        battery,
        current_station_id: currentStation,
        dest_station_id: destStation,
        error_code: errorCode,
        stop_code: stopCode,
        additional_info: JSON.stringify(additionalInfo),
        timestamp: new Date(),
      };

      try {
        const existing = await Amr.findOne({ where: { ip } });
        if (existing) {
          await existing.update(payload4db);
        } else {
          // IP로 못 찾으면 이름으로 시도
          const byName = await Amr.findOne({ where: { amr_name: name } });
          if (byName) {
            await byName.update(payload4db);
          }
          // DB에 등록되지 않은 AMR이면 무시 (수동 등록 필요)
        }
        lastRecTime.set(name, Date.now());
      } catch (e) {
        console.error('[AMR-Monitor] DB 저장 오류:', e.message);
      }
    }
  });

  sock.on('error', async (err) => {
    console.warn(`[AMR-Monitor] 소켓 에러 (${ip}):`, err.message);
    setSocketCloseReason(sock, `소켓 에러: ${err.message}`);
    sock.destroy();
    sockets.delete(ip);
    await markDisconnected({ ip });
    logAmrConnection(ip, false, `소켓 에러: ${err.message}`);
  });

  sock.on('close', (hadError) => {
    const reason =
      consumeSocketCloseReason(sock) ||
      (hadError
        ? '소켓 에러로 인한 연결 종료'
        : '원격에서 연결을 종료했거나 종료 사유를 확인하지 못함');
    console.warn(`[AMR-Monitor] 연결 종료 (${ip}): ${reason}`);
    sockets.delete(ip);
    markDisconnected({ ip });
    logAmrConnection(ip, false, reason);
  });
}

// ─────────────────────────────────────────────
//  TCP 연결
// ─────────────────────────────────────────────

async function connectToAmr(ip, opts = {}) {
  const {
    event = 'CONNECT_ATTEMPT',
    reason = '자동 연결 시도',
    amrName = null,
  } = opts;

  if (sockets.has(ip) || connectingIps.has(ip)) return;
  connectingIps.add(ip);

  await logAmrConnectionEvent({
    ip,
    status: 'SUCCESS',
    event,
    reason,
    amrName,
    throttleMs: 3000,
  });

  const sock = net.createConnection({ port: PUSH_PORT, host: ip });
  sock.setTimeout(3000);

  sock.on('error', async (err) => {
    console.warn(`[AMR-Monitor] 연결 실패 (${ip}):`, err.message);
    connectingIps.delete(ip);
    sock.destroy();
    sockets.delete(ip);
    await markDisconnected({ ip });
    logAmrConnection(ip, false, `연결 실패: ${err.message}`);
  });

  sock.on('connect', async () => {
    connectingIps.delete(ip);
    let resolvedAmrName = amrName || 'unknown';
    if (!amrName) {
      try {
        const row = await Amr.findOne({ where: { ip } });
        if (row) resolvedAmrName = row.amr_name;
      } catch {}
    }

    console.log(`[AMR-Monitor] 연결 성공 → ${ip} (${resolvedAmrName})`);
    sockets.set(ip, sock);
    sock.setTimeout(0);
    handlePush(sock, ip);
    logAmrConnection(ip, true, '연결 성공');
  });

  sock.on('timeout', async () => {
    console.warn(`[AMR-Monitor] 타임아웃 (${ip})`);
    connectingIps.delete(ip);
    sock.destroy();
    sockets.delete(ip);
    await markDisconnected({ ip });
    logAmrConnection(ip, false, '연결 타임아웃');
  });
}

// ─────────────────────────────────────────────
//  수동 재연결
// ─────────────────────────────────────────────

async function reconnectAmr(amrName, reason = '수동 재연결') {
  const row = await Amr.findOne({ where: { amr_name: amrName } });
  if (!row || !row.ip) throw new Error('AMR not found or no IP');
  const ip = row.ip;

  console.log(`[AMR-Monitor] 수동 재연결 시도 → ${amrName} (${ip})`);

  if (sockets.has(ip)) {
    destroySocketWithReason(sockets.get(ip), `재연결을 위한 기존 연결 종료: ${reason}`);
    sockets.delete(ip);
  }
  connectingIps.delete(ip);

  await connectToAmr(ip, {
    event: 'RECONNECT_ATTEMPT',
    reason,
    amrName,
  });
}

// ─────────────────────────────────────────────
//  주기적 작업 (reconnect / stale cleanup)
// ─────────────────────────────────────────────

let reconnecting = false;

function startMonitoring() {
  // 1) 재연결 루프: DB에 IP가 등록된 AMR에 대해 자동 연결 시도
  setInterval(async () => {
    if (reconnecting) return;
    reconnecting = true;
    try {
      const rows = await Amr.findAll({
        where: { ip: { [Op.not]: null, [Op.ne]: '' } },
        attributes: ['ip'],
        raw: true,
      });
      for (const { ip } of rows) {
        await connectToAmr(ip);
      }
    } catch (e) {
      console.error('[AMR-Monitor] 재연결 루프 오류:', e.message);
    } finally {
      reconnecting = false;
    }
  }, RECONNECT_INTERVAL);

  // 2) Stale 엔트리 정리: 일정 시간 수신 없으면 disconnected 처리
  setInterval(async () => {
    const now = Date.now();
    for (const [name, ts] of lastRecTime.entries()) {
      if (now - ts > STALE_TIMEOUT) {
        console.warn(`[AMR-Monitor] 수신 타임아웃 → ${name}`);
        lastRecTime.delete(name);
        lastTimeValue.delete(name);
        lastTimeUpdate.delete(name);

        await markDisconnected({ amr_name: name });

        // 소켓 강제 종료 → 다음 루프에서 재연결
        try {
          const row = await Amr.findOne({ where: { amr_name: name } });
          if (row && row.ip) {
            if (sockets.has(row.ip)) {
              destroySocketWithReason(
                sockets.get(row.ip),
                `수신 타임아웃으로 소켓 종료 (${STALE_TIMEOUT}ms 동안 push 없음)`
              );
              sockets.delete(row.ip);
            }
            logAmrConnection(row.ip, false, `수신 타임아웃 (${STALE_TIMEOUT}ms)`);
          }
        } catch {}
      }
    }
  }, 1000);

  // 3) time 값 변화 감시: 오래 변하지 않으면 재연결
  setInterval(async () => {
    const now = Date.now();
    for (const [name, lastUpdate] of lastTimeUpdate.entries()) {
      if (now - lastUpdate > TIME_STALE_TIMEOUT) {
        console.warn(
          `[AMR-Monitor] time 값 미변경(${TIME_STALE_TIMEOUT}ms) → ${name} 재연결 시도`
        );
        try {
          await reconnectAmr(name, `time 값 미변경 (${TIME_STALE_TIMEOUT}ms)`);
          lastTimeUpdate.set(name, now);
        } catch (e) {
          console.error(
            `[AMR-Monitor] ${name} 재연결 실패:`,
            e.message
          );
        }
      }
    }
  }, 5000);

  console.log(
    `🔧 AMR Monitor Service started (push port: ${PUSH_PORT})`
  );
}

// ─────────────────────────────────────────────
//  외부 노출
// ─────────────────────────────────────────────

module.exports = {
  startMonitoring,
  reconnectAmr,
  sockets,
  lastRecTime,
};
