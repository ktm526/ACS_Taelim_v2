import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Select,
  DatePicker,
  Input,
  Button,
  Space,
  Tabs,
  Typography,
  Descriptions,
  Empty,
  theme,
} from 'antd';
import {
  RefreshCw,
  Search,
  FilterX,
  ArrowUpRight,
  ArrowDownLeft,
  Radio,
  ScrollText,
  Link2,
} from 'lucide-react';
import dayjs from 'dayjs';
import { logAPI } from '@/api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ── 상수 ──

const INTERFACE_OPTIONS_MAIN = [
  { label: '이동 명령 (MOVE_COMMAND)', value: 'MOVE_COMMAND' },
  { label: '로봇 팔 명령 (ARM_COMMAND)', value: 'ARM_COMMAND' },
  { label: '태스크 결과 (TASK_RESULT)', value: 'TASK_RESULT' },
  { label: 'NAV TCP 명령', value: 'NAV_CMD' },
  { label: 'MANI TCP 명령', value: 'MANI_CMD' },
  { label: 'DO 설정', value: 'ROBOT_DO' },
  { label: 'DI 설정', value: 'ROBOT_DI' },
  { label: '맵 목록 조회', value: 'MAP_LIST' },
  { label: '맵 다운로드', value: 'MAP_DOWNLOAD' },
];

const INTERFACE_OPTIONS_CONN = [
  { label: 'AMR 연결', value: 'AMR_CONN' },
  { label: 'MES 연결', value: 'MES_CONN' },
];

const INTERFACE_COLOR = {
  AMR_CONN: 'lime',
  MES_CONN: 'gold',
};

const LOG_TYPE_OPTIONS = [
  { label: 'API', value: 'API' },
  { label: 'TCP', value: 'TCP' },
];

const STATUS_OPTIONS = [
  { label: '성공', value: 'SUCCESS' },
  { label: '에러', value: 'ERROR' },
];

const DIRECTION_OPTIONS = [
  { label: '수신 (INBOUND)', value: 'INBOUND' },
  { label: '발신 (OUTBOUND)', value: 'OUTBOUND' },
];

function tryParseJson(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function getConnectionMeta(record) {
  const request = tryParseJson(record.request_data);
  const isObject = request && typeof request === 'object' && !Array.isArray(request);

  return {
    event: isObject ? request.event || null : null,
    reason: isObject ? request.reason || record.error_message || null : record.error_message || null,
  };
}

const CONN_EVENT_LABEL = {
  CONNECT_ATTEMPT: '연결 시도',
  RECONNECT_ATTEMPT: '재연결 시도',
  CONNECTED: '연결 성공',
  DISCONNECTED: '연결 끊김',
};

const CONN_EVENT_COLOR = {
  CONNECT_ATTEMPT: 'processing',
  RECONNECT_ATTEMPT: 'cyan',
  CONNECTED: 'success',
  DISCONNECTED: 'error',
};

function JsonBlock({ data, maxLen = 2000 }) {
  if (!data) return <Text type="secondary">-</Text>;
  const parsed = typeof data === 'string' ? tryParseJson(data) : data;
  const text = typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed);
  const truncated = text.length > maxLen ? text.slice(0, maxLen) + '\n...' : text;
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        maxHeight: 260,
        overflow: 'auto',
        background: '#fafafa',
        border: '1px solid #f0f0f0',
        padding: 8,
        borderRadius: 4,
      }}
    >
      {truncated}
    </pre>
  );
}

/* ═══════════════════════════════════════════
 *  확장 행 렌더러 (모달 대체)
 * ═══════════════════════════════════════════ */
