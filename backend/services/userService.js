const User = require('../model/User');

// 모든 사용자 조회 (비밀번호 제외)
const getAllUsers = async () => {
  return await User.findAll({
    attributes: { exclude: ['password'] },
  });
};

// 특정 사용자 조회 (비밀번호 제외)
const getUserById = async (id) => {
  return await User.findByPk(id, {
    attributes: { exclude: ['password'] },
  });
};

// 사용자 생성
const createUser = async (data) => {
  const user = await User.create(data);
  // 응답에서 비밀번호 제거
  const result = user.toJSON();
  delete result.password;
  return result;
};

// 사용자 수정
const updateUser = async (id, data) => {
  const user = await User.findByPk(id);
  if (!user) return null;
  await user.update({ ...data, updated_at: new Date() });
  const result = user.toJSON();
  delete result.password;
  return result;
};

// 사용자 삭제
const deleteUser = async (id) => {
  const user = await User.findByPk(id);
  if (!user) return null;
  await user.destroy();
  return { id };
};

// 로그인 (username + password 검증)
const login = async (username, password) => {
  const user = await User.findOne({ where: { username } });
  if (!user) return null;

  const isValid = await user.validatePassword(password);
  if (!isValid) return null;

  const result = user.toJSON();
  delete result.password;
  return result;
};

// 기본 관리자 계정 초기화
const initDefaultAdmin = async () => {
  const exists = await User.findOne({ where: { username: 'admin' } });
  if (!exists) {
    await User.create({
      username: 'admin',
      password: 'admin1234',
      role: 'admin',
      name: '관리자',
    });
    console.log('👤 기본 관리자 계정 생성 (admin / admin1234)');
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  login,
  initDefaultAdmin,
};
