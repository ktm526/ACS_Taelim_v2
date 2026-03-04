const SimAmr = require('../model/SimAmr');

// 모든 SimAmr 조회
const getAllSimAmrs = async () => {
  return await SimAmr.findAll();
};

// 특정 SimAmr 조회
const getSimAmrById = async (amr_id) => {
  return await SimAmr.findByPk(amr_id);
};

// SimAmr 생성
const createSimAmr = async (data) => {
  return await SimAmr.create(data);
};

// SimAmr 수정
const updateSimAmr = async (amr_id, data) => {
  const simAmr = await SimAmr.findByPk(amr_id);
  if (!simAmr) return null;
  return await simAmr.update({ ...data, timestamp: new Date() });
};

// SimAmr 삭제
const deleteSimAmr = async (amr_id) => {
  const simAmr = await SimAmr.findByPk(amr_id);
  if (!simAmr) return null;
  await simAmr.destroy();
  return simAmr;
};

module.exports = {
  getAllSimAmrs,
  getSimAmrById,
  createSimAmr,
  updateSimAmr,
  deleteSimAmr,
};
