const express = require('express');
const router = express.Router();
const amrController = require('../controller/amrController');

// ── 모니터링 전용 (구체적 경로 우선 등록) ──
router.get('/monitor/status', amrController.getMonitorStatus);
router.post('/monitor/reconnect', amrController.reconnect);

// ── 기본 CRUD ──
router.get('/', amrController.getAllAmrs);
router.get('/:id', amrController.getAmrById);
router.post('/', amrController.createAmr);
router.put('/:id', amrController.updateAmr);
router.delete('/:id', amrController.deleteAmr);

// ── 네비게이션 ──
router.post('/:id/navigate', amrController.navigate);

module.exports = router;
