const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Amr = sequelize.define(
  'Amr',
  {
    amr_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    amr_name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    map: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pos_x: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    pos_y: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    deg: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'NO_CONN', // ERROR | STOP | E-STOP | IDLE | MOVING | NO_CONN
    },
    battery: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    current_station_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dest_station_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    error_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    stop_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /* ── 모니터링 확장 필드 ── */
    additional_info: {
      type: DataTypes.TEXT, // 확장 정보 JSON
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE, // 마지막 데이터 수신 시각
      allowNull: true,
    },
  },
  {
    tableName: 'Amrs',
    timestamps: false,
  }
);

module.exports = Amr;
