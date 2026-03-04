import React, { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  Typography,
  Empty,
  Tabs,
  Tag,
  message,
  Descriptions,
  Alert,
  Divider,
  theme,
} from 'antd';
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Settings,
  User,
  Play,
  Send,
  XCircle,
  List,
  Terminal,
} from 'lucide-react';
import usePolling from '@/hooks/usePolling';
import { settingAPI, userAPI, amrAPI, mapAPI, taskAPI, moveCommandAPI, armCommandAPI } from '@/api';

const { Text } = Typography;

/* ────────────────────────────────────────────
 *  시스템 설정 탭
 * ──────────────────────────────────────────── */
function SystemSettingsTab() {
  const settingsQuery = usePolling(settingAPI.getAll, 10000);
  const settings = settingsQuery.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditingKey(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditingKey(record.key);
    form.setFieldsValue({
      key: record.key,
      value: record.value,
      description: record.description,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await settingAPI.upsert(values.key, values.value, values.description);
      message.success('설정이 저장되었습니다.');
      setModalOpen(false);
      settingsQuery.refetch();
    } catch (err) {
      if (err.errorFields) return;
      message.error('설정 저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (key) => {
    try {
      await settingAPI.delete(key);
      message.success('설정이 삭제되었습니다.');
      settingsQuery.refetch();
    } catch {
      message.error('설정 삭제에 실패했습니다.');
    }
  };

  const columns = [
    {
      title: '키',
      dataIndex: 'key',
      key: 'key',
      width: 200,
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: '값',
      dataIndex: 'value',
      key: 'value',
      ellipsis: true,
    },
    {
      title: '설명',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text) => <Text type="secondary">{text || '-'}</Text>,
    },
    {
      title: '최종 수정',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (text) => (text ? new Date(text).toLocaleString('ko-KR') : '-'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<Pencil size={14} />} onClick={() => openEdit(record)} />
          <Popconfirm
            title={`"${record.key}" 설정을 삭제하시겠습니까?`}
            onConfirm={() => handleDelete(record.key)}
            okText="삭제"
            cancelText="취소"
          >
            <Button size="small" danger icon={<Trash2 size={14} />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Text type="secondary">시스템 동작에 필요한 키-값 형태의 설정을 관리합니다.</Text>
        <Space>
          <Button size="small" icon={<RefreshCw size={14} />} onClick={settingsQuery.refetch}>
            새로고침
          </Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>
            설정 추가
          </Button>
        </Space>
      </div>

      <Table
        size="small"
        dataSource={settings}
        columns={columns}
        rowKey="key"
        pagination={false}
        loading={settingsQuery.loading && settings.length === 0}
        locale={{ emptyText: <Empty description="등록된 설정이 없습니다" /> }}
      />

      <Modal
        title={editingKey ? '설정 수정' : '설정 추가'}
        open={modalOpen}
        okText="저장"
        cancelText="취소"
        confirmLoading={submitting}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="key"
            label="키"
            rules={[{ required: true, message: '키를 입력하세요' }]}
          >
            <Input placeholder="예: mes_ip" disabled={!!editingKey} />
          </Form.Item>
          <Form.Item
            name="value"
            label="값"
            rules={[{ required: true, message: '값을 입력하세요' }]}
          >
            <Input placeholder="예: 192.168.1.10" />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input placeholder="이 설정의 용도를 설명하세요" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ────────────────────────────────────────────
 *  사용자 관리 탭
 * ──────────────────────────────────────────── */
function UserManagementTab() {
  const usersQuery = usePolling(userAPI.getAll, 10000);
  const users = usersQuery.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user' });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      username: record.username,
      name: record.name,
      role: record.role,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingId) {
        const payload = { ...values };
        if (!payload.password) delete payload.password;
        await userAPI.update(editingId, payload);
        message.success('사용자가 수정되었습니다.');
      } else {
        await userAPI.create(values);
        message.success('사용자가 추가되었습니다.');
      }
      setModalOpen(false);
      usersQuery.refetch();
    } catch (err) {
      if (err.errorFields) return;
      message.error('저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await userAPI.delete(id);
      message.success('사용자가 삭제되었습니다.');
      usersQuery.refetch();
    } catch {
      message.error('사용자 삭제에 실패했습니다.');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '아이디',
      dataIndex: 'username',
      key: 'username',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
      render: (text) => text || '-',
    },
    {
      title: '역할',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role) => (
        <Tag color={role === 'admin' ? 'blue' : 'default'}>
          {role === 'admin' ? '관리자' : '사용자'}
        </Tag>
      ),
    },
    {
      title: '생성일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text) => (text ? new Date(text).toLocaleString('ko-KR') : '-'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<Pencil size={14} />} onClick={() => openEdit(record)} />
          <Popconfirm
            title={`"${record.username}" 사용자를 삭제하시겠습니까?`}
            onConfirm={() => handleDelete(record.id)}
            okText="삭제"
            cancelText="취소"
            disabled={record.username === 'admin'}
          >
            <Button
              size="small"
              danger
              icon={<Trash2 size={14} />}
              disabled={record.username === 'admin'}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Text type="secondary">시스템 접속 계정을 관리합니다.</Text>
        <Space>
          <Button size="small" icon={<RefreshCw size={14} />} onClick={usersQuery.refetch}>
            새로고침
          </Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>
            사용자 추가
          </Button>
        </Space>
      </div>

      <Table
        size="small"
        dataSource={users}
        columns={columns}
        rowKey="id"
        pagination={false}
        loading={usersQuery.loading && users.length === 0}
        locale={{ emptyText: <Empty description="등록된 사용자가 없습니다" /> }}
      />

      <Modal
        title={editingId ? '사용자 수정' : '사용자 추가'}
        open={modalOpen}
        okText="저장"
        cancelText="취소"
        confirmLoading={submitting}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="아이디"
            rules={[{ required: true, message: '아이디를 입력하세요' }]}
          >
            <Input placeholder="아이디" disabled={!!editingId} />
          </Form.Item>
          <Form.Item
            name="password"
            label={editingId ? '비밀번호 (변경 시에만 입력)' : '비밀번호'}
            rules={
              editingId
                ? []
                : [{ required: true, message: '비밀번호를 입력하세요' }]
            }
          >
            <Input.Password placeholder="비밀번호" />
          </Form.Item>
          <Form.Item name="name" label="이름">
            <Input placeholder="표시될 이름" />
          </Form.Item>
          <Form.Item
            name="role"
            label="역할"
            rules={[{ required: true, message: '역할을 선택하세요' }]}
          >
            <Input placeholder="admin 또는 user" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ────────────────────────────────────────────
 *  이동 지시 테스트 탭 (MOVE_COMMAND)
 * ──────────────────────────────────────────── */

function safeParse(raw, fallback = {}) {
  if (raw == null) return fallback;
  try {
    let v = raw;
    if (typeof v === 'string') v = JSON.parse(v);
    if (typeof v === 'string') v = JSON.parse(v);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

const TASK_STATUS_COLOR = {
  RUNNING: 'processing',
  FINISHED: 'success',
  ERROR: 'error',
  CANCELLED: 'default',
  PENDING: 'warning',
};

function MoveCommandTestTab() {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [lastResp, setLastResp] = useState(null);

  // AMR 목록
  const amrsQuery = usePolling(amrAPI.monitorStatus, 5000);
  const amrs = amrsQuery.data ?? [];

  // 현재 맵의 스테이션 목록
  const [stations, setStations] = useState([]);
  const [stationsLoaded, setStationsLoaded] = useState(false);

  React.useEffect(() => {
    mapAPI
      .getCurrent()
      .then((res) => {
        const mapData = res.data;
        if (mapData) {
          const st = safeParse(mapData.stations).stations ?? [];
          setStations(st);
        }
        setStationsLoaded(true);
      })
      .catch(() => setStationsLoaded(true));
  }, []);

  // 태스크 목록
  const tasksQuery = usePolling(taskAPI.getAll, 3000);
  const tasks = tasksQuery.data ?? [];

  // AMR select 옵션
  const amrOptions = useMemo(
    () => amrs.map((a) => ({ label: `${a.amr_name} (${a.status})`, value: a.amr_name })),
    [amrs]
  );

  // Station select 옵션
  const stationOptions = useMemo(
    () =>
      stations.map((s) => ({
        label: s.name || s.instanceName || s.id,
        value: String(s.id ?? s.instanceName),
      })),
    [stations]
  );

  const handleSend = async () => {
    try {
      const values = await form.validateFields();
      setSending(true);
      setLastResp(null);

      const payload = {
        task_id: values.task_id,
        amr_name: values.amr_name,
        action: values.action,
        station_id: values.station_id,
      };

      const res = await moveCommandAPI.send(payload);
      setLastResp({ success: true, data: res.data });
      message.success(`응답: ${res.data.result_msg}`);
      tasksQuery.refetch();
    } catch (err) {
      const errData = err.response?.data;
      setLastResp({
        success: false,
        data: errData || { result_msg: err.message, server_time: new Date().toISOString() },
      });
      message.error(`실패: ${errData?.result_msg || err.message}`);
    } finally {
      setSending(false);
    }
  };

  // 자동 task_id 생성
  const generateTaskId = () => {
    form.setFieldsValue({ task_id: Date.now() % 1000000 });
  };

  const taskColumns = [
    {
      title: 'Task ID',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 90,
    },
    {
      title: 'AMR',
      dataIndex: 'amr_name',
      key: 'amr_name',
      width: 120,
    },
    {
      title: '타입',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 80,
      render: (t) => <Tag>{t || '-'}</Tag>,
    },
    {
      title: '상태',
      dataIndex: 'task_status',
      key: 'task_status',
      width: 100,
      render: (s) => <Tag color={TASK_STATUS_COLOR[s] || 'default'}>{s}</Tag>,
    },
    {
      title: '파라미터',
      dataIndex: 'param',
      key: 'param',
      ellipsis: true,
      render: (p) => {
        if (!p) return '-';
        try {
          const obj = JSON.parse(p);
          return obj.station_id || p;
        } catch {
          return p;
        }
      },
    },
    {
      title: '에러',
      dataIndex: 'error_code',
      key: 'error_code',
      width: 100,
      render: (e) => (e ? <Text type="danger">{e}</Text> : '-'),
    },
    {
      title: '업데이트',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (t) => (t ? new Date(t).toLocaleString('ko-KR') : '-'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 설명 */}
      <Alert
        type="info"
        showIcon
        message="이동 지시 테스트 (MOVE_COMMAND)"
        description="MES에서 ACS로 보내는 이동 지시 API를 시뮬레이션합니다. EXECUTE로 태스크를 생성하고, CANCEL로 취소할 수 있습니다."
      />

      {/* 폼 */}
      <Card
        size="small"
        title={
          <Space size={6}>
            <Send size={15} />
            요청 전송
          </Space>
        }
      >
        <Form
          form={form}
          layout="inline"
          style={{ flexWrap: 'wrap', gap: 8 }}
          initialValues={{ action: 'EXECUTE' }}
        >
          <Form.Item
            name="task_id"
            label="Task ID"
            rules={[{ required: true, message: '필수' }]}
            style={{ minWidth: 160 }}
          >
            <InputNumber
              placeholder="125"
              style={{ width: '100%' }}
              addonAfter={
                <span style={{ cursor: 'pointer', fontSize: 11 }} onClick={generateTaskId}>
                  자동
                </span>
              }
            />
          </Form.Item>

          <Form.Item
            name="amr_name"
            label="AMR"
            rules={[{ required: true, message: '필수' }]}
            style={{ minWidth: 180 }}
          >
            <Select
              placeholder="AMR 선택"
              options={amrOptions}
              showSearch
              allowClear
              loading={amrsQuery.loading}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            name="action"
            label="Action"
            rules={[{ required: true, message: '필수' }]}
            style={{ minWidth: 140 }}
          >
            <Select
              options={[
                { label: 'EXECUTE', value: 'EXECUTE' },
                { label: 'CANCEL', value: 'CANCEL' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="station_id"
            label="목적지"
            style={{ minWidth: 180 }}
          >
            <Select
              placeholder="스테이션 선택"
              options={stationOptions}
              showSearch
              allowClear
              loading={!stationsLoaded}
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<Play size={14} />}
              onClick={handleSend}
              loading={sending}
            >
              전송
            </Button>
          </Form.Item>
        </Form>

        {/* 마지막 응답 */}
        {lastResp && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Descriptions
              size="small"
              column={3}
              bordered
              title={
                <Text type={lastResp.success ? 'success' : 'danger'} strong>
                  {lastResp.success ? '✅ 성공' : '❌ 실패'}
                </Text>
              }
            >
              <Descriptions.Item label="result_msg">
                {lastResp.data?.result_msg}
              </Descriptions.Item>
              <Descriptions.Item label="server_time">
                {lastResp.data?.server_time}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>

      {/* 태스크 목록 */}
      <Card
        size="small"
        title={
          <Space size={6}>
            <List size={15} />
            태스크 목록
          </Space>
        }
        extra={
          <Button size="small" icon={<RefreshCw size={14} />} onClick={tasksQuery.refetch}>
            새로고침
          </Button>
        }
      >
        <Table
          size="small"
          dataSource={tasks}
          columns={taskColumns}
          rowKey="task_id"
          pagination={{ pageSize: 10, size: 'small' }}
          loading={tasksQuery.loading && tasks.length === 0}
          locale={{ emptyText: <Empty description="태스크가 없습니다" /> }}
        />
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────
 *  로봇 팔 명령 테스트 탭 (ARM_COMMAND)
 * ──────────────────────────────────────────── */

function ArmCommandTestTab() {
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [lastResp, setLastResp] = useState(null);

  // AMR 목록
  const amrsQuery = usePolling(amrAPI.monitorStatus, 5000);
  const amrs = amrsQuery.data ?? [];

  // 태스크 목록
  const tasksQuery = usePolling(taskAPI.getAll, 3000);
  const tasks = tasksQuery.data ?? [];

  // AMR select 옵션
  const amrOptions = useMemo(
    () => amrs.map((a) => ({ label: `${a.amr_name} (${a.status})`, value: a.amr_name })),
    [amrs]
  );

  const handleSend = async () => {
    try {
      const values = await form.validateFields();
      setSending(true);
      setLastResp(null);

      const payload = {
        task_id: values.task_id,
        amr_name: values.amr_name,
        action: values.action,
        params: {
          from_location_id: values.from_location_id,
          to_location_id: values.to_location_id,
          vision_check: values.vision_check ?? 0,
        },
      };

      // CANCEL은 task_id만 필요
      if (values.action === 'CANCEL') {
        delete payload.params;
        delete payload.amr_name;
      }

      const res = await armCommandAPI.send(payload);
      setLastResp({ success: true, data: res.data });
      message.success(`응답: ${res.data.result_msg}`);
      tasksQuery.refetch();
    } catch (err) {
      const errData = err.response?.data;
      setLastResp({
        success: false,
        data: errData || { result_msg: err.message, server_time: new Date().toISOString() },
      });
      message.error(`실패: ${errData?.result_msg || err.message}`);
    } finally {
      setSending(false);
    }
  };

  // 자동 task_id 생성
  const generateTaskId = () => {
    form.setFieldsValue({ task_id: Date.now() % 1000000 });
  };

  // action 변경 시 폼 동작
  const actionValue = Form.useWatch('action', form);

  const armTaskColumns = [
    {
      title: 'Task ID',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 90,
    },
    {
      title: 'AMR',
      dataIndex: 'amr_name',
      key: 'amr_name',
      width: 120,
    },
    {
      title: '타입',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 80,
      render: (t) => <Tag color={t === 'ARM' ? 'purple' : undefined}>{t || '-'}</Tag>,
    },
    {
      title: '상태',
      dataIndex: 'task_status',
      key: 'task_status',
      width: 100,
      render: (s) => <Tag color={TASK_STATUS_COLOR[s] || 'default'}>{s}</Tag>,
    },
    {
      title: '파라미터',
      dataIndex: 'param',
      key: 'param',
      ellipsis: true,
      render: (p) => {
        if (!p) return '-';
        try {
          const obj = JSON.parse(p);
          if (obj.from_location_id != null) {
            return `FROM:${obj.from_location_id} → TO:${obj.to_location_id} (vision:${obj.vision_check ?? '-'})`;
          }
          return obj.station_id || p;
        } catch {
          return p;
        }
      },
    },
    {
      title: '에러',
      dataIndex: 'error_code',
      key: 'error_code',
      width: 120,
      render: (e) => (e ? <Text type="danger">{e}</Text> : '-'),
    },
    {
      title: '업데이트',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (t) => (t ? new Date(t).toLocaleString('ko-KR') : '-'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 설명 */}
      <Alert
        type="info"
        showIcon
        message="로봇 팔 명령 테스트 (ARM_COMMAND)"
        description="MES에서 ACS로 보내는 로봇 팔 명령 API를 시뮬레이션합니다. EXECUTE로 팔 작업을 시작하고, CANCEL로 취소할 수 있습니다. 완료 시 DI11 신호를 기다려 FINISHED 처리됩니다."
      />

      {/* 폼 */}
      <Card
        size="small"
        title={
          <Space size={6}>
            <Terminal size={15} />
            요청 전송
          </Space>
        }
      >
        <Form
          form={form}
          layout="inline"
          style={{ flexWrap: 'wrap', gap: 8 }}
          initialValues={{ action: 'EXECUTE', vision_check: 1 }}
        >
          <Form.Item
            name="task_id"
            label="Task ID"
            rules={[{ required: true, message: '필수' }]}
            style={{ minWidth: 160 }}
          >
            <InputNumber
              placeholder="125"
              style={{ width: '100%' }}
              addonAfter={
                <span style={{ cursor: 'pointer', fontSize: 11 }} onClick={generateTaskId}>
                  자동
                </span>
              }
            />
          </Form.Item>

          <Form.Item
            name="amr_name"
            label="AMR"
            rules={actionValue !== 'CANCEL' ? [{ required: true, message: '필수' }] : []}
            style={{ minWidth: 180 }}
          >
            <Select
              placeholder="AMR 선택"
              options={amrOptions}
              showSearch
              allowClear
              loading={amrsQuery.loading}
              optionFilterProp="label"
              disabled={actionValue === 'CANCEL'}
            />
          </Form.Item>

          <Form.Item
            name="action"
            label="Action"
            rules={[{ required: true, message: '필수' }]}
            style={{ minWidth: 140 }}
          >
            <Select
              options={[
                { label: 'EXECUTE', value: 'EXECUTE' },
                { label: 'CANCEL', value: 'CANCEL' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="from_location_id"
            label="From"
            rules={actionValue !== 'CANCEL' ? [{ required: true, message: '필수' }] : []}
            style={{ minWidth: 120 }}
          >
            <InputNumber
              placeholder="22"
              style={{ width: '100%' }}
              disabled={actionValue === 'CANCEL'}
            />
          </Form.Item>

          <Form.Item
            name="to_location_id"
            label="To"
            rules={actionValue !== 'CANCEL' ? [{ required: true, message: '필수' }] : []}
            style={{ minWidth: 120 }}
          >
            <InputNumber
              placeholder="61"
              style={{ width: '100%' }}
              disabled={actionValue === 'CANCEL'}
            />
          </Form.Item>

          <Form.Item
            name="vision_check"
            label="Vision"
            style={{ minWidth: 100 }}
          >
            <Select
              options={[
                { label: '사용 (1)', value: 1 },
                { label: '미사용 (0)', value: 0 },
              ]}
              disabled={actionValue === 'CANCEL'}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<Play size={14} />}
              onClick={handleSend}
              loading={sending}
            >
              전송
            </Button>
          </Form.Item>
        </Form>

        {/* 마지막 응답 */}
        {lastResp && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Descriptions
              size="small"
              column={3}
              bordered
              title={
                <Text type={lastResp.success ? 'success' : 'danger'} strong>
                  {lastResp.success ? '✅ 성공' : '❌ 실패'}
                </Text>
              }
            >
              <Descriptions.Item label="result_msg">
                {lastResp.data?.result_msg}
              </Descriptions.Item>
              <Descriptions.Item label="server_time">
                {lastResp.data?.server_time}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>

      {/* 태스크 목록 */}
      <Card
        size="small"
        title={
          <Space size={6}>
            <List size={15} />
            태스크 목록
          </Space>
        }
        extra={
          <Button size="small" icon={<RefreshCw size={14} />} onClick={tasksQuery.refetch}>
            새로고침
          </Button>
        }
      >
        <Table
          size="small"
          dataSource={tasks}
          columns={armTaskColumns}
          rowKey="task_id"
          pagination={{ pageSize: 10, size: 'small' }}
          loading={tasksQuery.loading && tasks.length === 0}
          locale={{ emptyText: <Empty description="태스크가 없습니다" /> }}
        />
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────
 *  설정 페이지 (탭 통합)
 * ──────────────────────────────────────────── */
export default function SettingsPage() {
  const tabItems = [
    {
      key: 'system',
      label: (
        <Space size={6}>
          <Settings size={15} />
          시스템 설정
        </Space>
      ),
      children: <SystemSettingsTab />,
    },
    {
      key: 'users',
      label: (
        <Space size={6}>
          <User size={15} />
          사용자 관리
        </Space>
      ),
      children: <UserManagementTab />,
    },
    {
      key: 'moveCommand',
      label: (
        <Space size={6}>
          <Terminal size={15} />
          이동 지시 테스트
        </Space>
      ),
      children: <MoveCommandTestTab />,
    },
    {
      key: 'armCommand',
      label: (
        <Space size={6}>
          <Terminal size={15} />
          로봇 팔 테스트
        </Space>
      ),
      children: <ArmCommandTestTab />,
    },
  ];

  return (
    <Card size="small">
      <Tabs items={tabItems} defaultActiveKey="system" />
    </Card>
  );
}
