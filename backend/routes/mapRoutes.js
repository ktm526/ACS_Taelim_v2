const express = require('express');
const router = express.Router();
const mapController = require('../controller/mapController');
const { fetchMapList, downloadAndImportMap } = require('../services/mapTcpService');

router.get('/', mapController.getAllMaps);
router.get('/current', mapController.getCurrentMap);

/* ── AMR에서 맵 목록 조회 ── */
router.get('/amr-maps', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ success: false, msg: 'ip query parameter is required' });
  try {
    const result = await fetchMapList(ip);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(502).json({ success: false, msg: e.message });
  }
});

/* ── AMR에서 맵 다운로드 & DB 저장 ── */
router.post('/amr-download', async (req, res) => {
  const { ip, map_name } = req.body;
  if (!ip || !map_name) return res.status(400).json({ success: false, msg: 'ip and map_name are required' });
  try {
    const created = await downloadAndImportMap(ip, map_name);
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    res.status(502).json({ success: false, msg: e.message });
  }
});

router.get('/:id', mapController.getMapById);
router.post('/', mapController.createMap);
router.put('/:id', mapController.updateMap);
router.put('/:id/set-current', mapController.setCurrentMap);
router.delete('/:id', mapController.deleteMap);

module.exports = router;
