import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Card,
  Tag,
  Button,
  Typography,
  Space,
  Modal,
  Radio,
  Input,
  Form,
  Spin,
  Empty,
  Descriptions,
  Popconfirm,
  message,
  Tooltip,
  theme,
} from 'antd';
import {
  Bot,
  MapPin,
  Settings,
  Plus,
  Battery,
  WifiOff,
  AlertTriangle,
  Navigation,
  Trash2,
  Compass,
  Activity,
  Clock,
  Info,
  Crosshair,
  X,
} from 'lucide-react';
import MapCanvas from '@/components/MapCanvas';
import usePolling from '@/hooks/usePolling';
import { amrAPI, mapAPI, taskAPI } from '@/api';

const { Text } = Typography;

/* ── 공통 아이콘+텍스트 정렬 스타일 ── */
const iconTextRow = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

/* AMR 상태: ERROR | STOP | E-STOP | IDLE | MOVING | NO_CONN */
const statusColor = (s) => {
  const map = {
    IDLE: 'green',
    MOVING: 'blue',
    ERROR: 'red',
    STOP: 'orange',
    'E-STOP': 'magenta',
    NO_CONN: 'default',
  };
  return map[s] || 'default';
};

const statusLabel = (s) => {
  const map = {
    IDLE: '대기',
    MOVING: '이동',
    ERROR: '오류',
    STOP: '정지',
    'E-STOP': '비상정지',
    NO_CONN: '연결 끊김',
  };
  return map[s] || s;
};

/* 상태별 실제 색상 (추적 버튼 등에 사용) */
const statusHexColor = (s) => {
  const map = {
    IDLE: '#52c41a',
    MOVING: '#1677ff',
    ERROR: '#ff4d4f',
    STOP: '#fa8c16',
    'E-STOP': '#eb2f96',
    NO_CONN: '#8c8c8c',
  };
  return map[s] || '#8c8c8c';
};

/* 태스크 상태 색상 */
const taskStatusColor = (s) => {
  const map = {
    pending: 'default',
    PENDING: 'default',
    RUNNING: 'blue',
    running: 'blue',
    PAUSED: 'orange',
    DONE: 'green',
    done: 'green',
    FAILED: 'red',
    CANCELED: 'red',
  };
  return map[s] || 'default';
};

/* 상태 아이콘 */
const StatusIcon = ({ status, size = 14, style }) => {
  const s = { flexShrink: 0, ...style };
  if (status === 'NO_CONN') return <WifiOff size={size} style={s} />;
  if (status === 'E-STOP' || status === 'ERROR') return <AlertTriangle size={size} style={s} />;
  if (status === 'MOVING') return <Navigation size={size} style={s} />;
  return <Bot size={size} style={s} />;
};

/* 섹션 제목 컴포넌트 */
const SectionTitle = ({ icon, children, color }) => (
  <div style={{ ...iconTextRow, fontSize: 13, fontWeight: 600, color }}>
    {icon}
    <span>{children}</span>
  </div>
);

