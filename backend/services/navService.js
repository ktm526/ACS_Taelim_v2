/**
 * navService.js
 * ─────────────────────────────────────
 * AMR에 네비게이션(이동) 명령을 TCP로 전송
 */
const net = require('net');
const { writeLog } = require('./logService');

let _serial = 0;

/**
 * TCP 패킷 빌드 (AMR 프로토콜)
 * [0x5A][0x01][serial 2B BE][length 4B BE][api code 2B BE][reserved 6B][JSON]
 */
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
 * AMR에 이동 명령 전송
 * @param {string} ip   - AMR IP 주소
 * @param {string} dest - 목적지 스테이션 ID
 * @param {string} src  - 출발 스테이션 ID
 * @param {string} taskId - 태스크 ID (선택)
 * @returns {Promise<void>}
 */
function sendGotoNav(ip, dest, src, taskId) {
  const payload = { id: String(dest), source_id: String(src), task_id: taskId };
  return new Promise((ok, ng) => {
    const sock = net.createConnection(19206, ip);
    const bye = () => sock.destroy();

    sock.once('connect', () => {
      sock.write(_buildPkt(0x0BEB, payload), () => {
        bye();
        writeLog({
          log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'NAV_CMD',
          target: `${ip}:19206`, method: 'TCP', status: 'SUCCESS',
          request_data: payload, task_id: taskId ? Number(taskId) : null,
        });
        ok();
      });
    });

    sock.once('error', e => {
      bye();
      writeLog({
        log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'NAV_CMD',
        target: `${ip}:19206`, method: 'TCP', status: 'ERROR',
        request_data: payload, error_message: e.message,
        task_id: taskId ? Number(taskId) : null,
      });
      ng(e);
    });
    sock.setTimeout(5000, () => {
      bye();
      writeLog({
        log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'NAV_CMD',
        target: `${ip}:19206`, method: 'TCP', status: 'ERROR',
        request_data: payload, error_message: 'timeout',
        task_id: taskId ? Number(taskId) : null,
      });
      ng(new Error('timeout'));
    });
  });
}

/**
 * AMR에 네비게이션 취소 명령 전송
 * API 0x0BBB (3003), 포트 19206, JSON 데이터 없음
 */
function sendCancelNav(ip) {
  return new Promise((ok, ng) => {
    const sock = net.createConnection(19206, ip);
    const chunks = [];
    let resolved = false;

    const finish = (err, resp) => {
      if (resolved) return;
      resolved = true;
      sock.destroy();
      err ? ng(err) : ok(resp);
    };

    sock.once('connect', () => {
      sock.write(_buildPkt(0x0BBB, {}));
    });

    sock.on('data', (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length >= 16) {
        const bodyLen = buf.readUInt32BE(4);
        if (buf.length >= 16 + bodyLen) {
          let resp = null;
          try { resp = JSON.parse(buf.slice(16, 16 + bodyLen).toString('utf8')); } catch {}
          writeLog({
            log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'NAV_CANCEL',
            target: `${ip}:19206`, method: 'TCP', status: 'SUCCESS',
            request_data: {}, response_data: resp,
          });
          finish(null, resp);
        }
      }
    });

    sock.once('error', (e) => {
      writeLog({
        log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'NAV_CANCEL',
        target: `${ip}:19206`, method: 'TCP', status: 'ERROR',
        request_data: {}, error_message: e.message,
      });
      finish(e);
    });

    sock.setTimeout(5000, () => {
      writeLog({
        log_type: 'TCP', direction: 'OUTBOUND', interface_id: 'NAV_CANCEL',
        target: `${ip}:19206`, method: 'TCP', status: 'ERROR',
        request_data: {}, error_message: 'timeout',
      });
      finish(new Error('timeout'));
    });
  });
}

module.exports = { sendGotoNav, sendCancelNav };
