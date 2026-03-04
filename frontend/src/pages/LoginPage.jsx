import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Space } from 'antd';
import { User, Lock } from 'lucide-react';
import { userAPI } from '@/api';

const { Title, Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { data } = await userAPI.login(values.username, values.password);
      localStorage.setItem('user', JSON.stringify(data.user));
      message.success(`${data.user.name || data.user.username}님, 환영합니다!`);
      navigate('/', { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.message || '로그인에 실패했습니다.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #e8f4fd 0%, #f0f5ff 50%, #f9f0ff 100%)',
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
          borderRadius: 16,
        }}
        styles={{ body: { padding: '40px 32px' } }}
      >
        <Space
          direction="vertical"
          align="center"
          style={{ width: '100%', marginBottom: 32 }}
        >
          <img src="/logo.png" alt="logo" style={{ height: 50, objectFit: 'contain' }} />

        </Space>

        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '아이디를 입력하세요' }]}
          >
            <Input
              prefix={<User size={16} style={{ color: '#bfbfbf' }} />}
              placeholder="아이디"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '비밀번호를 입력하세요' }]}
          >
            <Input.Password
              prefix={<Lock size={16} style={{ color: '#bfbfbf' }} />}
              placeholder="비밀번호"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 44, borderRadius: 8, fontWeight: 600 }}
            >
              로그인
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
