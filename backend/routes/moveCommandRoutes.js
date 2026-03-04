const express = require('express');
const router = express.Router();
const { moveCommand } = require('../controller/moveCommandController');

// POST /api/move_command — MES → ACS 이동 지시
router.post('/', moveCommand);

module.exports = router;
