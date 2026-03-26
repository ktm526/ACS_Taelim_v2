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
  Collapse,
  Badge,
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

const parseAmrErrors = (amr) => {
  if (!amr) return { errors: [], stopCode: null };

  let parsedAdditional = null;
  try {
    parsedAdditional =
      typeof amr.additional_info === 'string'
        ? JSON.parse(amr.additional_info)
        : amr.additional_info || null;
  } catch {
    parsedAdditional = null;
  }

  const rawErrors = Array.isArray(parsedAdditional?.errors) ? parsedAdditional.errors : [];

  const errors = rawErrors.map((e) => ({
    code: String(e.code ?? e.error_code ?? ''),
    message:
      e.message ?? e.msg ?? e.error_message ?? e.err_msg ?? e.description ?? null,
  }));

  return {
    errors,
    stopCode: amr.stop_code || null,
  };
};

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

  // 태스크 더보기
  const [taskShowAll, setTaskShowAll] = useState(false);

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
  const detailErrorInfo = useMemo(() => parseAmrErrors(detailAmr), [detailAmr]);

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
                      setTaskShowAll(false);
                    }}
                    style={{
                      width: 200,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 24 }}>
              <StatusIcon status={detailAmr.status} size={20} />
              <span style={{ fontWeight: 600, fontSize: 16 }}>{detailAmr.amr_name}</span>
              <Tag
                color={statusColor(detailAmr.status)}
                style={{ margin: 0, fontSize: 12 }}
              >
                {statusLabel(detailAmr.status)}
              </Tag>
              {detailAmr.ip && (
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                  ({detailAmr.ip})
                </Text>
              )}
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
        width={620}
        styles={{ body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', padding: '16px 24px' } }}
      >
        {detailAmr && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ── 요약 카드 ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
            }}>
              {[
                {
                  label: '배터리',
                  value: detailAmr.battery != null ? `${Math.round(detailAmr.battery)}%` : '-',
                  icon: <Battery size={14} />,
                  color: detailAmr.battery >= 50 ? '#52c41a' : detailAmr.battery >= 20 ? '#faad14' : '#ff4d4f',
                },
                {
                  label: '현재 위치',
                  value: detailAmr.current_station_id || '-',
                  icon: <MapPin size={14} />,
                },
                {
                  label: '목적지',
                  value: detailAmr.dest_station_id || '-',
                  icon: <Navigation size={14} />,
                },
                {
                  label: '좌표',
                  value: detailAmr.pos_x != null
                    ? `${detailAmr.pos_x.toFixed(1)}, ${detailAmr.pos_y.toFixed(1)}`
                    : '-',
                  icon: <Compass size={14} />,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: '10px 12px',
                    background: token.colorBgLayout,
                    borderRadius: token.borderRadiusLG,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ ...iconTextRow, color: token.colorTextSecondary, fontSize: 11 }}>
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: item.color || token.colorText }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* ── 에러/정지 상태 테이블 (항상 표시) ── */}
            {(() => {
              const hasErrors = detailErrorInfo.errors.length > 0;
              const hasStop = !!detailErrorInfo.stopCode;
              const isNormal = !hasErrors && !hasStop;
              const borderColor = isNormal ? token.colorBorderSecondary : '#ffccc7';
              const bg = isNormal ? token.colorBgLayout : '#fff2f0';

              const thStyle = {
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: token.colorTextSecondary,
                background: isNormal ? token.colorBgContainer : '#fff7f5',
                borderBottom: `1px solid ${borderColor}`,
                textAlign: 'left',
                whiteSpace: 'nowrap',
              };
              const tdStyle = {
                padding: '6px 10px',
                fontSize: 12,
                borderBottom: `1px solid ${borderColor}`,
                wordBreak: 'break-all',
              };

              return (
                <div style={{
                  border: `1px solid ${borderColor}`,
                  borderRadius: token.borderRadiusLG,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    ...iconTextRow,
                    gap: 6,
                    padding: '6px 10px',
                    background: bg,
                    borderBottom: `1px solid ${borderColor}`,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    <AlertTriangle size={13} style={{ color: isNormal ? token.colorTextSecondary : '#ff4d4f', flexShrink: 0 }} />
                    <span style={{ color: isNormal ? token.colorTextSecondary : '#ff4d4f' }}>
                      에러 / 정지 상태
                    </span>
                    {hasStop && (
                      <Tag color="warning" style={{ margin: 0, marginLeft: 'auto', fontSize: 11, lineHeight: '18px' }}>
                        {detailErrorInfo.stopCode}
                      </Tag>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 40 }}>#</th>
                        <th style={{ ...thStyle, width: 100 }}>에러 코드</th>
                        <th style={thStyle}>에러 메시지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasErrors ? detailErrorInfo.errors.map((err, idx) => (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, color: token.colorTextSecondary, textAlign: 'center' }}>{idx + 1}</td>
                          <td style={tdStyle}>
                            <Text type="danger" strong style={{ fontSize: 12 }}>{err.code || '-'}</Text>
                          </td>
                          <td style={tdStyle}>
                            <Text style={{ fontSize: 12 }}>{err.message || '-'}</Text>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: token.colorTextSecondary, borderBottom: 'none', padding: '12px 10px' }}>
                            에러 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── 접을 수 있는 상세 섹션들 ── */}
            <Collapse
              defaultActiveKey={['tasks']}
              size="small"
              style={{ background: 'transparent' }}
              items={[
                {
                  key: 'info',
                  label: (
                    <div style={iconTextRow}>
                      <Info size={14} style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>상세 정보</span>
                    </div>
                  ),
                  children: (
                    <Descriptions size="small" column={2} bordered>
                      <Descriptions.Item label="AMR ID">{detailAmr.amr_id}</Descriptions.Item>
                      <Descriptions.Item label="IP">{detailAmr.ip || '-'}</Descriptions.Item>
                      <Descriptions.Item label="각도">
                        {detailAmr.deg != null ? `${detailAmr.deg.toFixed(1)}°` : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="맵">{detailAmr.map || '-'}</Descriptions.Item>
                      <Descriptions.Item label="마지막 수신" span={2}>
                        {detailAmr.timestamp
                          ? new Date(detailAmr.timestamp).toLocaleString('ko-KR')
                          : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'tasks',
                  label: (
                    <div style={{ ...iconTextRow, justifyContent: 'space-between', width: '100%' }}>
                      <div style={iconTextRow}>
                        <Activity size={14} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>태스크</span>
                      </div>
                      <Badge
                        count={amrTasks.filter((t) => t.task_status === 'RUNNING').length}
                        size="small"
                        style={{ marginRight: 4 }}
                      />
                    </div>
                  ),
                  children: (() => {
                    if (amrTasks.length === 0) {
                      return (
                        <div style={{
                          padding: '20px 0',
                          textAlign: 'center',
                          color: token.colorTextSecondary,
                          fontSize: 13,
                        }}>
                          할당된 태스크가 없습니다
                        </div>
                      );
                    }
                    const TASK_LIMIT = 20;
                    const visibleTasks = taskShowAll ? amrTasks : amrTasks.slice(0, TASK_LIMIT);
                    const hiddenCount = amrTasks.length - TASK_LIMIT;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {visibleTasks.map((task) => (
                            <div
                              key={task.task_id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                background: task.task_status === 'RUNNING' ? `${token.colorPrimaryBg}` : token.colorBgLayout,
                                borderRadius: token.borderRadius,
                                fontSize: 12,
                                borderLeft: task.task_status === 'RUNNING' ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                              }}
                            >
                              <div style={{ ...iconTextRow, gap: 6 }}>
                                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                                  #{task.task_id}
                                </Text>
                                <Tag
                                  color={task.task_type === 'ARM' ? 'purple' : 'cyan'}
                                  style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}
                                >
                                  {task.task_type || '-'}
                                </Tag>
                                <Tag
                                  color={taskStatusColor(task.task_status)}
                                  style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}
                                >
                                  {task.task_status}
                                </Tag>
                                {task.error_code && (
                                  <Text type="danger" style={{ fontSize: 10 }}>{task.error_code}</Text>
                                )}
                              </div>
                              <Text type="secondary" style={{ fontSize: 10, flexShrink: 0 }}>
                                {task.created_at
                                  ? new Date(task.created_at).toLocaleString('ko-KR', {
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '-'}
                              </Text>
                            </div>
                          ))}
                        </div>
                        {hiddenCount > 0 && (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => setTaskShowAll((prev) => !prev)}
                            style={{ alignSelf: 'center', fontSize: 12, padding: '4px 0' }}
                          >
                            {taskShowAll ? '접기' : `이전 태스크 ${hiddenCount}건 더보기`}
                          </Button>
                        )}
                      </div>
                    );
                  })(),
                },
                {
                  key: 'arm',
                  label: (
                    <div style={{ ...iconTextRow, justifyContent: 'space-between', width: '100%' }}>
                      <div style={iconTextRow}>
                        <Bot size={14} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>로봇 팔 (Doosan)</span>
                      </div>
                      {armStateLoading && (
                        <Spin size="small" style={{ marginRight: 4 }} />
                      )}
                    </div>
                  ),
                  children: armState ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Tag color={
                          armState.TASK_STATUS === '0' || armState.TASK_STATUS === 0
                            ? 'green' : 'blue'
                        }>
                          {armState.TASK_STATUS === '0' || armState.TASK_STATUS === 0 ? 'READY' : 'BUSY'}
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
                          <Tag color="orange">VISION: {armState.VISION_ERROR}</Tag>
                        )}
                        {(armState.ROBOT_CMD_FROM || armState.ROBOT_CMD_TO) && (
                          <Tag>{armState.ROBOT_CMD_FROM ?? '?'} → {armState.ROBOT_CMD_TO ?? '?'}</Tag>
                        )}
                      </div>
                      {(() => {
                        const joints = [1, 2, 3, 4, 5, 6];
                        const cellStyle = {
                          padding: '3px 4px',
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
                            <div style={headerStyle} />
                            {joints.map((j) => (
                              <div key={`h-${j}`} style={headerStyle}>J{j}</div>
                            ))}
                            <div style={headerStyle}>온도</div>
                            {joints.map((j) => {
                              const v = armState[`JOINT_MOTOR_TEMPERATURE_${j}`];
                              return (
                                <div key={`t-${j}`} style={{ ...cellStyle, color: tempColor(v), fontWeight: 600 }}>
                                  {fmtNum(v)}
                                </div>
                              );
                            })}
                            <div style={headerStyle}>위치</div>
                            {joints.map((j) => (
                              <div key={`p-${j}`} style={cellStyle}>{fmtNum(armState[`JOINT_POSITION_${j}`])}</div>
                            ))}
                            <div style={headerStyle}>토크</div>
                            {joints.map((j) => (
                              <div key={`q-${j}`} style={cellStyle}>{fmtNum(armState[`JOINT_TORQUE_${j}`])}</div>
                            ))}
                            <div style={{ ...headerStyle, borderBottom: 'none' }}>전류</div>
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
                    <div style={{
                      padding: '16px 0',
                      textAlign: 'center',
                      color: token.colorTextSecondary,
                      fontSize: 13,
                    }}>
                      로봇 팔 상태를 가져올 수 없습니다
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
