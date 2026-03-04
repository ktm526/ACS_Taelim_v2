const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const InterfaceLog = sequelize.define(
  'InterfaceLog',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    log_type: {
      type: DataTypes.STRING,   // 'API' | 'TCP'
      allowNull: false,
    },
    direction: {
      type: DataTypes.STRING,   // 'INBOUND' | 'OUTBOUND'
      allowNull: false,
    },
    interface_id: {
      type: DataTypes.STRING,   // MONITORING, MOVE_COMMAND, ARM_COMMAND, TASK_RESULT, NAV_CMD, MANI_CMD, ROBOT_DO, ROBOT_DI
      allowNull: false,
    },
    target: {
      type: DataTypes.STRING,   // IP 또는 URL
      allowNull: true,
    },
    method: {
      type: DataTypes.STRING,   // POST, TCP, etc.
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,   // SUCCESS | ERROR
      allowNull: false,
      defaultValue: 'SUCCESS',
    },
    request_data: {
      type: DataTypes.TEXT,     // JSON 문자열
      allowNull: true,
    },
    response_data: {
      type: DataTypes.TEXT,     // JSON 문자열
      allowNull: true,
    },
    error_message: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amr_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'InterfaceLogs',
    timestamps: false,
    indexes: [
      { fields: ['timestamp'] },
      { fields: ['interface_id'] },
      { fields: ['log_type'] },
      { fields: ['status'] },
    ],
  }
);

module.exports = InterfaceLog;
