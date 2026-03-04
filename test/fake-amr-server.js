#!/usr/bin/env node
/**
 * Fake AMR TCP Push Server + Nav/Arm Command Listener
 * ─────────────────────────────────────────────────────
 * 실제 AMR 로봇처럼 동작하는 테스트 서버.
 *
 * Push 서버 (포트 19301):
 *   - 클라이언트 연결 시 주기적으로 상태 Push 데이터 전송
 *   - 기본 상태: IDLE (대기)
 *   - DI/DO 센서 상태 포함
 *
 * Nav 명령 서버 (포트 19206):
 *   - 이동 명령(0x0BEB) 수신 시 목표 스테이션으로 연속 이동
 *   - 스테이션 좌표는 백엔드 API(/api/maps/current)에서 자동 조회
 *   - 도착 시 IDLE 상태 복귀
 *
 * MANI 명령 서버 (포트 19207):
 *   - 매니퓰레이터 명령(0x0FB5) 수신 시 10초 후 DI11=true (완료 신호)
 *   - 실제 로봇 팔 동작은 시뮬레이션하지 않음
 *
 * Robot IO 서버 (포트 19210):
 *   - DO 설정(0x1771): 로봇 팔 작업 트리거 수신
 *   - DI 설정(0x1784): DI 리셋 수신
 *
 * 사용법:
 *   node fake-amr-server.js                          # 기본 (1대, 대기 상태)
 *   node fake-amr-server.js --count 3                # 3대 AMR
 *   node fake-amr-server.js --name AMR-01 --port 19301
 *
 * 옵션:
 *   --port       <number>  Push 시작 포트 (기본: 19301)
 *   --nav-port   <number>  Nav 명령 시작 포트 (기본: 19206)
 *   --mani-port  <number>  MANI 명령 포트 (기본: 19207)
 *   --io-port    <number>  Robot IO 포트 (기본: 19210)
 *   --count      <number>  시뮬레이션 AMR 수 (기본: 1)
 *   --name       <string>  AMR 이름 (1대일 때, 기본: AMR-01)
 *   --interval   <number>  Push 주기 ms (기본: 500)
 *   --api        <string>  백엔드 API URL (기본: http://localhost:4000)
 *   --arm-delay  <number>  로봇 팔 완료까지 딜레이 ms (기본: 10000)
 */

const net = require('net');
const http = require('http');

// ─── CLI 인자 파싱 ───────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    port: 19301,
    navPort: 19206,
    maniPort: 19207,
    ioPort: 19210,
    count: 1,
    name: null,
    interval: 500,
    apiUrl: 'http://localhost:4000',
    armDelay: 10000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        opts.port = Number(args[++i]);
        break;
      case '--nav-port':
        opts.navPort = Number(args[++i]);
        break;
      case '--mani-port':
        opts.maniPort = Number(args[++i]);
        break;
      case '--io-port':
        opts.ioPort = Number(args[++i]);
        break;
      case '--count':
        opts.count = Number(args[++i]);
        break;
      case '--name':
        opts.name = args[++i];
        break;
      case '--interval':
        opts.interval = Number(args[++i]);
        break;
      case '--api':
        opts.apiUrl = args[++i];
        break;
      case '--arm-delay':
        opts.armDelay = Number(args[++i]);
        break;
      case '--help':
      case '-h':
        console.log(`
Fake AMR TCP Push + Nav + Arm Server
──────────────────────────────────────
  --port       <number>  Push 시작 포트 (기본: 19301)
  --nav-port   <number>  Nav 명령 시작 포트 (기본: 19206)
  --mani-port  <number>  MANI 명령 포트 (기본: 19207)
  --io-port    <number>  Robot IO 포트 (기본: 19210)
  --count      <number>  시뮬레이션 AMR 수 (기본: 1)
  --name       <string>  AMR 이름 (1대일 때, 기본: AMR-01)
  --interval   <number>  Push 주기 ms (기본: 500)
  --api        <string>  백엔드 API URL (기본: http://localhost:4000)
  --arm-delay  <number>  로봇 팔 완료 딜레이 ms (기본: 10000)
`);
        process.exit(0);
    }
  }
  return opts;
}

