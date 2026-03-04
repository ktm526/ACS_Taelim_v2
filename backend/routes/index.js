const express = require('express');
const router = express.Router();

const amrRoutes = require('./amrRoutes');
const taskRoutes = require('./taskRoutes');
const mapRoutes = require('./mapRoutes');
const mapUploadRoutes = require('./mapUploadRoutes');
const settingRoutes = require('./settingRoutes');
const userRoutes = require('./userRoutes');
const simAmrRoutes = require('./simAmrRoutes');
const moveCommandRoutes = require('./moveCommandRoutes');
const armCommandRoutes = require('./armCommandRoutes');
const logRoutes = require('./logRoutes');

router.use('/amrs', amrRoutes);
router.use('/tasks', taskRoutes);
router.use('/maps', mapRoutes);
router.use('/maps', mapUploadRoutes);
router.use('/settings', settingRoutes);
router.use('/users', userRoutes);
router.use('/sim-amrs', simAmrRoutes);
router.use('/move_command', moveCommandRoutes);
router.use('/arm_command', armCommandRoutes);
router.use('/logs', logRoutes);

// 기본 API 상태 확인
router.get('/', (req, res) => {
  res.json({ message: 'API is working' });
});

module.exports = router;