export default function DashboardPage() {
  const { token } = theme.useToken();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';
  const mapCanvasRef = useRef(null);

  // 폴링 데이터
  const amrsQuery = usePolling(amrAPI.getAll, 2000);
  const mapsQuery = usePolling(mapAPI.getAll, 10000);
  const tasksQuery = usePolling(taskAPI.getAll, 3000);

  const amrs = amrsQuery.data ?? [];
  const maps = mapsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];

  // 선택된 맵
  const [selectedMap, setSelectedMap] = useState(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [tempMapId, setTempMapId] = useState(null);

  // AMR 추가 모달
  const [addAmrOpen, setAddAmrOpen] = useState(false);
  const [addAmrForm] = Form.useForm();
  const [addAmrLoading, setAddAmrLoading] = useState(false);

  // AMR 상세 모달
  const [detailAmr, setDetailAmr] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Doosan 로봇 팔 상태
  const [armState, setArmState] = useState(null);
  const [armStateLoading, setArmStateLoading] = useState(false);

  // AMR 추적
  const [trackAmrName, setTrackAmrName] = useState(null);

  // 맵 자동 선택
  useEffect(() => {
    if (maps.length > 0 && !selectedMap) {
      const current = maps.find((m) => m.is_current);
      setSelectedMap(current || maps[0]);
    }
  }, [maps, selectedMap]);

  // 상세 모달의 AMR을 폴링 데이터와 동기화
  useEffect(() => {
    if (detailAmr && amrs.length > 0) {
      const updated = amrs.find((a) => a.amr_id === detailAmr.amr_id);
      if (updated) setDetailAmr(updated);
    }
  }, [amrs]);

  // Doosan 로봇 팔 상태 2초 폴링
  useEffect(() => {
    if (!detailOpen || !detailAmr?.amr_id) {
      setArmState(null);
      return;
    }

    let cancelled = false;
    const fetchArmState = async () => {
      setArmStateLoading(true);
      try {
        const res = await amrAPI.getArmState(detailAmr.amr_id);
        if (!cancelled) setArmState(res.data);
      } catch {
        if (!cancelled) setArmState(null);
      } finally {
        if (!cancelled) setArmStateLoading(false);
      }
    };

    fetchArmState();
    const interval = setInterval(fetchArmState, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [detailOpen, detailAmr?.amr_id]);

  // 해당 AMR에 연결된 태스크들
  const amrTasks = useMemo(() => {
    if (!detailAmr) return [];
    return tasks.filter((t) => t.amr_name === detailAmr.amr_name);
  }, [detailAmr, tasks]);

  // AMR 추가
  const handleAddAmr = async () => {
    try {
      const values = await addAmrForm.validateFields();
      setAddAmrLoading(true);
      await amrAPI.create({
        amr_name: values.amr_name,
        ip: values.ip,
        status: 'NO_CONN',
      });
      message.success(`AMR "${values.amr_name}" 이(가) 추가되었습니다.`);
      setAddAmrOpen(false);
      addAmrForm.resetFields();
      amrsQuery.refetch();
    } catch (err) {
      if (err.errorFields) return;
      message.error('AMR 추가에 실패했습니다.');
    } finally {
      setAddAmrLoading(false);
    }
  };

  // AMR 삭제
  const handleDeleteAmr = async () => {
    if (!detailAmr) return;
    setDeleteLoading(true);
    try {
      await amrAPI.delete(detailAmr.amr_id);
      message.success(`AMR "${detailAmr.amr_name}" 이(가) 삭제되었습니다.`);
      if (trackAmrName === detailAmr.amr_name) setTrackAmrName(null);
      setDetailOpen(false);
      setDetailAmr(null);
      amrsQuery.refetch();
    } catch {
      message.error('AMR 삭제에 실패했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // 타게팅 토글 (amr 객체를 직접 받음)
  const handleToggleTracking = (amr) => {
    if (!amr) return;
    setTrackAmrName((prev) => (prev === amr.amr_name ? null : amr.amr_name));
  };

  // AMR 이동 명령 (MapCanvas 우클릭 → 스테이션 → AMR 선택)
  const handleNavigate = async (amr, station) => {
    const stationId = station.name || station.id;
    try {
      await amrAPI.navigate(amr.amr_id, stationId);
      message.success(`${amr.amr_name} → ${stationId} 이동 명령 전송 완료`);
    } catch (err) {
      message.error(`이동 명령 실패: ${err?.response?.data?.message || err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* ── 상단 AMR 가로 리스트 ── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 4,
          scrollbarWidth: 'thin',
        }}
      >
        {amrsQuery.loading && amrs.length === 0 ? (
          <div style={{ padding: '12px 24px' }}>
            <Spin size="small" />
          </div>
        ) : (
          amrs.map((amr) => {
            const isActive = trackAmrName === amr.amr_name;
            const hexColor = statusHexColor(amr.status);
            return (
              <Tooltip
                key={amr.amr_id}
                title={`${amr.ip || 'IP 없음'} · 배터리 ${amr.battery ?? '-'}%`}
              >
                <div
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    borderRadius: token.borderRadiusLG,
                    background: token.colorBgContainer,
                    border: `1px solid ${
                      isActive ? hexColor : token.colorBorderSecondary
                    }`,
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 2px 8px ${token.colorPrimaryBg}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* 정보 영역 — 클릭 시 상세 모달 */}
                  <div
                    onClick={() => {
                      setDetailAmr(amr);
                      setDetailOpen(true);
                    }}
                    style={{
                      width: 150,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={iconTextRow}>
                        <StatusIcon status={amr.status} size={14} />
                        <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                          {amr.amr_name}
                        </Text>
                      </div>
                      <Tag
                        color={statusColor(amr.status)}
                        style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}
                      >
                        {statusLabel(amr.status)}
                      </Tag>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                        color: token.colorTextSecondary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <span style={iconTextRow}>
                        <Battery size={11} style={{ flexShrink: 0 }} />
                        {amr.battery ?? '-'}%
                      </span>
                      <span style={{ ...iconTextRow, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <MapPin size={11} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {amr.current_station_id || '-'}
                          {amr.dest_station_id ? ` → ${amr.dest_station_id}` : ''}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* 추적 버튼 — 오른쪽 정사각형 */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleTracking(amr);
                    }}
                    style={{
                      width: 52,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      borderLeft: `1px solid ${
                        isActive ? hexColor : token.colorBorderSecondary
                      }`,
                      background: isActive ? hexColor : `${hexColor}20`,
                      color: isActive ? '#fff' : hexColor,
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `${hexColor}30`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `${hexColor}15`;
                      }
                    }}
                  >
                    <Crosshair size={18} />
                  </div>
                </div>
              </Tooltip>
            );
          })
        )}

        {/* AMR 추가 버튼 */}
        <div
          onClick={() => setAddAmrOpen(true)}
          style={{
            flex: '0 0 auto',
            minWidth: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: token.borderRadiusLG,
            border: `1.5px dashed ${token.colorBorder}`,
            background: token.colorBgLayout,
            cursor: 'pointer',
            transition: 'all 0.2s',
            color: token.colorTextSecondary,
            padding: '10px 16px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = token.colorPrimary;
            e.currentTarget.style.color = token.colorPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = token.colorBorder;
            e.currentTarget.style.color = token.colorTextSecondary;
          }}
        >
          <Plus size={20} />
        </div>
      </div>

      {/* ── 맵 캔버스 ── */}
      <Card
        size="small"
        title={
          <div style={iconTextRow}>
            <MapPin size={16} style={{ flexShrink: 0 }} />
            <span>{selectedMap?.name ?? '맵 없음'}</span>
          </div>
        }
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {trackAmrName && (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<X size={14} />}
                onClick={() => setTrackAmrName(null)}
              >
                추적 해제
              </Button>
            )}
            <Button
              size="small"
              icon={<Settings size={14} />}
              onClick={() => {
                setTempMapId(selectedMap?.id);
                setMapModalOpen(true);
              }}
            >
              맵 변경
            </Button>
          </div>
        }
        style={{ flex: 1, minHeight: 0 }}
        styles={{ body: { height: 'calc(100% - 46px)', padding: 0 } }}
      >
        {selectedMap ? (
          <MapCanvas
            ref={mapCanvasRef}
            mapData={selectedMap}
            amrs={amrs}
            trackAmrName={trackAmrName}
            onNavigate={handleNavigate}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="업로드된 맵이 없습니다" />
          </div>
        )}
      </Card>

      {/* ── 맵 선택 모달 ── */}
      <Modal
        title="맵 선택"
        open={mapModalOpen}
        okText="선택"
        cancelText="취소"
        onOk={() => {
          const m = maps.find((x) => x.id === tempMapId);
          if (m) setSelectedMap(m);
          setMapModalOpen(false);
        }}
        onCancel={() => setMapModalOpen(false)}
      >
        {maps.length === 0 ? (
          <Empty description="업로드된 맵이 없습니다" />
        ) : (
          <Radio.Group
            value={tempMapId}
            onChange={(e) => setTempMapId(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {maps.map((m) => (
              <Radio key={m.id} value={m.id}>
                <Space>
                  {m.name}
                  {m.is_current && <Tag color="blue">현재</Tag>}
                </Space>
              </Radio>
            ))}
          </Radio.Group>
        )}
      </Modal>

      {/* ── AMR 추가 모달 ── */}
      <Modal
        title={
          <div style={iconTextRow}>
            <Plus size={16} style={{ flexShrink: 0 }} />
            <span>AMR 추가</span>
          </div>
        }
        open={addAmrOpen}
        okText="추가"
        cancelText="취소"
        confirmLoading={addAmrLoading}
        onOk={handleAddAmr}
        onCancel={() => {
          setAddAmrOpen(false);
          addAmrForm.resetFields();
        }}
      >
        <Form form={addAmrForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="amr_name"
            label="AMR 이름"
            rules={[{ required: true, message: 'AMR 이름을 입력하세요' }]}
          >
            <Input placeholder="예: AMR-01" />
          </Form.Item>
          <Form.Item
            name="ip"
            label="IP 주소"
            rules={[{ required: true, message: 'IP 주소를 입력하세요' }]}
          >
            <Input placeholder="예: 192.168.1.100" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── AMR 상세 모달 ── */}
      <Modal
        title={
          detailAmr ? (
            <div style={iconTextRow}>
              <StatusIcon status={detailAmr.status} size={18} />
              <span style={{ fontWeight: 600 }}>{detailAmr.amr_name}</span>
              <Tag
                color={statusColor(detailAmr.status)}
                style={{ margin: 0 }}
              >
                {statusLabel(detailAmr.status)}
              </Tag>
            </div>
          ) : 'AMR 상세'
        }
        open={detailOpen}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAdmin && detailAmr && (
                <Popconfirm
                  title={`"${detailAmr.amr_name}" AMR을 삭제하시겠습니까?`}
                  description="삭제 후 복구할 수 없습니다."
                  onConfirm={handleDeleteAmr}
                  okText="삭제"
                  cancelText="취소"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    danger
                    icon={<Trash2 size={14} />}
                    loading={deleteLoading}
                  >
                    삭제
                  </Button>
                </Popconfirm>
              )}
            </div>
            <Button onClick={() => setDetailOpen(false)}>닫기</Button>
          </div>
        }
        onCancel={() => setDetailOpen(false)}
        width={560}
      >
        {detailAmr && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 기본 정보 */}
            <Descriptions
              size="small"
              column={2}
              bordered
              title={
                <SectionTitle icon={<Info size={14} style={{ flexShrink: 0 }} />}>
                  기본 정보
                </SectionTitle>
              }
            >
              <Descriptions.Item label="AMR ID">{detailAmr.amr_id}</Descriptions.Item>
              <Descriptions.Item label="IP">{detailAmr.ip || '-'}</Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag color={statusColor(detailAmr.status)} style={{ margin: 0 }}>
                  {statusLabel(detailAmr.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="배터리">
                <div style={iconTextRow}>
                  <Battery size={13} style={{ flexShrink: 0 }} />
                  <span>{detailAmr.battery != null ? `${Math.round(detailAmr.battery)}%` : '-'}</span>
                </div>
              </Descriptions.Item>
            </Descriptions>

            {/* 위치 & 이동 정보 */}
            <Descriptions
              size="small"
              column={2}
              bordered
              title={
                <SectionTitle icon={<Compass size={14} style={{ flexShrink: 0 }} />}>
                  위치 / 이동
                </SectionTitle>
              }
            >
              <Descriptions.Item label="좌표 (X, Y)">
                {detailAmr.pos_x != null
                  ? `(${detailAmr.pos_x.toFixed(2)}, ${detailAmr.pos_y.toFixed(2)})`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="각도">
                {detailAmr.deg != null ? `${detailAmr.deg.toFixed(1)}°` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="현재 위치">
                {detailAmr.current_station_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="목적지">
                {detailAmr.dest_station_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="맵">
                {detailAmr.map || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="마지막 수신">
                {detailAmr.timestamp
                  ? new Date(detailAmr.timestamp).toLocaleString('ko-KR')
                  : '-'}
              </Descriptions.Item>
            </Descriptions>

            {/* 에러 / 정지 정보 */}
            {(detailAmr.error_code || detailAmr.stop_code) && (
              <Descriptions
                size="small"
                column={2}
                bordered
                title={
                  <SectionTitle
                    icon={<AlertTriangle size={14} style={{ flexShrink: 0 }} />}
                    color={token.colorError}
                  >
                    이상 정보
                  </SectionTitle>
                }
              >
                <Descriptions.Item label="에러 코드">
                  {detailAmr.error_code ? (
                    <Text type="danger">{detailAmr.error_code}</Text>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="정지 코드">
                  {detailAmr.stop_code ? (
                    <Text type="warning">{detailAmr.stop_code}</Text>
                  ) : '-'}
                </Descriptions.Item>
              </Descriptions>
            )}

            {/* 태스크 정보 */}
            <div>
              <SectionTitle icon={<Activity size={14} style={{ flexShrink: 0 }} />}>
                태스크 ({amrTasks.length}건)
              </SectionTitle>
              <div style={{ marginTop: 8 }}>
                {amrTasks.length === 0 ? (
                  <div
                    style={{
                      padding: '16px 0',
                      textAlign: 'center',
                      color: token.colorTextSecondary,
                      fontSize: 13,
                      background: token.colorBgLayout,
                      borderRadius: token.borderRadius,
                    }}
                  >
                    할당된 태스크가 없습니다
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {amrTasks.map((task) => (
                      <div
                        key={task.task_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: token.colorBgLayout,
                          borderRadius: token.borderRadius,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ ...iconTextRow, gap: 8 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            #{task.task_id}
                          </Text>
                          <Text>{task.task_type || '-'}</Text>
                          <Tag
                            color={taskStatusColor(task.task_status)}
                            style={{ fontSize: 11, margin: 0 }}
                          >
                            {task.task_status}
                          </Tag>
                        </div>
                        <div style={{ ...iconTextRow, gap: 6 }}>
                          {task.error_code && (
                            <Tag color="red" style={{ fontSize: 10, margin: 0 }}>
                              {task.error_code}
                            </Tag>
                          )}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            <span style={iconTextRow}>
                              <Clock size={10} style={{ flexShrink: 0 }} />
                              {task.created_at
                                ? new Date(task.created_at).toLocaleString('ko-KR', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '-'}
                            </span>
                          </Text>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Doosan 로봇 팔 상태 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SectionTitle icon={<Bot size={14} style={{ flexShrink: 0 }} />}>
                  로봇 팔 (Doosan)
                </SectionTitle>
                {armStateLoading && (
                  <Text type="secondary" style={{ fontSize: 11 }}>갱신 중...</Text>
                )}
              </div>
              <div style={{ marginTop: 8 }}>
                {armState ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* 상태 태그 행 */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Tag color={
                        armState.TASK_STATUS === '0' || armState.TASK_STATUS === 0
                          ? 'green' : 'blue'
                      }>
                        TASK: {armState.TASK_STATUS === '0' || armState.TASK_STATUS === 0 ? '유휴' : '작업중'}
                      </Tag>
                      <Tag color={
                        armState.ROBOT_ERROR && armState.ROBOT_ERROR !== '0' && armState.ROBOT_ERROR !== 0
                          ? 'red' : 'green'
                      }>
                        ROBOT: {armState.ROBOT_STATUS ?? '-'}
                      </Tag>
                      {armState.ROBOT_ERROR && armState.ROBOT_ERROR !== '0' && armState.ROBOT_ERROR !== 0 && (
                        <Tag color="red">ERR: {armState.ROBOT_ERROR}</Tag>
                      )}
                      {armState.VISION_ERROR && armState.VISION_ERROR !== '0' && armState.VISION_ERROR !== 0 && (
                        <Tag color="orange">VISION ERR: {armState.VISION_ERROR}</Tag>
                      )}
                      {(armState.ROBOT_CMD_FROM || armState.ROBOT_CMD_TO) && (
                        <Tag>
                          {armState.ROBOT_CMD_FROM ?? '?'} → {armState.ROBOT_CMD_TO ?? '?'}
                        </Tag>
                      )}
                    </div>

                    {/* 6축 관절 데이터 그리드 */}
                    {(() => {
                      const joints = [1, 2, 3, 4, 5, 6];
                      const cellStyle = {
                        padding: '4px 6px',
                        textAlign: 'center',
                        fontSize: 11,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      };
                      const headerStyle = {
                        ...cellStyle,
                        fontWeight: 600,
                        background: token.colorBgLayout,
                        color: token.colorTextSecondary,
                      };
                      const tempColor = (v) => {
                        const n = Number(v);
                        if (isNaN(n)) return token.colorText;
                        if (n >= 50) return '#ff4d4f';
                        if (n >= 40) return '#faad14';
                        return '#52c41a';
                      };
                      const fmtNum = (v) => {
                        const n = Number(v);
                        return isNaN(n) ? '-' : n.toFixed(1);
                      };

                      return (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'auto repeat(6, 1fr)',
                          border: `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: token.borderRadius,
                          overflow: 'hidden',
                        }}>
                          {/* 헤더 */}
                          <div style={headerStyle} />
                          {joints.map((j) => (
                            <div key={`h-${j}`} style={headerStyle}>J{j}</div>
                          ))}

                          {/* 온도 */}
                          <div style={headerStyle}>온도 (°C)</div>
                          {joints.map((j) => {
                            const v = armState[`JOINT_MOTOR_TEMPERATURE_${j}`];
                            return (
                              <div key={`t-${j}`} style={{ ...cellStyle, color: tempColor(v), fontWeight: 600 }}>
                                {fmtNum(v)}
                              </div>
                            );
                          })}

                          {/* 위치 */}
                          <div style={headerStyle}>위치 (°)</div>
                          {joints.map((j) => (
                            <div key={`p-${j}`} style={cellStyle}>
                              {fmtNum(armState[`JOINT_POSITION_${j}`])}
                            </div>
                          ))}

                          {/* 토크 */}
                          <div style={headerStyle}>토크 (Nm)</div>
                          {joints.map((j) => (
                            <div key={`q-${j}`} style={cellStyle}>
                              {fmtNum(armState[`JOINT_TORQUE_${j}`])}
                            </div>
                          ))}

                          {/* 전류 */}
                          <div style={{ ...headerStyle, borderBottom: 'none' }}>전류 (A)</div>
                          {joints.map((j) => (
                            <div key={`c-${j}`} style={{ ...cellStyle, borderBottom: 'none' }}>
                              {fmtNum(armState[`JOINT_MOTOR_CURRENT_${j}`])}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '16px 0',
                      textAlign: 'center',
                      color: token.colorTextSecondary,
                      fontSize: 13,
                      background: token.colorBgLayout,
                      borderRadius: token.borderRadius,
                    }}
                  >
                    로봇 팔 상태를 가져올 수 없습니다
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
