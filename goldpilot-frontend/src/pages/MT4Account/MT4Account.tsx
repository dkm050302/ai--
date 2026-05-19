import { useState, useEffect } from 'react';
import { Card, Button, Form, Input, Modal, message, Descriptions, Tag } from 'antd';
import { EditOutlined, SaveOutlined, LogoutOutlined, GlobalOutlined, UserOutlined, DollarOutlined, RiseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

interface AccountInfo {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  positions: any[];
  dailyPnl: number;
}

interface UserInfo {
  accountId: string;
  server: string;
  accountInfo?: AccountInfo;
}

export function MT4Account() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    try {
      const response = await fetch('http://localhost:3006/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setUserInfo(data.data);
      } else {
        message.error('获取用户信息失败');
        // 清除无效token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login', { replace: true });
      }
    } catch (error) {
      console.error('Load user info error:', error);
      message.error('网络错误');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    message.success('已退出登录');
    navigate('/login', { replace: true });
  };

  const handleEdit = () => {
    if (userInfo?.accountInfo) {
      form.setFieldsValue(userInfo.accountInfo);
    }
    setEditModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch('http://localhost:3006/api/account/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (data.success) {
        message.success('账号信息更新成功');
        setEditModalVisible(false);
        loadUserInfo();
      } else {
        message.error(data.message || '更新失败');
      }
    } catch (error) {
      console.error('Update account error:', error);
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  if (!userInfo) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900" style={{ fontFamily: '"Times New Roman", serif' }}>
            MT4账号管理
          </h1>
          <p className="text-sm text-slate-600 font-medium mt-2" style={{ fontFamily: '"Georgia", serif' }}>
            管理您的交易账号信息
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            icon={<GlobalOutlined />}
            onClick={() => window.open('https://www.metaquotes.net/zh/metatrader4', '_blank')}
          >
            MT4官网
          </Button>
          <Button
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </div>
      </div>

      {/* 账号信息卡片 */}
      <Card
        className="shadow-lg border-0"
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <UserOutlined className="text-xl text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">{userInfo.accountId}</div>
              <div className="text-sm text-slate-500">{userInfo.server}</div>
            </div>
          </div>
        }
        extra={
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={handleEdit}
          >
            编辑数据
          </Button>
        }
      >
        <Descriptions column={2} size="large">
          <Descriptions.Item label={<span className="font-semibold">账户净值</span>}>
            <span className="text-xl font-bold text-slate-900">
              ${userInfo.accountInfo?.equity?.toFixed(2) || '0.00'}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={<span className="font-semibold">账户余额</span>}>
            <span className="text-xl font-bold text-slate-900">
              ${userInfo.accountInfo?.balance?.toFixed(2) || '0.00'}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={<span className="font-semibold">可用保证金</span>}>
            <span className="text-lg text-slate-700">
              ${userInfo.accountInfo?.freeMargin?.toFixed(2) || '0.00'}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={<span className="font-semibold">已用保证金</span>}>
            <span className="text-lg text-slate-700">
              ${userInfo.accountInfo?.margin?.toFixed(2) || '0.00'}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={<span className="font-semibold">持仓手数</span>}>
            <Tag color="blue" className="text-base px-3 py-1">
              {userInfo.accountInfo?.positions?.length || 0} 手
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={<span className="font-semibold">今日盈亏</span>}>
            <span className={`text-xl font-bold ${
              (userInfo.accountInfo?.dailyPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              ${(userInfo.accountInfo?.dailyPnl || 0).toFixed(2)}
            </span>
          </Descriptions.Item>
        </Descriptions>

        {/* 持仓列表 */}
        {userInfo.accountInfo?.positions && userInfo.accountInfo.positions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">当前持仓</h3>
            <div className="space-y-2">
              {userInfo.accountInfo.positions.map((position, index) => (
                <Card
                  key={index}
                  size="small"
                  className="bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{position.symbol}</div>
                      <div className="text-sm text-slate-500">
                        {position.type === 'buy' ? '买入' : '卖出'} · {position.volume} 手
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${
                      position.profit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      ${position.profit.toFixed(2)}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 编辑数据弹窗 */}
      <Modal
        title="更新账号数据"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            loading={loading}
            onClick={handleSave}
          >
            保存
          </Button>,
        ]}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            label="账户余额"
            name="balance"
            rules={[{ required: true, message: '请输入账户余额' }]}
          >
            <Input
              type="number"
              prefix={<DollarOutlined className="text-slate-400" />}
              placeholder="请输入账户余额"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="账户净值"
            name="equity"
            rules={[{ required: true, message: '请输入账户净值' }]}
          >
            <Input
              type="number"
              prefix={<DollarOutlined className="text-slate-400" />}
              placeholder="请输入账户净值"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="可用保证金"
            name="freeMargin"
            rules={[{ required: true, message: '请输入可用保证金' }]}
          >
            <Input
              type="number"
              prefix={<DollarOutlined className="text-slate-400" />}
              placeholder="请输入可用保证金"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="已用保证金"
            name="margin"
            rules={[{ required: true, message: '请输入已用保证金' }]}
          >
            <Input
              type="number"
              prefix={<DollarOutlined className="text-slate-400" />}
              placeholder="请输入已用保证金"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="今日盈亏"
            name="dailyPnl"
            rules={[{ required: true, message: '请输入今日盈亏' }]}
          >
            <Input
              type="number"
              prefix={<RiseOutlined className="text-slate-400" />}
              placeholder="正数盈利，负数亏损"
              size="large"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
