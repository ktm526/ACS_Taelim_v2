/**
 * armCommandController.js
 * ─────────────────────────────────────
 * MES → ACS 로봇 팔 명령 인터페이스
 * POST /api/arm_command
 *
 * action: EXECUTE | CANCEL
 * task_status 흐름: RUNNING → FINISHED | ERROR
 */
const { Task, Amr } = require('../model');
const amrService = require('../services/amrService');
const {
  sendManiCommand,
  setRobotDo,
  activeArmTasks,
  MANI_WORK_DO_ID,
} = require('../services/armService');
const { sendTaskResult } = require('../services/mesStatusService');
const { writeLog } = require('../services/logService');

/**
 * POST /api/arm_command
 *
 * Request : { task_id, amr_name, action, params: { from_location_id, to_location_id, vision_check } }
 * Response: { result_msg, server_time }
 */
const armCommand = async (req, res) => {
  const serverTime = new Date().toISOString();

  try {
    const { task_id, amr_name, action, params } = req.body;

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
     *  EXECUTE — 로봇 팔 작업 시작
     * ═══════════════════════════════════════════ */
    if (upperAction === 'EXECUTE') {
      if (task_id == null || !amr_name || !params) {
        return res.status(400).json({
          result_msg: 'FAIL: task_id, amr_name, params are required for EXECUTE',
          server_time: serverTime,
        });
      }

      const { from_location_id, to_location_id, vision_check } = params;
      if (from_location_id == null || to_location_id == null) {
        return res.status(400).json({
          result_msg: 'FAIL: params.from_location_id and params.to_location_id are required',
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
        where: { amr_name, task_status: 'RUNNING' },
      });

      if (existingTask) {
        return res.status(409).json({
          result_msg: `FAIL: AMR "${amr_name}" already has an active task (task_id=${existingTask.task_id}, status=${existingTask.task_status})`,
          server_time: serverTime,
        });
      }

      // IP 체크
      if (!amr.ip) {
        return res.status(400).json({
          result_msg: `FAIL: AMR "${amr_name}" has no IP address`,
          server_time: serverTime,
        });
      }

      // 태스크 생성
      const task = await Task.create({
        task_id,
        amr_name,
        task_type: 'ARM',
        task_status: 'RUNNING',
        param: JSON.stringify(params),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // AMR task_id 설정
      await amrService.updateAmr(amr.amr_id, { task_id });

      // TCP 명령 전송: 1) MANI 명령 → 2) DO 트리거
      try {
        console.log(`[ARM_CMD] EXECUTE: ${amr_name} (task_id=${task_id})`);
        console.log(`[ARM_CMD]   from=${from_location_id}, to=${to_location_id}, vision=${vision_check}`);

        // 1) 매니퓰레이터 명령 전송
        await sendManiCommand(amr.ip, params);
        console.log(`[ARM_CMD]   ✓ MANI 명령 전송 완료`);

        // 2) DO 트리거 (작업 시작 신호)
        await setRobotDo(amr.ip, MANI_WORK_DO_ID, true);
        console.log(`[ARM_CMD]   ✓ DO${MANI_WORK_DO_ID}=1 전송 완료`);

        // 백그라운드 모니터에 등록 (DI 폴링 시작)
        activeArmTasks.set(task_id, {
          amrName: amr_name,
          amrIp: amr.ip,
          startedAt: Date.now(),
        });

        console.log(`[ARM_CMD]   DI 모니터링 시작 (성공: DI11, 에러: DI12)`);
      } catch (tcpErr) {
        // TCP 실패 → 태스크 ERROR, AMR task_id 리셋
        await task.update({
          task_status: 'ERROR',
          error_code: tcpErr.message,
          updated_at: new Date(),
        });
        await amrService.updateAmr(amr.amr_id, { task_id: 0 });
        console.error(`[ARM_CMD] TCP 전송 실패: ${tcpErr.message}`);
        sendTaskResult({ task_id, amr_name, task_type: 'ARM', task_status: 'ERROR', error_code: tcpErr.message });
        const errResp = { result_msg: `FAIL: TCP command failed — ${tcpErr.message}`, server_time: serverTime };
        writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'ARM_COMMAND', method: 'POST', status: 'ERROR', request_data: req.body, response_data: errResp, error_message: tcpErr.message, amr_name, task_id });
        return res.status(500).json(errResp);
      }

      const okResp = { result_msg: 'OK', server_time: serverTime };
      writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'ARM_COMMAND', method: 'POST', status: 'SUCCESS', request_data: req.body, response_data: okResp, amr_name, task_id });
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

      // 태스크 취소
      await task.update({ task_status: 'CANCELLED', updated_at: new Date() });

      // AMR task_id 리셋
      const amr = await Amr.findOne({ where: { amr_name: task.amr_name } });
      if (amr) {
        // DO 리셋
        try { await setRobotDo(amr.ip, MANI_WORK_DO_ID, false); } catch {}
        await amrService.updateAmr(amr.amr_id, { task_id: 0 });
      }

      // 모니터에서 제거
      activeArmTasks.delete(task_id);

      console.log(`[ARM_CMD] CANCEL: task_id=${task_id}, amr=${task.amr_name}`);
      const okResp = { result_msg: 'OK', server_time: serverTime };
      writeLog({ log_type: 'API', direction: 'INBOUND', interface_id: 'ARM_COMMAND', method: 'POST', status: 'SUCCESS', request_data: req.body, response_data: okResp, amr_name: task.amr_name, task_id });
      return res.json(okResp);
    }
  } catch (err) {
    console.error('[ARM_CMD] 처리 오류:', err);
    return res.status(500).json({
      result_msg: `FAIL: ${err.message}`,
      server_time: serverTime,
    });
  }
};

module.exports = { armCommand };
