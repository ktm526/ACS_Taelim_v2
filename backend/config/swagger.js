/**
 * swagger.js
 * ─────────────────────────────────────────────
 * Swagger (OpenAPI 3.0) API 명세 설정
 */
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ACS Taelim API',
      version: '1.0.0',
      description:
        'ACS (AMR Control System) Taelim — AMR 제어 및 MES 인터페이스 API 명세서',
      contact: {
        name: 'ACS Taelim',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API 기본 경로',
      },
    ],
    tags: [
      { name: 'AMR', description: 'AMR 관리 및 모니터링' },
      { name: 'Task', description: '태스크 관리' },
      { name: 'Map', description: '맵 관리' },
      { name: 'Setting', description: '시스템 설정' },
      { name: 'User', description: '사용자 관리 및 인증' },
      { name: 'SimAmr', description: '시뮬레이션 AMR 관리' },
      { name: 'MoveCommand', description: 'MES → ACS 이동 지시 인터페이스' },
      { name: 'ArmCommand', description: 'MES → ACS 로봇 팔 명령 인터페이스' },
      { name: 'Log', description: '인터페이스 로그 조회' },
      { name: 'MES (참조)', description: 'ACS → MES 송신 인터페이스 (참조용, ACS가 호출하는 API)' },
    ],

    /* ═══════════════════════════════════════════
     *  Components — 공통 스키마 정의
     * ═══════════════════════════════════════════ */
    components: {
      schemas: {
        /* ── AMR ── */
        Amr: {
          type: 'object',
          properties: {
            amr_id: { type: 'integer', description: 'AMR 고유 ID', example: 1 },
            amr_name: { type: 'string', description: 'AMR 식별 명칭', example: 'M500-1' },
            ip: { type: 'string', description: 'AMR IP 주소', example: '192.168.1.10' },
            map: { type: 'string', description: '현재 위치 맵', example: '1F_Main' },
            pos_x: { type: 'number', format: 'float', description: 'X 좌표 (m)', example: 12.45 },
            pos_y: { type: 'number', format: 'float', description: 'Y 좌표 (m)', example: 8.12 },
            deg: { type: 'number', format: 'float', description: '헤딩 (rad)', example: 1.57 },
            status: {
              type: 'string',
              enum: ['ERROR', 'STOP', 'E-STOP', 'IDLE', 'MOVING', 'NO_CONN'],
              description: 'AMR 상태',
              example: 'IDLE',
            },
            battery: { type: 'number', format: 'float', description: '배터리 (%)', example: 85 },
            current_station_id: { type: 'string', description: '현재 스테이션 ID', example: 'LM1' },
            dest_station_id: { type: 'string', description: '목적지 스테이션 ID', example: 'LM2' },
            task_id: { type: 'integer', description: '현재 수행 중 태스크 ID (0 = 없음)', example: 0 },
            error_code: { type: 'string', description: '에러 코드', example: '0' },
            stop_code: { type: 'string', description: '정지 코드', example: '0' },
            additional_info: { type: 'string', description: '확장 정보 (JSON 문자열)', nullable: true },
            timestamp: { type: 'string', format: 'date-time', description: '마지막 데이터 수신 시각', nullable: true },
          },
        },

        AmrCreate: {
          type: 'object',
          required: ['amr_name'],
          properties: {
            amr_name: { type: 'string', description: 'AMR 식별 명칭', example: 'M500-1' },
            ip: { type: 'string', description: 'AMR IP 주소', example: '192.168.1.10' },
          },
        },

        /* ── Task ── */
        Task: {
          type: 'object',
          properties: {
            task_id: { type: 'integer', description: '태스크 ID', example: 125 },
            amr_name: { type: 'string', description: '할당된 AMR 이름', example: 'M500-1' },
            task_type: { type: 'string', enum: ['MOVE', 'ARM'], description: '태스크 유형', example: 'MOVE' },
            task_status: {
              type: 'string',
              enum: ['RUNNING', 'FINISHED', 'ERROR', 'CANCELLED'],
              description: '태스크 상태',
              example: 'RUNNING',
            },
            error_code: { type: 'string', description: '에러 코드', nullable: true },
            param: { type: 'string', description: '추가 파라미터 (JSON 문자열)', nullable: true, example: '{"station_id":"LM1"}' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        /* ── Map ── */
        Map: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: '맵 ID', example: 1 },
            name: { type: 'string', description: '맵 이름', example: '1F_Main' },
            stations: { type: 'string', description: '스테이션 목록 (JSON 문자열)', nullable: true },
            paths: { type: 'string', description: '경로 목록 (JSON 문자열)', nullable: true },
            additional_info: { type: 'string', description: '추가 정보 (JSON 문자열)', nullable: true },
            is_current: { type: 'boolean', description: '현재 사용 중 여부', example: true },
            last_updated: { type: 'string', format: 'date-time' },
          },
        },

        /* ── Setting ── */
        Setting: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            key: { type: 'string', description: '설정 키', example: 'mes_ip' },
            value: { type: 'string', description: '설정 값', example: '192.168.1.100' },
            description: { type: 'string', description: '설명', example: 'MES 서버 IP 주소' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        /* ── User ── */
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            username: { type: 'string', example: 'admin' },
            role: { type: 'string', enum: ['admin', 'user'], example: 'admin' },
            name: { type: 'string', example: '관리자' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        /* ── SimAmr ── */
        SimAmr: {
          type: 'object',
          properties: {
            amr_id: { type: 'integer', example: 1 },
            amr_name: { type: 'string', example: 'SIM-1' },
            ip: { type: 'string', example: '127.0.0.1' },
            status: { type: 'string', example: 'IDLE' },
            battery: { type: 'number', example: 100 },
            pos_x: { type: 'number', example: 0 },
            pos_y: { type: 'number', example: 0 },
            deg: { type: 'number', example: 0 },
          },
        },

        /* ── InterfaceLog ── */
        InterfaceLog: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            timestamp: { type: 'string', format: 'date-time' },
            log_type: { type: 'string', enum: ['API', 'TCP'], description: '로그 유형' },
            direction: { type: 'string', enum: ['INBOUND', 'OUTBOUND'], description: '통신 방향' },
            interface_id: {
              type: 'string',
              enum: ['MONITORING', 'MOVE_COMMAND', 'ARM_COMMAND', 'TASK_RESULT', 'NAV_CMD', 'MANI_CMD', 'ROBOT_DO', 'ROBOT_DI', 'AMR_CONN', 'MES_CONN', 'MAP_LIST', 'MAP_DOWNLOAD'],
              description: '인터페이스 식별자',
            },
            target: { type: 'string', description: 'IP 또는 URL' },
            method: { type: 'string', description: 'POST, TCP 등' },
            status: { type: 'string', enum: ['SUCCESS', 'ERROR'] },
            request_data: { type: 'string', description: '요청 데이터 (JSON 문자열)' },
            response_data: { type: 'string', description: '응답 데이터 (JSON 문자열)' },
            error_message: { type: 'string', nullable: true },
            amr_name: { type: 'string', nullable: true },
            task_id: { type: 'integer', nullable: true },
          },
        },

        /* ── MES 인터페이스 요청/응답 ── */
        MoveCommandRequest: {
          type: 'object',
          required: ['task_id', 'amr_name', 'action'],
          properties: {
            task_id: { type: 'integer', description: '작업 번호', example: 125 },
            amr_name: { type: 'string', description: '작업을 수행할 AMR 이름', example: 'M500-1' },
            action: { type: 'string', enum: ['EXECUTE', 'CANCEL'], description: '명령 (EXECUTE | CANCEL)', example: 'EXECUTE' },
            station_id: { type: 'string', description: '목적지 스테이션 ID (EXECUTE 시 필수)', example: 'LM1' },
          },
        },

        ArmCommandRequest: {
          type: 'object',
          required: ['task_id', 'amr_name', 'action'],
          properties: {
            task_id: { type: 'integer', description: '작업 번호', example: 125 },
            amr_name: { type: 'string', description: '작업을 수행할 AMR 이름', example: 'M500-1' },
            action: { type: 'string', enum: ['EXECUTE', 'CANCEL'], description: '명령 (EXECUTE | CANCEL)', example: 'EXECUTE' },
            params: {
              type: 'object',
              description: '작업 상세 정보 (EXECUTE 시 필수)',
              properties: {
                from_location_id: { type: 'integer', description: '물건을 잡을 위치', example: 22 },
                to_location_id: { type: 'integer', description: '물건을 둘 위치', example: 61 },
                vision_check: { type: 'integer', enum: [0, 1], description: '비전 체크 여부', example: 1 },
              },
            },
          },
        },

        CommandResponse: {
          type: 'object',
          properties: {
            result_msg: { type: 'string', description: '처리 결과', example: 'OK' },
            server_time: { type: 'string', format: 'date-time', description: '응답 생성 시각 (UTC, ISO8601)', example: '2026-03-04T16:48:00Z' },
          },
        },

        /* ── ACS → MES 참조 스키마 ── */
        MonitoringPayload: {
          type: 'object',
          description: 'ACS → MES 주기적 상태 전송 페이로드 (1Hz)',
          properties: {
            request_time: { type: 'string', format: 'date-time', example: '2026-03-04T16:48:00Z' },
            amr_count: { type: 'integer', description: '현재 AMR 수', example: 2 },
            amr_list: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  amr_id: { type: 'integer', example: 101 },
                  amr_name: { type: 'string', example: 'AMR_01' },
                  map: { type: 'string', example: '1F_Main' },
                  pos_x: { type: 'number', example: 12.45 },
                  pos_y: { type: 'number', example: 8.12 },
                  deg: { type: 'number', example: 1.57 },
                  status: { type: 'string', example: 'MOVING' },
                  battery: { type: 'integer', example: 85 },
                  current_station_id: { type: 'string', example: 'LM1' },
                  dest_station_id: { type: 'string', example: 'LM2' },
                  task_id: { type: 'integer', example: 5021 },
                  error_code: { type: 'integer', example: 0 },
                  stop_code: { type: 'integer', example: 0 },
                },
              },
            },
          },
        },

        TaskResultPayload: {
          type: 'object',
          description: 'ACS → MES 태스크 결과 전송 페이로드',
          properties: {
            request_time: { type: 'string', format: 'date-time', example: '2026-03-04T16:48:00Z' },
            task_id: { type: 'integer', description: '태스크 ID', example: 23 },
            amr_name: { type: 'string', description: 'AMR 이름', example: 'AMR_01' },
            task_type: { type: 'string', enum: ['ARM', 'MOVE'], description: '작업 유형', example: 'ARM' },
            task_status: { type: 'string', enum: ['FINISHED', 'ERROR'], description: '작업 결과', example: 'FINISHED' },
            error_code: { type: 'integer', description: '에러 코드 (정상 시 0)', example: 0 },
          },
        },

        ErrorResponse: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Error description' },
          },
        },

        LogQueryResult: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: '전체 건수', example: 150 },
            page: { type: 'integer', description: '현재 페이지', example: 1 },
            pageSize: { type: 'integer', description: '페이지 크기', example: 50 },
            totalPages: { type: 'integer', description: '전체 페이지 수', example: 3 },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/InterfaceLog' },
            },
          },
        },
      },
    },

    /* ═══════════════════════════════════════════
     *  Paths — API 엔드포인트 정의
     * ═══════════════════════════════════════════ */
    paths: {
      /* ────────── AMR ────────── */
      '/amrs': {
        get: {
          tags: ['AMR'],
          summary: '전체 AMR 목록 조회',
          responses: {
            200: {
              description: 'AMR 목록',
              content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Amr' } } } },
            },
          },
        },
        post: {
          tags: ['AMR'],
          summary: 'AMR 등록',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AmrCreate' } } },
          },
          responses: {
            201: {
              description: '생성된 AMR',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Amr' } } },
            },
          },
        },
      },
      '/amrs/{id}': {
        get: {
          tags: ['AMR'],
          summary: '특정 AMR 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'AMR ID' }],
          responses: {
            200: { description: 'AMR 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/Amr' } } } },
            404: { description: 'AMR을 찾을 수 없음' },
          },
        },
        put: {
          tags: ['AMR'],
          summary: 'AMR 정보 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'AMR ID' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AmrCreate' } } },
          },
          responses: {
            200: { description: '수정된 AMR', content: { 'application/json': { schema: { $ref: '#/components/schemas/Amr' } } } },
            404: { description: 'AMR을 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['AMR'],
          summary: 'AMR 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'AMR ID' }],
          responses: {
            200: { description: '삭제 완료', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            404: { description: 'AMR을 찾을 수 없음' },
          },
        },
      },
      '/amrs/monitor/status': {
        get: {
          tags: ['AMR'],
          summary: '전체 AMR 모니터링 상태 조회',
          description: '모든 AMR의 연결 상태, 위치, 배터리 등 실시간 모니터링 정보를 반환합니다.',
          responses: {
            200: {
              description: '모니터링 상태 목록',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        amr_id: { type: 'integer' },
                        amr_name: { type: 'string' },
                        ip: { type: 'string' },
                        status: { type: 'string' },
                        connected: { type: 'boolean', description: 'TCP 소켓 연결 여부' },
                        last_received: { type: 'string', format: 'date-time', nullable: true },
                        battery: { type: 'number' },
                        pos_x: { type: 'number' },
                        pos_y: { type: 'number' },
                        deg: { type: 'number' },
                        current_station_id: { type: 'string' },
                        dest_station_id: { type: 'string' },
                        error_code: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/amrs/monitor/reconnect': {
        post: {
          tags: ['AMR'],
          summary: '특정 AMR 재연결',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amr_name'],
                  properties: {
                    amr_name: { type: 'string', description: 'AMR 이름', example: 'M500-1' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: '재연결 시도 완료', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            400: { description: 'amr_name 누락' },
          },
        },
      },
      '/amrs/{id}/navigate': {
        post: {
          tags: ['AMR'],
          summary: 'AMR에 이동 명령 전송',
          description: '특정 AMR에 TCP를 통해 내비게이션 명령을 직접 전송합니다.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'AMR ID' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['dest_station'],
                  properties: {
                    dest_station: { type: 'string', description: '목적지 스테이션 ID', example: 'LM1' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: '명령 전송 완료', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            400: { description: 'dest_station 누락 또는 IP 없음' },
            404: { description: 'AMR을 찾을 수 없음' },
          },
        },
      },

      /* ────────── Task ────────── */
      '/tasks': {
        get: {
          tags: ['Task'],
          summary: '전체 태스크 목록 조회',
          responses: {
            200: { description: '태스크 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } } },
          },
        },
        post: {
          tags: ['Task'],
          summary: '태스크 생성',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    amr_name: { type: 'string', example: 'M500-1' },
                    task_type: { type: 'string', example: 'MOVE' },
                    task_status: { type: 'string', example: 'RUNNING' },
                    param: { type: 'string', example: '{"station_id":"LM1"}' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: '생성된 태스크', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
          },
        },
      },
      '/tasks/{id}': {
        get: {
          tags: ['Task'],
          summary: '특정 태스크 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Task ID' }],
          responses: {
            200: { description: '태스크 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
            404: { description: '태스크를 찾을 수 없음' },
          },
        },
        put: {
          tags: ['Task'],
          summary: '태스크 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Task ID' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { task_status: { type: 'string' }, error_code: { type: 'string' } } } } },
          },
          responses: {
            200: { description: '수정된 태스크', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } },
            404: { description: '태스크를 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['Task'],
          summary: '태스크 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'Task ID' }],
          responses: {
            200: { description: '삭제 완료' },
            404: { description: '태스크를 찾을 수 없음' },
          },
        },
      },

      /* ────────── Map ────────── */
      '/maps': {
        get: {
          tags: ['Map'],
          summary: '전체 맵 목록 조회',
          responses: {
            200: { description: '맵 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Map' } } } } },
          },
        },
        post: {
          tags: ['Map'],
          summary: '맵 생성',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: '1F_Main' },
                    stations: { type: 'string' },
                    paths: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: '생성된 맵', content: { 'application/json': { schema: { $ref: '#/components/schemas/Map' } } } },
          },
        },
      },
      '/maps/current': {
        get: {
          tags: ['Map'],
          summary: '현재 사용 중인 맵 조회',
          responses: {
            200: { description: '현재 맵', content: { 'application/json': { schema: { $ref: '#/components/schemas/Map' } } } },
            404: { description: '설정된 현재 맵 없음' },
          },
        },
      },
      '/maps/{id}': {
        get: {
          tags: ['Map'],
          summary: '특정 맵 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: '맵 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/Map' } } } },
            404: { description: '맵을 찾을 수 없음' },
          },
        },
        put: {
          tags: ['Map'],
          summary: '맵 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, stations: { type: 'string' }, paths: { type: 'string' } } } } },
          },
          responses: {
            200: { description: '수정된 맵', content: { 'application/json': { schema: { $ref: '#/components/schemas/Map' } } } },
            404: { description: '맵을 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['Map'],
          summary: '맵 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: '삭제 완료' },
            404: { description: '맵을 찾을 수 없음' },
          },
        },
      },
      '/maps/{id}/set-current': {
        put: {
          tags: ['Map'],
          summary: '현재 맵 설정',
          description: '지정된 맵을 현재 사용 맵으로 설정합니다. 기존 현재 맵은 해제됩니다.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: '현재 맵 변경 완료', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, map: { $ref: '#/components/schemas/Map' } } } } } },
            404: { description: '맵을 찾을 수 없음' },
          },
        },
      },
      '/maps/import': {
        post: {
          tags: ['Map'],
          summary: '맵 파일 업로드 (JSON/SMAP)',
          description: 'JSON 또는 SMAP 형식의 맵 파일을 업로드하여 DB에 저장합니다.',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['mapFile'],
                  properties: {
                    mapFile: { type: 'string', format: 'binary', description: '.smap 또는 .json 맵 파일' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: '업로드 성공',
              content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Map' } } } } },
            },
            400: { description: '파일 누락 또는 파싱 실패' },
          },
        },
      },
      '/maps/amr-maps': {
        get: {
          tags: ['Map'],
          summary: 'AMR에서 맵 목록 조회 (TCP)',
          description: 'AMR에 TCP (port 19240, API 0x0514)로 저장된 맵 목록을 조회합니다.',
          parameters: [
            { name: 'ip', in: 'query', required: true, schema: { type: 'string' }, description: 'AMR IP 주소', example: '192.168.1.10' },
          ],
          responses: {
            200: {
              description: '맵 목록',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          current_map: { type: 'string', description: '현재 로드된 맵 이름', example: '1F_Main', nullable: true },
                          maps: { type: 'array', items: { type: 'string' }, description: 'AMR에 저장된 맵 이름 목록', example: ['1F_Main', '2F_Sub'] },
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { description: 'ip 파라미터 누락' },
            502: { description: 'AMR TCP 통신 실패' },
          },
        },
      },
      '/maps/amr-download': {
        post: {
          tags: ['Map'],
          summary: 'AMR에서 맵 다운로드 & DB 저장 (TCP)',
          description: 'AMR에 TCP (port 19207, API 0x0FAB)로 특정 맵을 다운로드하여 DB에 저장합니다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['ip', 'map_name'],
                  properties: {
                    ip: { type: 'string', description: 'AMR IP 주소', example: '192.168.1.10' },
                    map_name: { type: 'string', description: '다운로드할 맵 이름', example: '1F_Main' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: '다운로드 & 저장 성공',
              content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Map' } } } } },
            },
            400: { description: 'ip 또는 map_name 누락' },
            502: { description: 'AMR TCP 통신 실패 또는 맵 파싱 실패' },
          },
        },
      },

      /* ────────── Setting ────────── */
      '/settings': {
        get: {
          tags: ['Setting'],
          summary: '전체 설정 목록 조회',
          responses: {
            200: { description: '설정 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Setting' } } } } },
          },
        },
      },
      '/settings/{key}': {
        get: {
          tags: ['Setting'],
          summary: '특정 설정 조회',
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, description: '설정 키', example: 'mes_ip' }],
          responses: {
            200: { description: '설정 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/Setting' } } } },
            404: { description: '설정을 찾을 수 없음' },
          },
        },
        put: {
          tags: ['Setting'],
          summary: '설정 생성/수정 (Upsert)',
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, description: '설정 키' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    value: { type: 'string', description: '설정 값', example: '192.168.1.100' },
                    description: { type: 'string', description: '설명', example: 'MES 서버 IP 주소' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: '저장된 설정', content: { 'application/json': { schema: { $ref: '#/components/schemas/Setting' } } } },
          },
        },
        delete: {
          tags: ['Setting'],
          summary: '설정 삭제',
          parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: '삭제 완료' },
            404: { description: '설정을 찾을 수 없음' },
          },
        },
      },

      /* ────────── User ────────── */
      '/users': {
        get: {
          tags: ['User'],
          summary: '전체 사용자 목록 조회',
          responses: {
            200: { description: '사용자 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
          },
        },
        post: {
          tags: ['User'],
          summary: '사용자 생성',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'user1' },
                    password: { type: 'string', example: 'password123' },
                    role: { type: 'string', enum: ['admin', 'user'], example: 'user' },
                    name: { type: 'string', example: '홍길동' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: '생성된 사용자', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            409: { description: '이미 존재하는 username' },
          },
        },
      },
      '/users/{id}': {
        get: {
          tags: ['User'],
          summary: '특정 사용자 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: '사용자 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            404: { description: '사용자를 찾을 수 없음' },
          },
        },
        put: {
          tags: ['User'],
          summary: '사용자 정보 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { password: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' } } } } },
          },
          responses: {
            200: { description: '수정된 사용자', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            404: { description: '사용자를 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['User'],
          summary: '사용자 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: '삭제 완료' },
            404: { description: '사용자를 찾을 수 없음' },
          },
        },
      },
      '/users/login': {
        post: {
          tags: ['User'],
          summary: '로그인',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'password'],
                  properties: {
                    username: { type: 'string', example: 'admin' },
                    password: { type: 'string', example: 'admin' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '로그인 성공',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Login successful' },
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            400: { description: 'username/password 누락' },
            401: { description: '인증 실패' },
          },
        },
      },

      /* ────────── SimAmr ────────── */
      '/sim-amrs': {
        get: {
          tags: ['SimAmr'],
          summary: '전체 시뮬레이션 AMR 목록 조회',
          responses: {
            200: { description: 'SimAmr 목록', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/SimAmr' } } } } },
          },
        },
        post: {
          tags: ['SimAmr'],
          summary: '시뮬레이션 AMR 생성',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['amr_name'],
                  properties: {
                    amr_name: { type: 'string', example: 'SIM-1' },
                    ip: { type: 'string', example: '127.0.0.1' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: '생성된 SimAmr', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimAmr' } } } },
          },
        },
      },
      '/sim-amrs/{id}': {
        get: {
          tags: ['SimAmr'],
          summary: '특정 시뮬레이션 AMR 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'SimAmr 정보', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimAmr' } } } },
            404: { description: 'SimAmr을 찾을 수 없음' },
          },
        },
        put: {
          tags: ['SimAmr'],
          summary: '시뮬레이션 AMR 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { amr_name: { type: 'string' }, ip: { type: 'string' } } } } },
          },
          responses: {
            200: { description: '수정된 SimAmr', content: { 'application/json': { schema: { $ref: '#/components/schemas/SimAmr' } } } },
            404: { description: 'SimAmr을 찾을 수 없음' },
          },
        },
        delete: {
          tags: ['SimAmr'],
          summary: '시뮬레이션 AMR 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: '삭제 완료' },
            404: { description: 'SimAmr을 찾을 수 없음' },
          },
        },
      },

      /* ────────── Move Command (MES → ACS) ────────── */
      '/move_command': {
        post: {
          tags: ['MoveCommand'],
          summary: '이동 지시 (MES → ACS)',
          description:
            'MES에서 ACS로 AMR 이동 명령을 전송합니다.\n\n' +
            '- **EXECUTE**: 새 이동 태스크를 생성하고 AMR에 TCP 이동 명령을 전송합니다. 해당 AMR에 이미 RUNNING 태스크가 있으면 409를 반환합니다.\n' +
            '- **CANCEL**: 실행 중인 태스크를 취소합니다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MoveCommandRequest' },
                examples: {
                  execute: {
                    summary: 'EXECUTE 예시',
                    value: { task_id: 125, amr_name: 'M500-1', action: 'EXECUTE', station_id: 'LM1' },
                  },
                  cancel: {
                    summary: 'CANCEL 예시',
                    value: { task_id: 125, amr_name: 'M500-1', action: 'CANCEL' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '처리 성공',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } },
            },
            400: { description: '파라미터 오류 또는 AMR IP 없음', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
            404: { description: 'AMR 또는 태스크를 찾을 수 없음', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
            409: { description: '해당 AMR에 이미 활성 태스크가 존재', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
            500: { description: 'TCP 전송 실패 등 내부 오류', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
          },
        },
      },

      /* ────────── Arm Command (MES → ACS) ────────── */
      '/arm_command': {
        post: {
          tags: ['ArmCommand'],
          summary: '로봇 팔 명령 (MES → ACS)',
          description:
            'MES에서 ACS로 로봇 팔 동작 명령을 전송합니다.\n\n' +
            '- **EXECUTE**: 새 ARM 태스크를 생성하고 매니퓰레이터에 TCP 명령 + DO 트리거를 전송합니다. DI11(성공)/DI12(에러) 신호를 폴링하여 완료를 판별합니다.\n' +
            '- **CANCEL**: 실행 중인 ARM 태스크를 취소합니다.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArmCommandRequest' },
                examples: {
                  execute: {
                    summary: 'EXECUTE 예시',
                    value: {
                      task_id: 125,
                      amr_name: 'M500-1',
                      action: 'EXECUTE',
                      params: { from_location_id: 22, to_location_id: 61, vision_check: 1 },
                    },
                  },
                  cancel: {
                    summary: 'CANCEL 예시',
                    value: { task_id: 125, amr_name: 'M500-1', action: 'CANCEL' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '처리 성공',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } },
            },
            400: { description: '파라미터 오류 또는 AMR IP 없음', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
            404: { description: 'AMR 또는 태스크를 찾을 수 없음', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
            409: { description: '해당 AMR에 이미 활성 태스크가 존재', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
            500: { description: 'TCP 전송 실패 등 내부 오류', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
          },
        },
      },

      /* ────────── Log ────────── */
      '/logs': {
        get: {
          tags: ['Log'],
          summary: '인터페이스 로그 조회',
          description: '필터 및 페이지네이션을 사용하여 통신 로그를 조회합니다.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '페이지 번호' },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50 }, description: '페이지 크기 (최대 200)' },
            { name: 'log_type', in: 'query', schema: { type: 'string', enum: ['API', 'TCP'] }, description: '로그 유형' },
            {
              name: 'interface_id',
              in: 'query',
              schema: { type: 'string', enum: ['MONITORING', 'MOVE_COMMAND', 'ARM_COMMAND', 'TASK_RESULT', 'NAV_CMD', 'MANI_CMD', 'ROBOT_DO', 'ROBOT_DI', 'AMR_CONN', 'MES_CONN', 'MAP_LIST', 'MAP_DOWNLOAD'] },
              description: '인터페이스 식별자',
            },
            { name: 'interface_ids', in: 'query', schema: { type: 'string' }, description: '인터페이스 식별자 다중 필터 (콤마 구분, 예: AMR_CONN,MES_CONN)' },
            { name: 'exclude_interface', in: 'query', schema: { type: 'string' }, description: '제외할 인터페이스 식별자' },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['SUCCESS', 'ERROR'] }, description: '결과 상태' },
            { name: 'direction', in: 'query', schema: { type: 'string', enum: ['INBOUND', 'OUTBOUND'] }, description: '통신 방향' },
            { name: 'amr_name', in: 'query', schema: { type: 'string' }, description: 'AMR 이름 필터' },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, description: '시작 날짜 (ISO8601)' },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, description: '종료 날짜 (ISO8601)' },
            { name: 'keyword', in: 'query', schema: { type: 'string' }, description: '요청/응답/에러 내용 키워드 검색' },
          ],
          responses: {
            200: {
              description: '로그 조회 결과',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/LogQueryResult' } } },
            },
            500: { description: '조회 오류' },
          },
        },
      },

      /* ────────── MES 참조 API (ACS → MES) ────────── */
      '/monitoring (ACS → MES)': {
        post: {
          tags: ['MES (참조)'],
          summary: '[참조] AMR 상태 전송 (ACS → MES, 1Hz)',
          description:
            'ACS가 MES에 1초 주기로 전송하는 AMR 상태 데이터의 형식입니다.\n\n' +
            '**이 API는 ACS가 MES로 호출하는 것으로, ACS 서버에서 수신하는 API가 아닙니다.**\n' +
            '설정의 `mes_ip` 값을 사용하여 `POST http://<mes_ip>/api/monitoring` 으로 전송됩니다.',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MonitoringPayload' } } },
          },
          responses: {
            200: { description: 'MES 응답', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
          },
        },
      },
      '/task_result (ACS → MES)': {
        post: {
          tags: ['MES (참조)'],
          summary: '[참조] 태스크 결과 전송 (ACS → MES)',
          description:
            'ACS가 MES에 태스크 완료/에러 시 전송하는 결과 데이터의 형식입니다.\n\n' +
            '**이 API는 ACS가 MES로 호출하는 것으로, ACS 서버에서 수신하는 API가 아닙니다.**\n' +
            '설정의 `mes_ip` 값을 사용하여 `POST http://<mes_ip>/api/task_result` 으로 전송됩니다.',
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskResultPayload' } } },
          },
          responses: {
            200: { description: 'MES 응답', content: { 'application/json': { schema: { $ref: '#/components/schemas/CommandResponse' } } } },
          },
        },
      },
    },
  },
  apis: [], // paths를 직접 정의하므로 JSDoc 스캔 불필요
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
