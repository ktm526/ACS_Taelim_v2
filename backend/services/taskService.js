const { Task } = require('../model');
const { Op } = require('sequelize');

// ── 기본 CRUD ──

const getAllTasks = async () => {
  return await Task.findAll({ order: [['created_at', 'DESC']] });
};

const getTaskById = async (task_id) => {
  return await Task.findByPk(task_id);
};

const createTask = async (data) => {
  return await Task.create(data);
};

const updateTask = async (task_id, data) => {
  const task = await Task.findByPk(task_id);
  if (!task) return null;
  return await task.update({ ...data, updated_at: new Date() });
};

const deleteTask = async (task_id) => {
  const task = await Task.findByPk(task_id);
  if (!task) return null;
  await task.destroy();
  return task;
};

// ── FINISHED/ERROR 태스크 6시간 후 자동 삭제 ──

const TASK_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10분마다
const TASK_RETENTION_MS = 6 * 60 * 60 * 1000;  // 6시간

let cleanupTimer = null;

async function cleanupOldTasks() {
  try {
    const cutoff = new Date(Date.now() - TASK_RETENTION_MS);
    const deleted = await Task.destroy({
      where: {
        task_status: { [Op.in]: ['FINISHED', 'ERROR'] },
        updated_at: { [Op.lt]: cutoff },
      },
    });
    if (deleted > 0) {
      console.log(`[TaskService] 완료/에러 태스크 ${deleted}건 자동 삭제 (6시간 경과)`);
    }
  } catch (e) {
    console.error('[TaskService] 태스크 정리 오류:', e.message);
  }
}

function startTaskCleanup() {
  if (cleanupTimer) return; // 중복 방지
  cleanupTimer = setInterval(cleanupOldTasks, TASK_CLEANUP_INTERVAL);
  console.log('🧹 Task cleanup scheduler started (interval: 10min, retention: 6h)');
}

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  cleanupOldTasks,
  startTaskCleanup,
};
