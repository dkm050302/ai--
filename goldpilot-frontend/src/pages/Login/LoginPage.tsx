import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { authService } from '@/services/auth';

export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { accountId: string; password: string }) => {
    setLoading(true);
    try {
      const result = await authService.loginSimple(values.accountId, values.password);
      message.success('登录成功');
      if (result.user?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d1117',
    }}>
      <Card
        style={{
          width: 360,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
        }}
        styles={{ header: { background: 'transparent', borderBottom: '1px solid #30363d' } }}
        title={<span style={{ color: '#e6edf3' }}>GoldPilot 登录</span>}
      >
        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="accountId"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#8b949e' }} />}
              placeholder="账号"
              style={{ background: '#0d1117', borderColor: '#30363d', color: '#e6edf3' }}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#8b949e' }} />}
              placeholder="密码"
              style={{ background: '#0d1117', borderColor: '#30363d', color: '#e6edf3' }}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 40 }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