// ─── 유틸 ───────────────────────────────────
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// ─── 백엔드 API에서 스테이션 좌표 조회 ─────
// { stationName/id → { x, y } } 캐시
let stationCoordCache = {};
let lastFetchTime = 0;
const FETCH_COOLDOWN = 5000; // 5초에 한 번만 재조회

function fetchStationCoords(apiUrl) {
  return new Promise((resolve) => {
    const url = `${apiUrl}/api/maps/current`;
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const map = JSON.parse(data);
            const stationsRaw = typeof map.stations === 'string'
              ? JSON.parse(map.stations)
              : map.stations;
            const stations = stationsRaw?.stations ?? [];

            const coords = {};
            for (const st of stations) {
              const key = st.name || st.id;
              coords[key] = { x: st.x, y: st.y };
              // ID로도 조회 가능하도록
              if (st.id && st.name && st.id !== st.name) {
                coords[st.id] = { x: st.x, y: st.y };
              }
            }
            stationCoordCache = coords;
            lastFetchTime = Date.now();
            console.log(`  📍 맵에서 스테이션 ${Object.keys(coords).length}개 좌표 로드 완료`);
            resolve(coords);
          } catch (e) {
            console.warn(`  ⚠️ 맵 파싱 실패: ${e.message}`);
            resolve(stationCoordCache);
          }
        });
      })
      .on('error', (e) => {
        console.warn(`  ⚠️ 백엔드 API 연결 실패: ${e.message}`);
        resolve(stationCoordCache);
      });
  });
}

async function getStationCoord(stationId, apiUrl) {
  // 캐시에 있으면 바로 반환
  if (stationCoordCache[stationId]) {
    return stationCoordCache[stationId];
  }
  // 쿨다운 확인 후 재조회
  if (Date.now() - lastFetchTime > FETCH_COOLDOWN) {
    await fetchStationCoords(apiUrl);
  }
  return stationCoordCache[stationId] || null;
}

// ─── AMR 상태 시뮬레이터 클래스 ─────────────
class FakeAmr {
  constructor(name, apiUrl, armDelay) {
    this.name = name;
    this.apiUrl = apiUrl;
    this.armDelay = armDelay || 10000;
    this.tick = 0;

    // 초기 위치
    this.x = randomBetween(0, 10);
    this.y = randomBetween(0, 10);
    this.angle = 0;

    // 이동 관련
    this.targetX = this.x;
    this.targetY = this.y;
    this.vx = 0;
    this.vy = 0;

    // 상태 — 기본 대기
    this.taskStatus = 0; // 0=idle, 2=moving
    this.battery = randomBetween(60, 100);
    this.charging = false;
    this.emergency = false;
    this.isStop = false;
    this.errors = [];

    // 스테이션
    this.currentStation = null;
    this.destStation = null;

    // DI/DO 센서 상태 (로봇 팔 연동)
    this.diSensors = [
      { id: 11, status: false },  // MANI_WORK_OK  (성공 신호)
      { id: 12, status: false },  // MANI_WORK_ERR (에러 신호)
    ];
    this.doSensors = [
      { id: 4, status: false },   // MANI_WORK_DO  (작업 트리거)
    ];

    // 로봇 팔 작업 타이머
    this._armTimer = null;

    // 기타
    this.batteryTemp = randomBetween(22, 32);
    this.controllerTemp = randomBetween(28, 38);
    this.odo = randomBetween(100, 5000);
    this.todayOdo = randomBetween(0, 200);
    this.confidence = randomBetween(0.90, 1.0);
  }