/* ── 확장 행 강조 스타일 ── */
const EXPANDED_STYLE_ID = 'log-expanded-row-style';
if (typeof document !== 'undefined' && !document.getElementById(EXPANDED_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = EXPANDED_STYLE_ID;
  style.textContent = `
    .log-table .ant-table-row.expanded-highlight > td {
      background: #e6f4ff !important;
    }
    .log-table .ant-table-expanded-row > td {
      background: #f0f5ff !important;
    }
  `;
  document.head.appendChild(style);
}

function ExpandedLogRow({ record }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <Descriptions column={3} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="시각">
          {dayjs(record.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}
        </Descriptions.Item>
        <Descriptions.Item label="유형">{record.log_type}</Descriptions.Item>
        <Descriptions.Item label="방향">
          {record.direction === 'INBOUND' ? '수신 (INBOUND)' : '발신 (OUTBOUND)'}
        </Descriptions.Item>
        <Descriptions.Item label="인터페이스">
          <Tag>{record.interface_id}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="상태">
          <Tag color={record.status === 'SUCCESS' ? 'success' : 'error'}>
            {record.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="대상">{record.target || '-'}</Descriptions.Item>
        <Descriptions.Item label="AMR">{record.amr_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Task ID">{record.task_id ?? '-'}</Descriptions.Item>
        {record.error_message ? (
          <Descriptions.Item label="에러 메시지">
            <Text type="danger">{record.error_message}</Text>
          </Descriptions.Item>
        ) : (
          <Descriptions.Item label="에러 메시지">-</Descriptions.Item>
        )}
      </Descriptions>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            요청 데이터
          </Text>
          <JsonBlock data={record.request_data} />
        </div>
        <div style={{ flex: 1 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            응답 데이터
          </Text>
          <JsonBlock data={record.response_data} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
 *  공용 테이블 컬럼 빌더
 * ═══════════════════════════════════════════ */
function buildLogColumns(token, showInterface = true) {
  const cols = [
    {
      title: '시각',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (t) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '유형',
      dataIndex: 'log_type',
      key: 'log_type',
      width: 70,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: '방향',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (v) =>
        v === 'INBOUND' ? (
          <Space size={4}>
            <ArrowDownLeft size={13} color={token.colorSuccess} />
            <Text style={{ fontSize: 12 }}>수신</Text>
          </Space>
        ) : (
          <Space size={4}>
            <ArrowUpRight size={13} color={token.colorPrimary} />
            <Text style={{ fontSize: 12 }}>발신</Text>
          </Space>
        ),
    },
  ];

  if (showInterface) {
    cols.push({
      title: '인터페이스',
      dataIndex: 'interface_id',
      key: 'interface_id',
      width: 140,
      render: (v) => <Tag color="blue">{v}</Tag>,
    });
  }

  cols.push(
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v) => (
        <Tag color={v === 'SUCCESS' ? 'success' : 'error'}>{v === 'SUCCESS' ? '성공' : '에러'}</Tag>
      ),
    },
    {
      title: '대상',
      dataIndex: 'target',
      key: 'target',
      width: 170,
      ellipsis: true,
      render: (v) => <Text style={{ fontSize: 12 }} copyable={v ? { text: v } : undefined}>{v || '-'}</Text>,
    },
    {
      title: 'AMR',
      dataIndex: 'amr_name',
      key: 'amr_name',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: 'Task',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 70,
      render: (v) => (v != null && v !== 0 ? v : '-'),
    },
    {
      title: '에러',
      dataIndex: 'error_message',
      key: 'error_message',
      width: 180,
      ellipsis: true,
      render: (v) => (v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '-'),
    },
  );

  return cols;
}

/* ═══════════════════════════════════════════
 *  통신 로그 탭 (MONITORING 제외)
 * ═══════════════════════════════════════════ */
function MainLogTab({ token }) {
  const [filters, setFilters] = useState({
    log_type: undefined,
    interface_ids: [],
    status: undefined,
    direction: undefined,
    amr_name: '',
    keyword: '',
    dateRange: null,
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 30 });
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  const columns = buildLogColumns(token, true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        exclude_interface: 'MONITORING,AMR_CONN,MES_CONN',
      };
      if (filters.log_type) params.log_type = filters.log_type;
      if (filters.interface_ids && filters.interface_ids.length > 0) {
        params.interface_ids = filters.interface_ids.join(',');
      }
      if (filters.status) params.status = filters.status;
      if (filters.direction) params.direction = filters.direction;
      if (filters.amr_name) params.amr_name = filters.amr_name;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.dateRange && filters.dateRange[0]) {
        params.from = filters.dateRange[0].toISOString();
      }
      if (filters.dateRange && filters.dateRange[1]) {
        params.to = filters.dateRange[1].toISOString();
      }

      const res = await logAPI.query(params);
      const result = res.data ?? res;
      setLogs(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('로그 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleReset = () => {
    setFilters({
      log_type: undefined,
      interface_ids: [],
      status: undefined,
      direction: undefined,
      amr_name: '',
      keyword: '',
      dateRange: null,
    });
    setPagination({ page: 1, pageSize: 30 });
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <Select
          placeholder="유형"
          options={LOG_TYPE_OPTIONS}
          value={filters.log_type}
          onChange={(v) => handleFilterChange('log_type', v)}
          allowClear
          style={{ width: 100 }}
          size="small"
        />
        <Select
          mode="multiple"
          placeholder="인터페이스"
          options={INTERFACE_OPTIONS_MAIN}
          value={filters.interface_ids}
          onChange={(v) => handleFilterChange('interface_ids', v)}
          allowClear
          maxTagCount="responsive"
          style={{ minWidth: 200, maxWidth: 400 }}
          size="small"
        />
        <Select
          placeholder="방향"
          options={DIRECTION_OPTIONS}
          value={filters.direction}
          onChange={(v) => handleFilterChange('direction', v)}
          allowClear
          style={{ width: 140 }}
          size="small"
        />
        <Select
          placeholder="상태"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(v) => handleFilterChange('status', v)}
          allowClear
          style={{ width: 100 }}
          size="small"
        />
        <Input
          placeholder="AMR 이름"
          value={filters.amr_name}
          onChange={(e) => handleFilterChange('amr_name', e.target.value)}
          style={{ width: 120 }}
          size="small"
          allowClear
        />
        <RangePicker
          showTime={{ format: 'HH:mm' }}
          format="YYYY-MM-DD HH:mm"
          value={filters.dateRange}
          onChange={(v) => handleFilterChange('dateRange', v)}
          size="small"
          style={{ width: 300 }}
        />
        <Input
          placeholder="키워드 검색"
          value={filters.keyword}
          onChange={(e) => handleFilterChange('keyword', e.target.value)}
          onPressEnter={fetchLogs}
          prefix={<Search size={13} />}
          style={{ width: 160 }}
          size="small"
          allowClear
        />
        <Button size="small" icon={<FilterX size={13} />} onClick={handleReset}>
          초기화
        </Button>
        <Button size="small" type="primary" icon={<RefreshCw size={13} />} onClick={fetchLogs} loading={loading}>
          조회
        </Button>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
          총 {total}건
        </Text>
      </div>

      <Table
        className="log-table"
        size="small"
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        locale={{ emptyText: <Empty description="로그가 없습니다" /> }}
        expandable={{
          expandedRowRender: (record) => <ExpandedLogRow record={record} />,
          expandRowByClick: true,
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
        }}
        rowClassName={(record) => (expandedKeys.includes(record.id) ? 'expanded-highlight' : '')}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '30', '50', '100'],
          size: 'small',
          showTotal: (t, range) => `${range[0]}-${range[1]} / ${t}건`,
          onChange: (page, pageSize) => setPagination({ page, pageSize }),
        }}
      />
    </>
  );
}

/* ═══════════════════════════════════════════
 *  모니터링 로그 탭 (MONITORING 전용)
 * ═══════════════════════════════════════════ */
function MonitoringLogTab({ token }) {
  const [filters, setFilters] = useState({
    status: undefined,
    dateRange: null,
    keyword: '',
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 30 });
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  const columns = buildLogColumns(token, false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        interface_id: 'MONITORING',
      };
      if (filters.status) params.status = filters.status;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.dateRange && filters.dateRange[0]) {
        params.from = filters.dateRange[0].toISOString();
      }
      if (filters.dateRange && filters.dateRange[1]) {
        params.to = filters.dateRange[1].toISOString();
      }

      const res = await logAPI.query(params);
      const result = res.data ?? res;
      setLogs(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('모니터링 로그 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleReset = () => {
    setFilters({ status: undefined, dateRange: null, keyword: '' });
    setPagination({ page: 1, pageSize: 30 });
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <Select
          placeholder="상태"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(v) => handleFilterChange('status', v)}
          allowClear
          style={{ width: 100 }}
          size="small"
        />
        <RangePicker
          showTime={{ format: 'HH:mm' }}
          format="YYYY-MM-DD HH:mm"
          value={filters.dateRange}
          onChange={(v) => handleFilterChange('dateRange', v)}
          size="small"
          style={{ width: 300 }}
        />
        <Input
          placeholder="키워드 검색"
          value={filters.keyword}
          onChange={(e) => handleFilterChange('keyword', e.target.value)}
          onPressEnter={fetchLogs}
          prefix={<Search size={13} />}
          style={{ width: 160 }}
          size="small"
          allowClear
        />
        <Button size="small" icon={<FilterX size={13} />} onClick={handleReset}>
          초기화
        </Button>
        <Button size="small" type="primary" icon={<RefreshCw size={13} />} onClick={fetchLogs} loading={loading}>
          조회
        </Button>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
          총 {total}건
        </Text>
      </div>

      <Table
        className="log-table"
        size="small"
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1000 }}
        locale={{ emptyText: <Empty description="모니터링 로그가 없습니다" /> }}
        expandable={{
          expandedRowRender: (record) => <ExpandedLogRow record={record} />,
          expandRowByClick: true,
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
        }}
        rowClassName={(record) => (expandedKeys.includes(record.id) ? 'expanded-highlight' : '')}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '30', '50', '100'],
          size: 'small',
          showTotal: (t, range) => `${range[0]}-${range[1]} / ${t}건`,
          onChange: (page, pageSize) => setPagination({ page, pageSize }),
        }}
      />
    </>
  );
}

