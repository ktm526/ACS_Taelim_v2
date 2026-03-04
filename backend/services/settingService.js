const Setting = require('../model/Setting');

// 모든 설정 조회
const getAllSettings = async () => {
  return await Setting.findAll();
};

// 특정 키로 설정 조회
const getSettingByKey = async (key) => {
  return await Setting.findOne({ where: { key } });
};

// 설정 생성 또는 업데이트 (upsert)
const upsertSetting = async (key, value, description) => {
  const existing = await Setting.findOne({ where: { key } });
  if (existing) {
    return await existing.update({ value, description, updated_at: new Date() });
  }
  return await Setting.create({ key, value, description });
};

// 설정 삭제
const deleteSetting = async (key) => {
  const setting = await Setting.findOne({ where: { key } });
  if (!setting) return null;
  await setting.destroy();
  return setting;
};

// 기본 설정값 초기화 (최초 실행 시)
const initDefaults = async () => {
  const defaults = [
    { key: 'mes_ip', value: '', description: 'MES 서버 IP 주소' },
  ];

  for (const d of defaults) {
    const exists = await Setting.findOne({ where: { key: d.key } });
    if (!exists) {
      await Setting.create(d);
    }
  }
};

module.exports = {
  getAllSettings,
  getSettingByKey,
  upsertSetting,
  deleteSetting,
  initDefaults,
};
