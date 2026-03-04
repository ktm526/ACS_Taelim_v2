const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * SimAmr — 시뮬레이션 AMR
 * 실제 Amr 모델과 동일한 컬럼 구조
 */
const SimAmr = sequelize.define(
  'SimAmr',
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
      defaultValue: 'IDLE', // ERROR | STOP | E-STOP | IDLE | MOVING | NO_CONN
    },
    battery: {
      type: DataTypes.FLOAT,
      defaultValue: 100,
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

    /* ── 확장 필드 ── */
    additional_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'SimAmrs',
    timestamps: false,
  }
);

module.exports = SimAmr;
