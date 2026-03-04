/**
 * mapTcpService.js
 * ─────────────────────────────────────────────
 * AMR에서 맵 목록 조회 및 맵 다운로드 (TCP)
 *
 * 1) robot_status_map_req   — port 19240, API 0x0514
 * 2) robot_config_downloadmap_req — port 19207, API 0x0FAB
 */
const net = require('net');
const { writeLog } = require('./logService');
const { importMapJSON } = require('./mapImportService');

let _serial = 0;

// ── TCP 패킷 빌드 ──
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

/**
 * 범용 TCP 명령 + 응답 수신 (대용량 대응)
 */
function sendTcpCommand(ip, port, apiCode, payload, timeout = 15000) {
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

// ── 포트 / API 코드 ──
const MAP_STATUS_PORT = 19240;
const MAP_STATUS_API  = 0x0514;  // 1300
const MAP_DOWNLOAD_PORT = 19207;
const MAP_DOWNLOAD_API  = 0x0FAB; // 4011

/**
 * AMR에서 맵 목록 조회
 * @param {string} ip - AMR IP
 * @returns {Promise<{ current_map: string, maps: string[] }>}
 */
async function fetchMapList(ip) {
  const logBase = { log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'MAP_LIST', target: `${ip}:${MAP_STATUS_PORT}`, method: 'TCP' };
  try {
    const resp = await sendTcpCommand(ip, MAP_STATUS_PORT, MAP_STATUS_API, {});
    writeLog({ ...logBase, status: 'SUCCESS', request_data: {}, response_data: resp });
    return {
      current_map: resp.current_map || null,
      maps: Array.isArray(resp.maps) ? resp.maps : [],
    };
  } catch (e) {
    writeLog({ ...logBase, status: 'ERROR', request_data: {}, error_message: e.message });
    throw e;
  }
}

/**
 * AMR에서 맵 다운로드 → DB 저장
 * @param {string} ip - AMR IP
 * @param {string} mapName - 다운로드할 맵 이름
 * @returns {Promise<object>} - 저장된 Map 레코드
 */
async function downloadAndImportMap(ip, mapName) {
  const logBase = { log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'MAP_DOWNLOAD', target: `${ip}:${MAP_DOWNLOAD_PORT}`, method: 'TCP' };
  const reqPayload = { map_name: mapName };
  try {
    const resp = await sendTcpCommand(ip, MAP_DOWNLOAD_PORT, MAP_DOWNLOAD_API, reqPayload, 30000);
    writeLog({ ...logBase, status: 'SUCCESS', request_data: reqPayload, response_data: { mapName, received: true } });

    // 응답이 맵 JSON 데이터 → importMapJSON으로 파싱 & DB 저장
    const mapData = typeof resp === 'string' ? JSON.parse(resp) : resp;
    const created = await importMapJSON(mapData);
    console.log(`[MapTCP] 맵 "${mapName}" 다운로드 & 저장 완료 (id=${created.id})`);
    return created;
  } catch (e) {
    writeLog({ ...logBase, status: 'ERROR', request_data: reqPayload, error_message: e.message });
    throw e;
  }
}

module.exports = { fetchMapList, downloadAndImportMap };