  /** 이동 명령 수신 처리 — 백엔드 API에서 좌표 조회 */
  async handleNavCommand(destId, srcId) {
    this.destStation = destId;
    if (srcId) this.currentStation = srcId;

    // 백엔드 API에서 스테이션 좌표 조회
    const coord = await getStationCoord(destId, this.apiUrl);
    if (coord) {
      this.targetX = coord.x;
      this.targetY = coord.y;
      console.log(
        `    🚀 [${this.name}] 이동 시작: ${srcId || '현재'} → ${destId} ` +
        `(${coord.x.toFixed(2)}, ${coord.y.toFixed(2)})`
      );
    } else {
      // 좌표를 못 찾으면 랜덤 생성
      this.targetX = randomBetween(-5, 20);
      this.targetY = randomBetween(-5, 20);
      console.log(
        `    ⚠️ [${this.name}] 스테이션 '${destId}' 좌표 미발견 → 랜덤 좌표 사용` +
        ` (${this.targetX.toFixed(2)}, ${this.targetY.toFixed(2)})`
      );
    }

    this.taskStatus = 2; // MOVING
    const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);
    console.log(`    📏 거리: ${dist.toFixed(2)}m`);
  }

  /** 매니퓰레이터 명령 수신 → armDelay 후 DI11=true (완료) */
  handleManiCommand(cmdScript) {
    console.log(`    🦾 [${this.name}] MANI 명령 수신:`);
    console.log(`       CMD_FROM=${cmdScript.CMD_FROM}, CMD_TO=${cmdScript.CMD_TO}, VISION=${cmdScript.VISION_CHECK}`);
    console.log(`       ${this.armDelay / 1000}초 후 DI11=true (완료 신호) 예정`);

    // 기존 타이머 클리어
    if (this._armTimer) {
      clearTimeout(this._armTimer);
      this._armTimer = null;
    }

    // armDelay 후 DI11=true 설정 (완료 신호)
    this._armTimer = setTimeout(() => {
      const di11 = this.diSensors.find((s) => s.id === 11);
      if (di11) {
        di11.status = true;
        console.log(`    ✅ [${this.name}] 로봇 팔 작업 완료! DI11=true`);
      }
      this._armTimer = null;
    }, this.armDelay);
  }

  /** DO 설정 (외부에서 호출) */
  setDo(doId, status) {
    const sensor = this.doSensors.find((s) => s.id === doId);
    if (sensor) {
      sensor.status = status;
      console.log(`    ⚡ [${this.name}] DO${doId} = ${status}`);
    } else {
      // 없으면 추가
      this.doSensors.push({ id: doId, status });
      console.log(`    ⚡ [${this.name}] DO${doId} = ${status} (new)`);
    }
  }

  /** DI 설정/리셋 (외부에서 호출) */
  setDi(diId, status) {
    const sensor = this.diSensors.find((s) => s.id === diId);
    if (sensor) {
      sensor.status = status;
      console.log(`    ⚡ [${this.name}] DI${diId} = ${status}`);
    } else {
      this.diSensors.push({ id: diId, status });
      console.log(`    ⚡ [${this.name}] DI${diId} = ${status} (new)`);
    }
  }

  /** 매 tick마다 상태 업데이트 */
  update() {
    this.tick++;

    // 배터리 천천히 감소/충전
    if (!this.charging) {
      this.battery = Math.max(0, this.battery - 0.005);
    } else {
      this.battery = Math.min(100, this.battery + 0.05);
    }

    // 이동 중이면 위치를 목표 방향으로 업데이트
    if (this.taskStatus === 2) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.08) {
        // 이동 속도: 0.15 units/tick @ 500ms = ~0.3 m/s (시각적으로 적절)
        const speed = 0.15;
        const step = Math.min(speed, dist);
        this.vx = (dx / dist) * step;
        this.vy = (dy / dist) * step;
        this.x += this.vx;
        this.y += this.vy;
        this.angle = Math.atan2(dy, dx);
        this.odo += step;
        this.todayOdo += step;
      } else {
        // 도착!
        this.x = this.targetX;
        this.y = this.targetY;
        this.vx = 0;
        this.vy = 0;
        this.taskStatus = 0; // IDLE
        this.currentStation = this.destStation;
        this.destStation = null;
        console.log(`    ✅ [${this.name}] 도착! → ${this.currentStation} (IDLE)`);
      }
    }

    // 온도 미세 변동
    this.batteryTemp += randomBetween(-0.1, 0.1);
    this.controllerTemp += randomBetween(-0.15, 0.15);
    this.batteryTemp = Math.max(18, Math.min(45, this.batteryTemp));
    this.controllerTemp = Math.max(22, Math.min(55, this.controllerTemp));
  }

  /** Push 데이터 JSON */
  toJSON() {
    return {
      vehicle_id: this.name,
      time: Date.now(),
      task_status: this.taskStatus,
      x: parseFloat(this.x.toFixed(4)),
      y: parseFloat(this.y.toFixed(4)),
      angle: parseFloat(this.angle.toFixed(4)),
      battery_level: parseFloat((this.battery / 100).toFixed(4)),
      battery: parseFloat(this.battery.toFixed(1)),
      charging: this.charging,
      emergency: this.emergency,
      is_stop: this.isStop,
      errors: this.errors,
      warnings: [],
      current_station: this.currentStation,
      next_station: this.destStation,
      current_map: 'test-map',
      vx: parseFloat(this.vx.toFixed(4)),
      vy: parseFloat(this.vy.toFixed(4)),
      w: 0,
      blocked: false,
      slowed: false,
      confidence: parseFloat(this.confidence.toFixed(3)),
      running_status: this.taskStatus === 2 ? 1 : 0,
      odo: parseFloat(this.odo.toFixed(2)),
      today_odo: parseFloat(this.todayOdo.toFixed(2)),
      today_time: this.tick,
      total_time: this.tick * 10,
      battery_temp: parseFloat(this.batteryTemp.toFixed(1)),
      controller_temp: parseFloat(this.controllerTemp.toFixed(1)),
      jack: { jack_height: 0, jack_state: 0, jack_enable: false, jack_error_code: 0 },
      DI: this.diSensors.map((s) => ({ id: s.id, status: s.status })),
      DO: this.doSensors.map((s) => ({ id: s.id, status: s.status })),
      version: '1.0.0-fake',
      model: 'FakeAMR-SIM',
    };
  }
}

