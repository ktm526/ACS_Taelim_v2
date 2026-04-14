const express = require('express');
const router = express.Router();
const { initRobotDI } = require('../services/armService');
const { newBuildArmInfo } = require('../services/mesStatusService');

router.get('/monitor', (req, res) => {
    res.json({ message: 'arm monitoring api is running' });
});

router.post('/monitor/state', newBuildArmInfo);

router.post('/task_init', initRobotDI);

module.exports = router;