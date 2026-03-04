const settingService = require('../services/settingService');

// GET /api/settings
const getAllSettings = async (req, res, next) => {
  try {
    const settings = await settingService.getAllSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// GET /api/settings/:key
const getSettingByKey = async (req, res, next) => {
  try {
    const setting = await settingService.getSettingByKey(req.params.key);
    if (!setting) return res.status(404).json({ message: 'Setting not found' });
    res.json(setting);
  } catch (err) {
    next(err);
  }
};

// PUT /api/settings/:key
const upsertSetting = async (req, res, next) => {
  try {
    const { value, description } = req.body;
    const setting = await settingService.upsertSetting(
      req.params.key,
      value,
      description
    );
    res.json(setting);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/settings/:key
const deleteSetting = async (req, res, next) => {
  try {
    const setting = await settingService.deleteSetting(req.params.key);
    if (!setting) return res.status(404).json({ message: 'Setting not found' });
    res.json({ message: 'Setting deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllSettings,
  getSettingByKey,
  upsertSetting,
  deleteSetting,
};