// ─── 패킷 빌더 / 파서 ──────────────────────
function buildPushPacket(jsonObj) {
  const payload = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const header = Buffer.alloc(16);
  header.writeUInt8(0x5a, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function parseNavPacket(buf) {
  if (buf.length < 16) return null;
  if (buf.readUInt8(0) !== 0x5a) return null;

  const payloadLen = buf.readUInt32BE(4);
  const apiCode = buf.readUInt16BE(8);

  if (buf.length < 16 + payloadLen) return null;

  const payload = buf.slice(16, 16 + payloadLen).toString('utf8');
  let json;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }

  return { apiCode, data: json, totalLen: 16 + payloadLen };
}

// ─── 메인 ────────────────────────────────────
async function main() {
  const opts = parseArgs();

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Fake AMR TCP Push + Nav + Arm Command Server   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  AMR 수:       ${opts.count}`);
  console.log(`  Push 포트:    ${opts.port}${opts.count > 1 ? `~${opts.port + opts.count - 1}` : ''}`);
  console.log(`  Nav 포트:     ${opts.navPort}`);
  console.log(`  MANI 포트:    ${opts.maniPort}`);
  console.log(`  IO 포트:      ${opts.ioPort}`);
  console.log(`  Push 주기:    ${opts.interval}ms`);
  console.log(`  팔 완료 딜레이: ${opts.armDelay}ms`);
  console.log(`  백엔드 API:   ${opts.apiUrl}`);
  console.log(`  기본 상태:    IDLE (대기)`);
  console.log('');

  // 시작 시 백엔드에서 맵 스테이션 좌표 로드 시도
  await fetchStationCoords(opts.apiUrl);

  const amrInstances = [];

  for (let i = 0; i < opts.count; i++) {
    const pushPort = opts.port + i;
    const name =
      opts.count === 1 && opts.name ? opts.name : `AMR-${String(i + 1).padStart(2, '0')}`;

    const amr = new FakeAmr(name, opts.apiUrl, opts.armDelay);
    amrInstances.push({ name, amr });

    // ── Push 서버 (19301+) ──
    const pushServer = net.createServer((socket) => {
      const remote = `${socket.remoteAddress}:${socket.remotePort}`;
      console.log(`  ✅ [${name}:${pushPort}] Push 연결: ${remote}`);

      const timer = setInterval(() => {
        amr.update();
        const packet = buildPushPacket(amr.toJSON());
        try {
          socket.write(packet);
        } catch (err) {
          console.warn(`  ⚠️ [${name}] Push 전송 실패: ${err.message}`);
          clearInterval(timer);
        }
      }, opts.interval);

      socket.on('error', () => clearInterval(timer));
      socket.on('close', () => {
        console.log(`  ❌ [${name}:${pushPort}] Push 연결 종료`);
        clearInterval(timer);
      });
      socket.on('data', () => {});
    });

    pushServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`  ❌ [${name}] Push 포트 ${pushPort} 사용 중`);
      } else {
        console.error(`  ❌ [${name}] Push 서버 에러:`, err.message);
      }
    });

    pushServer.listen(pushPort, '0.0.0.0', () => {
      console.log(`  🤖 [${name}] Push 서버 리스닝 → 0.0.0.0:${pushPort}`);
    });
  }

  // ── Nav 명령 서버 (19206) ──
  const navServer = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`  📡 Nav 명령 연결: ${remote}`);

    let buf = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= 16) {
        const result = parseNavPacket(buf);
        if (!result) {
          buf = Buffer.alloc(0);
          break;
        }

        buf = buf.slice(result.totalLen);

        if (result.apiCode === 0x0beb) {
          const { id: destId, source_id: srcId, task_id: taskId } = result.data;
          console.log(
            `  📨 Nav 명령 수신: dest=${destId}, src=${srcId}, task=${taskId}`
          );

          // AMR 매칭
          let target;
          if (amrInstances.length === 1) {
            target = amrInstances[0];
          } else {
            target = amrInstances.find(
              (inst) => inst.amr.currentStation === srcId
            );
            if (!target) {
              target = amrInstances.find((inst) => inst.amr.taskStatus === 0);
            }
            if (!target) target = amrInstances[0];
          }

          if (target) {
            // async 호출 (좌표 조회 후 이동)
            target.amr.handleNavCommand(destId, srcId);
          }
        }
      }
    });

    socket.on('error', (err) => {
      console.warn(`  ⚠️ Nav 소켓 에러: ${err.message}`);
    });

    socket.on('close', () => {
      console.log(`  📡 Nav 연결 종료: ${remote}`);
    });
  });

  navServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  ❌ Nav 포트 ${opts.navPort} 사용 중`);
    } else {
      console.error(`  ❌ Nav 서버 에러:`, err.message);
    }
  });

  navServer.listen(opts.navPort, '0.0.0.0', () => {
    console.log(`  📡 Nav 명령 서버 리스닝 → 0.0.0.0:${opts.navPort}`);
  });

  // ── MANI 명령 서버 (19207) ──
  const maniServer = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`  🦾 MANI 명령 연결: ${remote}`);

    let buf = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= 16) {
        const result = parseNavPacket(buf); // 동일한 패킷 구조 재사용
        if (!result) {
          buf = Buffer.alloc(0);
          break;
        }

        buf = buf.slice(result.totalLen);

        // API 코드 0x0FB5 = 4021 (MANI_CMD_API)
        if (result.apiCode === 0x0FB5) {
          const { script } = result.data;
          let cmdScript = {};
          try {
            cmdScript = typeof script === 'string' ? JSON.parse(script) : script;
          } catch { /* ignore */ }

          console.log(`  📨 MANI 명령 수신: ${JSON.stringify(cmdScript)}`);

          // 응답 패킷 전송 (성공)
          const respBody = Buffer.from(JSON.stringify({ ret_code: 0 }), 'utf8');
          const respHead = Buffer.alloc(16);
          respHead.writeUInt8(0x5A, 0);
          respHead.writeUInt8(0x01, 1);
          respHead.writeUInt32BE(respBody.length, 4);
          respHead.writeUInt16BE(0x0FB5, 8);
          try { socket.write(Buffer.concat([respHead, respBody])); } catch {}

          // AMR 매칭 → 팔 명령 처리
          let target;
          if (amrInstances.length === 1) {
            target = amrInstances[0];
          } else {
            // 여러 AMR 중 IDLE 상태인 것 선택
            target = amrInstances.find((inst) => inst.amr.taskStatus === 0);
            if (!target) target = amrInstances[0];
          }

          if (target) {
            target.amr.handleManiCommand(cmdScript);
          }
        } else {
          console.log(`  📨 MANI 알 수 없는 API: 0x${result.apiCode.toString(16)}`);
        }
      }
    });

    socket.on('error', (err) => {
      console.warn(`  ⚠️ MANI 소켓 에러: ${err.message}`);
    });
    socket.on('close', () => {
      console.log(`  🦾 MANI 연결 종료: ${remote}`);
    });
  });

  maniServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  ❌ MANI 포트 ${opts.maniPort} 사용 중`);
    } else {
      console.error(`  ❌ MANI 서버 에러:`, err.message);
    }
  });

  maniServer.listen(opts.maniPort, '0.0.0.0', () => {
    console.log(`  🦾 MANI 명령 서버 리스닝 → 0.0.0.0:${opts.maniPort}`);
  });

  // ── Robot IO 서버 (19210) — DO/DI 설정 ──
  const ioServer = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    // IO 서버는 빈번하므로 연결 로그 최소화

    let buf = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);

      while (buf.length >= 16) {
        const result = parseNavPacket(buf);
        if (!result) {
          buf = Buffer.alloc(0);
          break;
        }

        buf = buf.slice(result.totalLen);

        const { id, status } = result.data;

        // 응답 패킷 전송 (성공)
        const respBody = Buffer.from(JSON.stringify({ ret_code: 0 }), 'utf8');
        const respHead = Buffer.alloc(16);
        respHead.writeUInt8(0x5A, 0);
        respHead.writeUInt8(0x01, 1);
        respHead.writeUInt32BE(respBody.length, 4);
        respHead.writeUInt16BE(result.apiCode, 8);
        try { socket.write(Buffer.concat([respHead, respBody])); } catch {}

        // 모든 AMR에 적용 (단일 IO 서버이므로)
        // 실제 환경에서는 소켓별로 AMR을 구분하지만,
        // 테스트에서는 모든 인스턴스에 브로드캐스트
        const boolStatus = status === true || status === 1;

        if (result.apiCode === 0x1771) {
          // DO 설정 (ROBOT_DO_API = 6001)
          for (const inst of amrInstances) {
            inst.amr.setDo(id, boolStatus);
          }
        } else if (result.apiCode === 0x1784) {
          // DI 설정/리셋 (ROBOT_DI_API = 6020)
          // 백엔드에서 id=0 → DI11 리셋, id=1 → DI12 리셋
          const diId = id === 0 ? 11 : id === 1 ? 12 : id;
          for (const inst of amrInstances) {
            inst.amr.setDi(diId, boolStatus);
          }
        } else {
          console.log(`  📨 IO 알 수 없는 API: 0x${result.apiCode.toString(16)}`);
        }
      }
    });

    socket.on('error', () => {});
    socket.on('close', () => {});
  });

  ioServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  ❌ IO 포트 ${opts.ioPort} 사용 중`);
    } else {
      console.error(`  ❌ IO 서버 에러:`, err.message);
    }
  });

  ioServer.listen(opts.ioPort, '0.0.0.0', () => {
    console.log(`  ⚡ Robot IO 서버 리스닝 → 0.0.0.0:${opts.ioPort}`);
  });

  console.log('');
  console.log('  사용법:');
  console.log('  1. 백엔드(4000)를 먼저 실행하고 맵 업로드');
  console.log('  2. AMR 등록 시 ip를 127.0.0.1 로 설정');
  console.log('  3. 맵 스테이션 우클릭 → AMR 선택 → 이동 명령');
  console.log('  4. AMR이 실제 스테이션 좌표로 이동하고 도착 후 IDLE');
  console.log('  5. POST /api/arm_command → MANI 명령 수신 → 10초 후 완료');
  console.log('');
  console.log('  종료: Ctrl+C');
  console.log('');
}

main();
