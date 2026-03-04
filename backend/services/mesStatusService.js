/**
 * mesStatusService.js
 * ─────────────────────────────────────────────
 * ACS → MES  AMR 상태 정보 주기 전송
 *
 * BIZ_IF_ID: AMR_STATUS
 * 수신측 URL: http://<mes_ip>/api/monitoring
 * Method: POST
 * 주기: 1초 (1Hz)
 *
 * 설정 테이블의 'mes_ip' 키에서 MES 서버 IP를 읽어온다.
 * mes_ip가 비어 있으면 전송하지 않는다.
 */
const http = require('http');
const Amr = require('../model/Amr');
const { getSettingByKey } = require('./settingService');
const { writeLog } = require('./logService');

// ── 설정 ──
const SEND_INTERVAL = 1000; // 1초
const REQUEST_TIMEOUT = 3000; // 3초

let timer = null;
let lastMesBase = null; // 캐시된 MES 베이스 URL (http://ip:port)
let settingCheckCount = 0;
const SETTING_REFRESH_EVERY = 10; // 10번(10초)마다 설정 재조회
let mesConnected = null; // MES 연결 상태 추적 (null=초기, true=연결, false=끊김)

// ─────────────────────────────────────────────
//  MES 베이스 URL 조회 (설정 테이블에서)
// ─────────────────────────────────────────────

async function getMesBase() {
  // 매번 DB 조회하지 않고 10초마다 갱신
  settingCheckCount++;
  if (lastMesBase !== null && settingCheckCount % SETTING_REFRESH_EVERY !== 0) {
    return lastMesBase;
  }

  try {
    const row = await getSettingByKey('mes_ip');
    const ip = row?.value?.trim();
    if (!ip) {
      lastMesBase = '';
      return '';
    }
    // http:// 접두사 없으면 붙이기
    lastMesBase = ip.startsWith('http') ? ip : `http://${ip}`;
    return lastMesBase;
  } catch (e) {
    console.error('[MES-Status] 설정 조회 오류:', e.message);
    return lastMesBase || '';
  }
}

/** 특정 경로에 대한 전체 URL 반환 */
async function getMesUrl(path) {
  const base = await getMesBase();
  if (!base) return '';
  return `${base}${path}`;
}

// ─────────────────────────────────────────────
//  AMR 상태 Payload 생성
// ─────────────────────────────────────────────

async function buildPayload() {
  const amrs = await Amr.findAll();

  const amrList = amrs.map((a) => ({
    amr_id: a.amr_id,
    amr_name: a.amr_name,
    map: a.map || '',
    pos_x: parseFloat((a.pos_x || 0).toFixed(4)),
    pos_y: parseFloat((a.pos_y || 0).toFixed(4)),
    deg: parseFloat((a.deg || 0).toFixed(4)),
    status: a.status || 'NO_CONN',
    battery: Math.round(a.battery || 0),
    current_station_id: a.current_station_id || '',
    dest_station_id: a.dest_station_id || '',
    task_id: a.task_id || 0,
    error_code: a.error_code ? parseInt(a.error_code, 10) || 0 : 0,
    stop_code: a.stop_code ? parseInt(a.stop_code, 10) || 0 : 0,
  }));

  return {
    request_time: new Date().toISOString(),
    amr_count: amrList.length,
    amr_list: amrList,
  };
}

// ─────────────────────────────────────────────
//  HTTP POST 전송
// ─────────────────────────────────────────────

function postToMes(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: REQUEST_TIMEOUT,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('MES request timeout'));
    });

    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────
//  주기 전송 루프
// ─────────────────────────────────────────────

let consecutiveErrors = 0;
const MAX_LOG_ERRORS = 5; // 연속 에러 시 로그 제한

