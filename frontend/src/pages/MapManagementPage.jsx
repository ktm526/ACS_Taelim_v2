import React, { useState, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Upload,
  Tag,
  Space,
  Select,
  Popconfirm,
  Row,
  Col,
  Typography,
  Empty,
  Modal,
  Descriptions,
  List,
  Spin,
  message,
  theme,
} from 'antd';
import {
  Upload as UploadIcon,
  Trash2,
  Eye,
  CheckCircle,
  RefreshCw,
  MapPin,
  Download,
} from 'lucide-react';
import usePolling from '@/hooks/usePolling';
import { amrAPI, mapAPI } from '@/api';
import MapCanvas from '@/components/MapCanvas';

const { Text } = Typography;

function safeParse(raw, fallback = {}) {
  if (raw == null) return fallback;
  let v = raw;
  try {
    if (typeof v === 'string') v = JSON.parse(v);
    if (typeof v === 'string') v = JSON.parse(v);
  } catch {
    return fallback;
  }
  return v ?? fallback;
}

export default function MapManagementPage() {
  const { token } = theme.useToken();
  const mapsQuery = usePolling(mapAPI.getAll, 10000);
  const maps = mapsQuery.data ?? [];

  const [uploading, setUploading] = useState(false);
  const [previewMap, setPreviewMap] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // AMR 맵 불러오기
  const [amrMapOpen, setAmrMapOpen] = useState(false);
  const [amrList, setAmrList] = useState([]);
  const [selectedAmrIp, setSelectedAmrIp] = useState(null);
  const [amrMaps, setAmrMaps] = useState({ current_map: null, maps: [] });
  const [amrMapLoading, setAmrMapLoading] = useState(false);
  const [downloadingMap, setDownloadingMap] = useState(null);

  // 파일 업로드
  const handleUpload = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'smap'].includes(ext)) {
      message.error('JSON 또는 SMAP 파일만 업로드 가능합니다.');
      return false;
    }

    setUploading(true);
    try {
      await mapAPI.upload(file);
      message.success(`맵 "${file.name}" 업로드 완료!`);
      mapsQuery.refetch();
    } catch (err) {
      message.error(err.response?.data?.msg || '맵 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
    return false;
  };

  // 현재 맵 설정
  const handleSetCurrent = async (id) => {
    try {
      await mapAPI.setCurrent(id);
      message.success('현재 맵이 변경되었습니다.');
      mapsQuery.refetch();
    } catch {
      message.error('맵 변경에 실패했습니다.');
    }
  };

  // 맵 삭제
  const handleDelete = async (id) => {
    try {
      await mapAPI.delete(id);
      message.success('맵이 삭제되었습니다.');
      mapsQuery.refetch();
    } catch {
      message.error('맵 삭제에 실패했습니다.');
    }
  };

  // AMR 맵 모달 열기
  const handleOpenAmrMap = useCallback(async () => {
    setAmrMapOpen(true);
    setSelectedAmrIp(null);
    setAmrMaps({ current_map: null, maps: [] });
    try {
      const res = await amrAPI.getAll();
      const list = res.data ?? res;
      setAmrList(Array.isArray(list) ? list : []);
    } catch {
      message.error('AMR 목록 조회 실패');
    }
  }, []);

  // AMR 선택 시 맵 목록 조회
  const handleSelectAmr = useCallback(async (ip) => {
    setSelectedAmrIp(ip);
    setAmrMaps({ current_map: null, maps: [] });
    setAmrMapLoading(true);
    try {
      const res = await mapAPI.getAmrMaps(ip);
      const data = res.data?.data ?? res.data ?? {};
      setAmrMaps({
        current_map: data.current_map || null,
        maps: Array.isArray(data.maps) ? data.maps : [],
      });
    } catch (err) {
      message.error(`맵 목록 조회 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setAmrMapLoading(false);
    }
  }, []);

  // AMR에서 맵 다운로드
  const handleDownloadAmrMap = useCallback(async (mapName) => {
    if (!selectedAmrIp) return;
    setDownloadingMap(mapName);
    try {
      await mapAPI.downloadAmrMap(selectedAmrIp, mapName);
      message.success(`맵 "${mapName}" 불러오기 완료!`);
      mapsQuery.refetch();
    } catch (err) {
      message.error(`맵 다운로드 실패: ${err.response?.data?.msg || err.message}`);
    } finally {
      setDownloadingMap(null);
    }
  }, [selectedAmrIp, mapsQuery]);

  // 맵 상세 정보
  const getMapInfo = (mapData) => {
    const stations = safeParse(mapData.stations).stations ?? [];
    const paths = safeParse(mapData.paths).paths ?? [];
    const header = safeParse(mapData.additional_info).header || {};
    return { stations, paths, header };
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '맵 이름',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <Text strong>{text}</Text>
          {record.is_current && <Tag color="blue">현재 맵</Tag>}
        </Space>
      ),
    },
    {
      title: '스테이션',
      key: 'stations',
      width: 90,
      render: (_, record) => {
        const { stations } = getMapInfo(record);
        return `${stations.length}개`;
      },
    },
    {
      title: '경로',
      key: 'paths',
      width: 80,
      render: (_, record) => {
        const { paths } = getMapInfo(record);
        return `${paths.length}개`;
      },
    },
    {
      title: '최종 수정',
      dataIndex: 'last_updated',
      key: 'last_updated',
      width: 160,
      render: (text) =>
        text ? new Date(text).toLocaleString('ko-KR') : '-',
    },
    {
      title: '',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<Eye size={14} />}
            onClick={() => {
              setPreviewMap(record);
              setPreviewOpen(true);
            }}
          >
            미리보기
          </Button>
          {!record.is_current && (
            <Button
              size="small"
              icon={<CheckCircle size={14} />}
              onClick={() => handleSetCurrent(record.id)}
            >
              현재 맵
            </Button>
          )}
          <Popconfirm
            title="이 맵을 삭제하시겠습니까?"
            description="삭제된 맵은 복구할 수 없습니다."
            onConfirm={() => handleDelete(record.id)}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 상단 액션 영역 */}
      <Card size="small">
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <MapPin size={20} color={token.colorPrimary} />
              <Text strong style={{ fontSize: 16 }}>맵 관리</Text>
              <Tag>{maps.length}개 맵</Tag>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button size="small" icon={<RefreshCw size={14} />} onClick={mapsQuery.refetch}>
                새로고침
              </Button>
              <Button
                icon={<Download size={14} />}
                onClick={handleOpenAmrMap}
              >
                AMR에서 불러오기
              </Button>
              <Upload
                accept=".json,.smap"
                showUploadList={false}
                beforeUpload={handleUpload}
              >
                <Button
                  type="primary"
                  icon={<UploadIcon size={14} />}
                  loading={uploading}
                >
                  맵 파일 업로드
                </Button>
              </Upload>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 맵 테이블 */}
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          size="small"
          dataSource={maps}
          columns={columns}
          rowKey="id"
          pagination={false}
          loading={mapsQuery.loading && maps.length === 0}
          locale={{ emptyText: <Empty description="업로드된 맵이 없습니다" /> }}
        />
      </Card>

      {/* 맵 미리보기 모달 */}
      <Modal
        title={`맵 미리보기 - ${previewMap?.name ?? ''}`}
        open={previewOpen}
        footer={<Button onClick={() => setPreviewOpen(false)}>닫기</Button>}
        onCancel={() => setPreviewOpen(false)}
        width={800}
        styles={{ body: { padding: 0 } }}
      >
        {previewMap && (
          <div>
            <div style={{ height: 500, background: token.colorBgLayout }}>
              <MapCanvas mapData={previewMap} amrs={[]} />
            </div>
            <div style={{ padding: 16 }}>
              {(() => {
                const info = getMapInfo(previewMap);
                return (
                  <Descriptions size="small" column={3} bordered>
                    <Descriptions.Item label="맵 이름">{previewMap.name}</Descriptions.Item>
                    <Descriptions.Item label="스테이션 수">{info.stations.length}개</Descriptions.Item>
                    <Descriptions.Item label="경로 수">{info.paths.length}개</Descriptions.Item>
                    {info.header.mapName && (
                      <Descriptions.Item label="원본 맵 이름">{info.header.mapName}</Descriptions.Item>
                    )}
                    {info.header.resolution && (
                      <Descriptions.Item label="해상도">{info.header.resolution}</Descriptions.Item>
                    )}
                    <Descriptions.Item label="현재 맵">
                      {previewMap.is_current ? <Tag color="blue">예</Tag> : '아니오'}
                    </Descriptions.Item>
                  </Descriptions>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

      {/* AMR에서 맵 불러오기 모달 */}
      <Modal
        title={
          <Space>
            <Download size={16} />
            <span>AMR에서 맵 불러오기</span>
          </Space>
        }
        open={amrMapOpen}
        footer={<Button onClick={() => setAmrMapOpen(false)}>닫기</Button>}
        onCancel={() => setAmrMapOpen(false)}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          {/* AMR 선택 */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>AMR 선택</Text>
            <Select
              placeholder="맵을 불러올 AMR을 선택하세요"
              style={{ width: '100%' }}
              value={selectedAmrIp}
              onChange={handleSelectAmr}
              options={amrList.map((a) => ({
                label: `${a.amr_name} (${a.ip || 'IP 없음'})`,
                value: a.ip,
                disabled: !a.ip,
              }))}
            />
          </div>

          {/* 맵 목록 */}
          {selectedAmrIp && (
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                맵 목록
                {amrMaps.current_map && (
                  <span> · 현재 로드: <Tag color="blue" style={{ margin: 0 }}>{amrMaps.current_map}</Tag></span>
                )}
              </Text>
              {amrMapLoading ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Spin tip="맵 목록 조회 중..." />
                </div>
              ) : amrMaps.maps.length === 0 ? (
                <Empty description="AMR에 저장된 맵이 없습니다" style={{ padding: 16 }} />
              ) : (
                <List
                  size="small"
                  bordered
                  dataSource={amrMaps.maps}
                  renderItem={(mapName) => (
                    <List.Item
                      actions={[
                        <Button
                          key="dl"
                          size="small"
                          type="primary"
                          icon={<Download size={13} />}
                          loading={downloadingMap === mapName}
                          onClick={() => handleDownloadAmrMap(mapName)}
                        >
                          불러오기
                        </Button>,
                      ]}
                    >
                      <Space>
                        <MapPin size={14} style={{ color: token.colorTextSecondary }} />
                        <Text>{mapName}</Text>
                        {mapName === amrMaps.current_map && (
                          <Tag color="blue" style={{ margin: 0 }}>현재</Tag>
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
