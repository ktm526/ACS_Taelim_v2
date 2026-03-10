const amrService = require('../services/amrService');
const { reconnectAmr, sockets, lastRecTime } = require('../services/amrMonitorService');
const { sendGotoNav } = require('../services/navService');
const { getDoosanArmState } = require('../services/armService');

// GET /api/amrs
const getAllAmrs = async (req, res, next) => {
  try {
    const amrs = await amrService.getAllAmrs();
    res.json(amrs);
  } catch (err) {
    next(err);
  }
};

// GET /api/amrs/:id
const getAmrById = async (req, res, next) => {
  try {
    const amr = await amrService.getAmrById(req.params.id);
    if (!amr) return res.status(404).json({ message: 'AMR not found' });
    res.json(amr);
  } catch (err) {
    next(err);
  }
};

// POST /api/amrs
const createAmr = async (req, res, next) => {
  try {
    const amr = await amrService.createAmr(req.body);
    res.status(201).json(amr);
  } catch (err) {
    next(err);
  }
};

// PUT /api/amrs/:id
const updateAmr = async (req, res, next) => {
  try {
    const amr = await amrService.updateAmr(req.params.id, req.body);
    if (!amr) return res.status(404).json({ message: 'AMR not found' });
    res.json(amr);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/amrs/:id
const deleteAmr = async (req, res, next) => {
  try {
    const amr = await amrService.deleteAmr(req.params.id);
    if (!amr) return res.status(404).json({ message: 'AMR not found' });
    res.json({ message: 'AMR deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── 모니터링 관련 API ──────────────────────

// GET /api/amrs/monitor/status — 전체 AMR 연결 상태 조회
const getMonitorStatus = async (req, res, next) => {
  try {
    const amrs = await amrService.getAllAmrs();
    const status = amrs.map((amr) => {
      const data = amr.toJSON();
      return {
        amr_id: data.amr_id,
        amr_name: data.amr_name,
        ip: data.ip,
        status: data.status,
        connected: sockets.has(data.ip),
        last_received: lastRecTime.get(data.amr_name) || null,
        battery: data.battery,
        pos_x: data.pos_x,
        pos_y: data.pos_y,
        deg: data.deg,
        current_station_id: data.current_station_id,
        dest_station_id: data.dest_station_id,
        error_code: data.error_code,
        timestamp: data.timestamp,
      };
    });
    res.json(status);
  } catch (err) {
    next(err);
  }
};

// POST /api/amrs/monitor/reconnect — 특정 AMR 재연결
const reconnect = async (req, res, next) => {
  try {
    const { amr_name } = req.body;
    if (!amr_name) {
      return res.status(400).json({ message: 'amr_name is required' });
    }
    await reconnectAmr(amr_name);
    res.json({ message: `Reconnect initiated for ${amr_name}` });
  } catch (err) {
    next(err);
  }
};

// POST /api/amrs/:id/navigate — AMR에 이동 명령 전송
const navigate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dest_station } = req.body;
    if (!dest_station) {
      return res.status(400).json({ message: 'dest_station is required' });
    }

    const amr = await amrService.getAmrById(id);
    if (!amr) return res.status(404).json({ message: 'AMR not found' });
    if (!amr.ip) return res.status(400).json({ message: 'AMR has no IP address' });

    const src = 'SELF_POSITION';
    const taskId = String(Date.now());

    // TCP 명령 전송
    await sendGotoNav(amr.ip, dest_station, src, taskId);

    // AMR 목적지 업데이트
    await amrService.updateAmr(id, { dest_station_id: dest_station });

    console.log(`[NAV] ${amr.amr_name}: ${src || '?'} → ${dest_station}`);
    res.json({ message: `Navigate command sent: ${amr.amr_name} → ${dest_station}` });
  } catch (err) {
    console.error('[NAV] 이동 명령 실패:', err.message);
    next(err);
  }
};

// GET /api/amrs/:id/arm-state — Doosan 로봇 팔 상태 조회
const getArmState = async (req, res, next) => {
  try {
    const amr = await amrService.getAmrById(req.params.id);
    if (!amr) return res.status(404).json({ message: 'AMR not found' });
    if (!amr.ip) return res.status(400).json({ message: 'AMR IP가 설정되지 않았습니다' });

    const armState = await getDoosanArmState(amr.ip);
    if (!armState) {
      return res.status(503).json({ message: '로봇 팔 상태 조회 실패' });
    }
    res.json(armState);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllAmrs,
  getAmrById,
  createAmr,
  updateAmr,
  deleteAmr,
  getMonitorStatus,
  reconnect,
  navigate,
  getArmState,
};