async function sendStatus() {
  // ── 어떤 예외가 발생하더라도 절대 중단하지 않음 ──
  try {
    const url = await getMesUrl('/api/monitoring');
    if (!url) return; // mes_ip 미설정 → 다음 주기에 재시도

    const payload = await buildPayload();
    const resp = await postToMes(url, payload);

    if (consecutiveErrors > 0) {
      console.log(`[MES-Status] 전송 복구 (${consecutiveErrors}회 실패 후) → ${url}`);
      writeLog({
        log_type: 'API', direction: 'OUTBOUND', interface_id: 'MONITORING',
        target: url, method: 'POST', status: 'SUCCESS',
        request_data: { amr_count: payload.amr_count },
        response_data: resp,
      });
    }
    // MES 연결 상태 변화 로그 (끊김→연결)
    if (mesConnected !== true) {
      const prevState = mesConnected;
      const errCount = consecutiveErrors;
      mesConnected = true;
      writeLog({
        log_type: 'API', direction: 'OUTBOUND', interface_id: 'MES_CONN',
        target: url, method: 'POST', status: 'SUCCESS',
        request_data: { event: 'CONNECTED', message: prevState === null ? 'MES 최초 연결 성공' : `MES 연결 복구 (${errCount}회 실패 후)` },
      });
    }
    consecutiveErrors = 0;
  } catch (e) {
    consecutiveErrors++;
    // 처음 몇 번만 상세 로그, 이후 60초마다 한 번
    if (consecutiveErrors <= MAX_LOG_ERRORS || consecutiveErrors % 60 === 0) {
      console.warn(
        `[MES-Status] 전송 실패 (${consecutiveErrors}회 연속): ${e.message}`
      );
      writeLog({
        log_type: 'API', direction: 'OUTBOUND', interface_id: 'MONITORING',
        target: lastMesBase ? `${lastMesBase}/api/monitoring` : '',
        method: 'POST', status: 'ERROR', error_message: e.message,
      });
    }

    // MES 연결 상태 변화 로그 (연결→끊김, 첫 실패 시에만)
    if (mesConnected !== false) {
      mesConnected = false;
      writeLog({
        log_type: 'API', direction: 'OUTBOUND', interface_id: 'MES_CONN',
        target: lastMesBase ? `${lastMesBase}/api/monitoring` : '',
        method: 'POST', status: 'ERROR',
        request_data: { event: 'DISCONNECTED' },
        error_message: e.message,
      });
    }
    // ── 실패해도 아무 것도 하지 않음 → 다음 주기에 자동 재시도 ──
  }
}

// ─────────────────────────────────────────────
//  태스크 결과 전송 (이벤트성)
//  BIZ_IF_ID: TASK_RESULT
//  POST http://<mes_ip>/api/task_result
// ─────────────────────────────────────────────

/**
 * 태스크 완료/에러 시 MES에 결과를 전송한다.
 *
 * @param {object} opts
 * @param {number} opts.task_id
 * @param {string} opts.amr_name
 * @param {string} opts.task_type   - 'MOVE' | 'ARM'
 * @param {string} opts.task_status - 'FINISHED' | 'ERROR'
 * @param {number|string} [opts.error_code=0]
 */
async function sendTaskResult({ task_id, amr_name, task_type, task_status, error_code }) {
  try {
    // 이벤트성 호출이므로 캐시가 비어있으면 즉시 DB 조회
    const base = lastMesBase || (await getMesBase());
    if (!base) return; // mes_ip 미설정 → 무시
    const url = `${base}/api/task_result`;

    const payload = {
      request_time: new Date().toISOString(),
      task_id,
      amr_name: amr_name || '',
      task_type: task_type || '',
      task_status: task_status || '',
      error_code: typeof error_code === 'number' ? error_code : parseInt(error_code, 10) || 0,
    };

    const resp = await postToMes(url, payload);
    console.log(
      `[MES-TaskResult] 전송 완료: task_id=${task_id}, status=${task_status}, type=${task_type}`
    );
    writeLog({
      log_type: 'API', direction: 'OUTBOUND', interface_id: 'TASK_RESULT',
      target: url, method: 'POST', status: 'SUCCESS',
      request_data: payload, response_data: resp,
      amr_name, task_id,
    });
  } catch (e) {
    console.warn(`[MES-TaskResult] 전송 실패 (task_id=${task_id}): ${e.message}`);
    writeLog({
      log_type: 'API', direction: 'OUTBOUND', interface_id: 'TASK_RESULT',
      target: `${lastMesBase || ''}/api/task_result`,
      method: 'POST', status: 'ERROR', error_message: e.message,
      amr_name, task_id,
    });
  }
}

// ─────────────────────────────────────────────
//  서비스 시작/정지
// ─────────────────────────────────────────────

function startMesStatus() {
  if (timer) return;
  // 안전 래퍼: sendStatus 내부에서 catch하지 못한 예외가 발생해도 interval이 중단되지 않음
  timer = setInterval(() => {
    sendStatus().catch(() => {});
  }, SEND_INTERVAL);
  console.log('📡 MES Status Service started (1Hz → POST /api/monitoring)');
}

function stopMesStatus() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startMesStatus, stopMesStatus, sendTaskResult };
