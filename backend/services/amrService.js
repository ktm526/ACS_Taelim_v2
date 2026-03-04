const { Amr } = require('../model');

// 모든 AMR 조회
const getAllAmrs = async () => {
  return await Amr.findAll();
};

// 특정 AMR 조회
const getAmrById = async (amr_id) => {
  return await Amr.findByPk(amr_id);
};

// AMR 생성
const createAmr = async (data) => {
  return await Amr.create(data);
};

// AMR 수정
const updateAmr = async (amr_id, data) => {
  const amr = await Amr.findByPk(amr_id);
  if (!amr) return null;
  return await amr.update(data);
};

// AMR 삭제
const deleteAmr = async (amr_id) => {
  const amr = await Amr.findByPk(amr_id);
  if (!amr) return null;
  await amr.destroy();
  return amr;
};

module.exports = {
  getAllAmrs,
  getAmrById,
  createAmr,
  updateAmr,
  deleteAmr,
};
