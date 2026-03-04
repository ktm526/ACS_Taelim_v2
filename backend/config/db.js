const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', 'database.sqlite'),
  logging: false, // SQL 로그 끄기 (필요 시 console.log 로 변경)
});

module.exports = sequelize;
