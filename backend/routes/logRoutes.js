const express = require('express');
const router = express.Router();
const { getLogs } = require('../controller/logController');

router.get('/', getLogs);

module.exports = router;
