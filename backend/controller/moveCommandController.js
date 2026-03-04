/**
 * moveCommandController.js
 * ─────────────────────────────────────
 * MES → ACS 이동 지시 인터페이스
 * POST /api/move_command
 *
 * action: EXECUTE | CANCEL
 * task_status 흐름: RUNNING → FINISHED | ERROR
 * 완료/에러 후 AMR.task_id → 0, 태스크는 6시간 뒤 자동 삭제
 */
const { Task, Amr } = require('../model');
const { Op } = require('sequelize');
const { sendGotoNav } = require('../services/navService');
const amrService = require('../services/amrService');
const { sendTaskResult } = require('../services/mesStatusService');
const { writeLog } = require('../services/logService');

/**
 * POST /api/move_command
 *
 * Request : { task_id, amr_name, action, station_id }
 * Response: { result_msg, server_time }
 */
const moveCommand = async (req, res) => {
  const serverTime = new Date().toISOString();

  try {
    const { task_id, amr_name, action, station_id } = req.body;

    /* ── 공통 유효성 검사 ── */
    if (!action) {
      return res.status(400).json({
        result_msg: 'FAIL: action is required',
        server_time: serverTime,
      });
    }

    const upperAction = action.toUpperCase();

    if (!['EXECUTE', 'CANCEL'].includes(upperAction)) {
      return res.status(400).json({
        result_msg: `FAIL: unknown action "${action}". (EXECUTE | CANCEL)`,
        server_time: serverTime,
      });
    }

    /* ═══════════════════════════════════════════
     *  EXECUTE — 새 이동 태스크 생성 & AMR 이동 명령
     * ═══════════════════════════════════════════ */
    if (upperAction === 'EXECUTE') {
      if (task_id == null || !amr_name || !station_id) {
        return res.status(400).json({
          result_msg: 'FAIL: task_id, amr_name, station_id are required for EXECUTE',
          server_time: serverTime,
        });
      }

      // AMR 조회
      const amr = await Amr.findOne({ where: { amr_name } });
      if (!amr) {
        return res.status(404).json({
          result_msg: `FAIL: AMR "${amr_name}" not found`,
          server_time: serverTime,
        });
      }

      // 해당 AMR에 이미 활성 태스크가 있는지 확인
      const existingTask = await Task.findOne({
        where: {
          amr_name,
          task_status: 'RUNNING',
        },
      });

      if (existingTask) {
        return res.status(409).json({
          result_msg: `FAIL: AMR "${amr_name}" already has an active task (task_id=${existingTask.task_id}, status=${existingTask.task_status})`,
          server_time: serverTime,
        });
      }

      // 태스크 생성
      const task = await Task.create({
        task_id,
        amr_name,
        task_type: 'MOVE',
        task_status: 'RUNNING',
        param: JSON.stringify({ station_id }),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // AMR task_id 설정
      await amrService.updateAmr(amr.amr_id, {
        task_id,
        dest_station_id: station_id,
      });

      // AMR에 TCP 이동 명령 전송
      if (amr.ip) {
        try {
          await sendGotoNav(amr.ip, station_id, 'SELF_POSITION', String(task_id));
          console.log(`[MOVE_CMD] EXECUTE: ${amr_name} → ${station_id} (task_id=${task_id})`);
        } catch (tcpErr) {
          // TCP 실패 → 태스크 ERROR, AMR task_id 리셋
          await task.update({
            task_status: 'ERROR',
            error_code: tcpErr.message,
            updated_at: new Date(),
          });
          await amrService.updateAmr(amr.amr_id, {
            task_id: 0,
            dest_station_id: null,
          });
          console.error(`[MOVE_CMD] TCP 전송 실패: ${tcpErr.message}`);
          sendTaskResult({ task_id, amr_name, task_type: 'MOVE', task_status: 'ERROR', error_code: tcpErr.message });
          const errResp = { result_msg: `FAIL: TCP command failed — ${tcpErr.message}`, server_time: serverTime };
          writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'MOVE_COMMAND', method: 'POST', status: 'ERROR', request_data: req.body, response_data: errResp, error_message: tcpErr.message, amr_name, task_id });
          return res.status(500).json(errResp);
        }
      } else {
        // IP 없으면 에러 처리
        await task.update({
          task_status: 'ERROR',
          error_code: 'AMR_NO_IP',
          updated_at: new Date(),
        });
        await amrService.updateAmr(amr.amr_id, { task_id: 0 });
        sendTaskResult({ task_id, amr_name, task_type: 'MOVE', task_status: 'ERROR', error_code: 'AMR_NO_IP' });
        const errResp = { result_msg: `FAIL: AMR "${amr_name}" has no IP address`, server_time: serverTime };
        writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'MOVE_COMMAND', method: 'POST', status: 'ERROR', request_data: req.body, response_data: errResp, error_message: 'AMR_NO_IP', amr_name, task_id });
        return res.status(400).json(errResp);
      }

      const okResp = { result_msg: 'OK', server_time: serverTime };
      writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'MOVE_COMMAND', method: 'POST', status: 'SUCCESS', request_data: req.body, response_data: okResp, amr_name, task_id });
      return res.json(okResp);
    }

    /* ═══════════════════════════════════════════
     *  CANCEL — 태스크 취소
     * ═══════════════════════════════════════════ */
    if (upperAction === 'CANCEL') {
      if (task_id == null) {
        return res.status(400).json({
          result_msg: 'FAIL: task_id is required for CANCEL',
          server_time: serverTime,
        });
      }

      const task = await Task.findByPk(task_id);
      if (!task) {
        return res.status(404).json({
          result_msg: `FAIL: task_id ${task_id} not found`,
          server_time: serverTime,
        });
      }

      if (task.task_status !== 'RUNNING') {
        return res.status(409).json({
          result_msg: `FAIL: task_id ${task_id} is not RUNNING (current: ${task.task_status})`,
          server_time: serverTime,
        });
      }

      // 태스크 취소 처리
      await task.update({ task_status: 'CANCELLED', updated_at: new Date() });

      // AMR task_id 리셋
      const amr = await Amr.findOne({ where: { amr_name: task.amr_name } });
      if (amr) {
        await amrService.updateAmr(amr.amr_id, {
          task_id: 0,
          dest_station_id: null,
        });
      }

      console.log(`[MOVE_CMD] CANCEL: task_id=${task_id}, amr=${task.amr_name}`);
      const okResp = { result_msg: 'OK', server_time: serverTime };
      writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'MOVE_COMMAND', method: 'POST', status: 'SUCCESS', request_data: req.body, response_data: okResp, amr_name: task.amr_name, task_id });
      return res.json(okResp);
    }
  } catch (err) {
    console.error('[MOVE_CMD] 처리 오류:', err);
    return res.status(500).json({
      result_msg: `FAIL: ${err.message}`,
      server_time: serverTime,
    });
  }
};

module.exports = { moveCommand };
