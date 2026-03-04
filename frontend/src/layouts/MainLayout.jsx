import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Space, Avatar, Dropdown, theme } from 'antd';
import { LayoutDashboard, Map, Settings, LogOut, User, ScrollText } from 'lucide-react';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const userMenuItems = [
    {
      key: 'info',
      label: (
        <div>
          <div style={{ fontWeight: 600 }}>{user.name || user.username}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isAdmin ? '관리자' : '일반 사용자'}
          </Text>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogOut size={14} />,
      label: '로그아웃',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const siderItems = [
    {
      key: '/',
      icon: <LayoutDashboard size={18} />,
      label: '대시보드',
    },
    {
      key: '/maps',
      icon: <Map size={18} />,
      label: '맵 관리',
    },
    {
      key: '/logs',
      icon: <ScrollText size={18} />,
      label: '통신 로그',
    },
    {
      key: '/settings',
      icon: <Settings size={18} />,
      label: '설정',
    },
  ];

  // 현재 경로에 매칭되는 메뉴 키 결정
  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    const match = siderItems
      .filter((item) => path.startsWith(item.key) && item.key !== '/')
      .sort((a, b) => b.key.length - a.key.length);
    return match.length > 0 ? match[0].key : '/';
  };

  /* ── 일반 사용자: 사이드바 없이 대시보드만 ── */
  if (!isAdmin) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            height: 64,
          }}
        >
          <img src="/logo.png" alt="logo" style={{ height: 32, objectFit: 'contain' }} />
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size="small"
                icon={<User size={14} />}
                style={{
                  background: token.colorTextQuaternary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
              <Text strong style={{ fontSize: 13 }}>
                {user.name || user.username}
              </Text>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ margin: 16, overflow: 'auto', height: 'calc(100vh - 64px - 32px)' }}>
          <Outlet />
        </Content>
      </Layout>
    );
  }

  /* ── 관리자: 사이드바 포함 전체 레이아웃 ── */
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={200}
        style={{
          background: '#fff',
          borderRight: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {/* 로고 영역 */}
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            gap: 10,
          }}
        >
          <img src="/logo.png" alt="logo" style={{ height: 32, objectFit: 'contain' }} />
        </div>

        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={siderItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', marginTop: 4 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            height: 64,
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size="small"
                icon={<User size={14} />}
                style={{
                  background: token.colorPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
              <Text strong style={{ fontSize: 13 }}>
                {user.name || user.username}
              </Text>
            </Space>
          </Dropdown>
        </Header>

        <Content
          style={{
            margin: 16,
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