/* ═══════════════════════════════════════════
 *  연결 상태 로그 탭 (AMR_CONN, MES_CONN)
 * ═══════════════════════════════════════════ */

const CONN_INTERFACE_LABEL = {
  AMR_CONN: 'AMR',
  MES_CONN: 'MES',
};

function ConnectionLogTab({ token }) {
  const [filters, setFilters] = useState({
    interface_id: undefined,
    status: undefined,
    amr_name: '',
    dateRange: null,
    keyword: '',
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 30 });
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  const columns = [
    {
      title: '시각',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (t) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '유형',
      dataIndex: 'interface_id',
      key: 'type',
      width: 80,
      render: (v) => {
        const label = CONN_INTERFACE_LABEL[v] || v;
        return <Tag color={v === 'AMR_CONN' ? 'blue' : 'orange'}>{label}</Tag>;
      },
    },
    {
      title: '인터페이스',
      dataIndex: 'interface_id',
      key: 'interface_id',
      width: 120,
      render: (v) => <Tag color={INTERFACE_COLOR[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '이벤트',
      key: 'event',
      width: 120,
      render: (_, record) => {
        const { event } = getConnectionMeta(record);
        const label = CONN_EVENT_LABEL[event] || record.status;
        const color =
          CONN_EVENT_COLOR[event] || (record.status === 'SUCCESS' ? 'success' : 'error');
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '이름',
      dataIndex: 'amr_name',
      key: 'amr_name',
      width: 120,
      render: (v, record) => v || (record.interface_id === 'MES_CONN' ? 'MES' : '-'),
    },
    {
      title: 'IP',
      dataIndex: 'target',
      key: 'target',
      width: 170,
      render: (v) => (
        <Text style={{ fontSize: 12, fontFamily: 'monospace' }} copyable={v ? { text: v } : undefined}>
          {v || '-'}
        </Text>
      ),
    },
    {
      title: '사유',
      key: 'reason',
      ellipsis: true,
      render: (_, record) => {
        const { reason } = getConnectionMeta(record);
        return reason ? <Text style={{ fontSize: 12 }}>{reason}</Text> : '-';
      },
    },
  ];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        interface_ids: 'AMR_CONN,MES_CONN',
      };
      if (filters.interface_id) params.interface_id = filters.interface_id;
      if (filters.status) params.status = filters.status;
      if (filters.amr_name) params.amr_name = filters.amr_name;
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.dateRange && filters.dateRange[0]) {
        params.from = filters.dateRange[0].toISOString();
      }
      if (filters.dateRange && filters.dateRange[1]) {
        params.to = filters.dateRange[1].toISOString();
      }

      const res = await logAPI.query(params);
      const result = res.data ?? res;
      setLogs(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('연결 상태 로그 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleReset = () => {
    setFilters({
      interface_id: undefined,
      status: undefined,
      amr_name: '',
      dateRange: null,
      keyword: '',
    });
    setPagination({ page: 1, pageSize: 30 });
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <Select
          placeholder="유형"
          options={INTERFACE_OPTIONS_CONN}
          value={filters.interface_id}
          onChange={(v) => handleFilterChange('interface_id', v)}
          allowClear
          style={{ width: 140 }}
          size="small"
        />
        <Select
          placeholder="상태"
          options={[
            { label: '연결됨', value: 'SUCCESS' },
            { label: '연결 끊김', value: 'ERROR' },
          ]}
          value={filters.status}
          onChange={(v) => handleFilterChange('status', v)}
          allowClear
          style={{ width: 130 }}
          size="small"
        />
        <Input
          placeholder="이름"
          value={filters.amr_name}
          onChange={(e) => handleFilterChange('amr_name', e.target.value)}
          style={{ width: 120 }}
          size="small"
          allowClear
        />
        <Input
          placeholder="사유 검색"
          value={filters.keyword}
          onChange={(e) => handleFilterChange('keyword', e.target.value)}
          onPressEnter={fetchLogs}
          prefix={<Search size={13} />}
          style={{ width: 180 }}
          size="small"
          allowClear
        />
        <RangePicker
          showTime={{ format: 'HH:mm' }}
          format="YYYY-MM-DD HH:mm"
          value={filters.dateRange}
          onChange={(v) => handleFilterChange('dateRange', v)}
          size="small"
          style={{ width: 300 }}
        />
        <Button size="small" icon={<FilterX size={13} />} onClick={handleReset}>
          초기화
        </Button>
        <Button size="small" type="primary" icon={<RefreshCw size={13} />} onClick={fetchLogs} loading={loading}>
          조회
        </Button>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
          총 {total}건
        </Text>
      </div>

      <Table
        className="log-table"
        size="small"
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="연결 상태 로그가 없습니다" /> }}
        expandable={{
          expandedRowRender: (record) => <ExpandedLogRow record={record} />,
          expandRowByClick: true,
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
        }}
        rowClassName={(record) => (expandedKeys.includes(record.id) ? 'expanded-highlight' : '')}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '30', '50', '100'],
          size: 'small',
          showTotal: (t, range) => `${range[0]}-${range[1]} / ${t}건`,
          onChange: (page, pageSize) => setPagination({ page, pageSize }),
        }}
      />
    </>
  );
}

/* ═══════════════════════════════════════════
 *  메인 LogPage
 * ═══════════════════════════════════════════ */
export default function LogPage() {
  const { token } = theme.useToken();

  const tabItems = [
    {
      key: 'main',
      label: (
        <Space size={6}>
          <ScrollText size={14} />
          통신 로그
        </Space>
      ),
      children: <MainLogTab token={token} />,
    },
    {
      key: 'connection',
      label: (
        <Space size={6}>
          <Link2 size={14} />
          연결 상태
        </Space>
      ),
      children: <ConnectionLogTab token={token} />,
    },
    {
      key: 'monitoring',
      label: (
        <Space size={6}>
          <Radio size={14} />
          모니터링
        </Space>
      ),
      children: <MonitoringLogTab token={token} />,
    },
  ];

  return (
    <Card size="small">
      <Tabs items={tabItems} size="small" />
    </Card>
  );
}
