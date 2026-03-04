const app = require('./app');
const dotenv = require('dotenv');
const sequelize = require('./config/db');
const { startMonitoring } = require('./services/amrMonitorService');
const { initDefaults: initSettings } = require('./services/settingService');
const { initDefaultAdmin } = require('./services/userService');
const { startTaskCleanup } = require('./services/taskService');
const { startArmMonitor } = require('./services/armService');
const { startMesStatus } = require('./services/mesStatusService');
const { startLogCleanup } = require('./services/logService');

// 모델 import (테이블 자동 생성을 위해)
require('./model');

dotenv.config();

const PORT = process.env.PORT || 4000;

// DB 동기화 후 서버 시작
sequelize
  .sync({ alter: true }) // 모델 변경 사항 자동 반영
  .then(async () => {
    console.log('📦 Database synced successfully');

    // 기본 데이터 초기화
    await initSettings();
    console.log('⚙️  Default settings initialized');

    await initDefaultAdmin();

    // AMR 모니터링 서비스 시작
    startMonitoring();

    // 태스크 정리 스케줄러 시작
    startTaskCleanup();

    // 로봇 팔 DI 모니터 시작
    startArmMonitor();

    // MES 상태 전송 서비스 시작 (1Hz)
    startMesStatus();

    // 로그 정리 스케줄러 시작
    startLogCleanup();

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('❌ Database sync failed:', err);
    process.exit(1);
  });
