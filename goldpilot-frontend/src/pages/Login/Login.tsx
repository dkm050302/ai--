import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Form, Input, Button, message, Card } from 'antd';
import { UserOutlined, LockOutlined, CloudServerOutlined } from '@ant-design/icons';

interface LoginForm {
  accountId: string;
  password: string;
  server: string;
}

export function Login() {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  // 从其他页面跳转过来时保存目标路径
  const from = (location.state as any)?.from?.pathname || '/mt4-account';

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(`http://localhost:3006${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (data.success) {
        // 保存token
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        message.success(isRegister ? '注册成功！' : '登录成功！');

        // 稍微延迟后跳转，确保message显示
        setTimeout(() => {
          window.location.href = from;
        }, 500);
      } else {
        message.error(data.message || '操作失败');
      }
    } catch (error) {
      console.error('Login/Register error:', error);
      message.error('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">GoldPilot</h1>
          <p className="text-slate-600 mt-2">黄金交易决策系统</p>
        </div>

        {/* 登录/注册卡片 */}
        <Card className="shadow-2xl border-0">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900">
              {isRegister ? '注册账号' : '登录系统'}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              {isRegister ? '创建您的MT4账号' : '使用MT4账号登录'}
            </p>
          </div>

          <Form
            name="login"
            onFinish={onFinish}
            autoComplete="off"
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              label="MT4账号"
              name="accountId"
              rules={[{ required: true, message: '请输入MT4账号' }]}
            >
              <Input
                prefix={<UserOutlined className="text-slate-400" />}
                placeholder="请输入MT4账号"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="服务器"
              name="server"
              rules={[{ required: true, message: '请输入服务器名称' }]}
            >
              <Input
                prefix={<CloudServerOutlined className="text-slate-400" />}
                placeholder="例如: VTMarkets-Live 8"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 4, message: '密码至少4位' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-400" />}
                placeholder="请输入密码"
                size="large"
              />
            </Form.Item>

            <Form.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                size="large"
                block
                className="h-12 text-base font-semibold bg-gradient-to-r from-blue-500 to-blue-600 border-0"
              >
                {isRegister ? '注册' : '登录'}
              </Button>
            </Form.Item>
          </Form>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </button>
          </div>
        </Card>

        {/* MT4官网链接 */}
        <div className="text-center mt-6">
          <a
            href="https://www.metaquotes.net/zh/metatrader4"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            访问MT4官网
          </a>
        </div>
      </div>
    </div>
  );
}
