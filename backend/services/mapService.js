const { Map } = require('../model');

// 모든 Map 조회
const getAllMaps = async () => {
  return await Map.findAll();
};

// 특정 Map 조회
const getMapById = async (id) => {
  return await Map.findByPk(id);
};

// 현재 사용 중인 Map 조회
const getCurrentMap = async () => {
  return await Map.findOne({ where: { is_current: true } });
};

// Map 생성
const createMap = async (data) => {
  return await Map.create(data);
};

// Map 수정
const updateMap = async (id, data) => {
  const map = await Map.findByPk(id);
  if (!map) return null;
  return await map.update({ ...data, last_updated: new Date() });
};

// 현재 맵 설정 (기존 current 해제 후 새로 설정)
const setCurrentMap = async (id) => {
  await Map.update({ is_current: false }, { where: { is_current: true } });
  const map = await Map.findByPk(id);
  if (!map) return null;
  return await map.update({ is_current: true, last_updated: new Date() });
};

// Map 삭제
const deleteMap = async (id) => {
  const map = await Map.findByPk(id);
  if (!map) return null;
  await map.destroy();
  return map;
};

module.exports = {
  getAllMaps,
  getMapById,
  getCurrentMap,
  createMap,
  updateMap,
  setCurrentMap,
  deleteMap,
};
