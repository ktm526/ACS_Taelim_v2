const express = require('express');
const router = express.Router();
const settingController = require('../controller/settingController');

router.get('/', settingController.getAllSettings);
router.get('/:key', settingController.getSettingByKey);
router.put('/:key', settingController.upsertSetting);
router.delete('/:key', settingController.deleteSetting);

module.exports = router;
