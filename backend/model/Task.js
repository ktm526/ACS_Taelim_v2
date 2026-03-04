const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Task = sequelize.define(
  'Task',
  {
    task_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    amr_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    task_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    task_status: {
      type: DataTypes.STRING,
      defaultValue: 'pending',
    },
    error_code: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    param: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON 형태의 추가 파라미터 (예: station_id 등)',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'Tasks',
    timestamps: false,
  }
);

module.exports = Task;
