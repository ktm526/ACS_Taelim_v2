const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // DB 설정 등 추가 가능
  // db: {
  //   host: process.env.DB_HOST || 'localhost',
  //   port: process.env.DB_PORT || 27017,
  //   name: process.env.DB_NAME || 'acs_taelim',
  // },
};
