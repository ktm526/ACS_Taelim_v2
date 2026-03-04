const express = require('express');
const router = express.Router();
const { armCommand } = require('../controller/armCommandController');

// POST /api/arm_command — MES → ACS 로봇 팔 명령
router.post('/', armCommand);

module.exports = router;
