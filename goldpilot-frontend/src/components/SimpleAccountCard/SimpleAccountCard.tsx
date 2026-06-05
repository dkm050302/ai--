import { useState, useEffect } from 'react';
import { getApiUrl } from '@/utils/apiConfig';
import type { Account, Position } from '@/types';

interface AccountState {
  equity: number;
  freeMargin: number;
  lots: number;
  dailyPnl: number;
  riskUsed: number;
  positionSide: string;
  isDemo: boolean;
}

interface SimpleAccountCardProps {
  hideWhenDemo?: boolean;
}

const DEFAULT_ACCOUNT: AccountState = {
  equity: 0,
  freeMargin: 0,
  lots: 0,
  dailyPnl: 0,
  riskUsed: 0,
  positionSide: '--',
  isDemo: true,
};

function getPositionLabel(positions: Position[]): string {
  if (!positions || positions.length === 0) return '无持仓';
  const types = positions.map((p) => p.type === 'buy' ? '多单' : '空单');
  const unique = [...new Set(types)];
  return unique.map((t) => `黄金${t}`).join(' + ');
}

/**
 * 账户卡片组件 - 从后端 API 获取真实数据
 */
export function SimpleAccountCard({ hideWhenDemo = false }: SimpleAccountCardProps) {
  const [accountData, setAccountData] = useState<AccountState>(DEFAULT_ACCOUNT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchAccount = async () => {
      try {
        const response = await fetch(getApiUrl('/api/account'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        if (result.success && result.data) {
          const data = result.data as Account;
          if (mounted) {
            setAccountData({
              equity: data.equity || 0,
              freeMargin: data.freeMargin || 0,
              lots: data.positions?.reduce((sum, p) => sum + p.volume, 0) || 0,
              dailyPnl: data.dailyPnl || 0,
              riskUsed: data.riskUsed || 0,
              positionSide: getPositionLabel(data.positions),
              isDemo: result.isDemo === true,
            });
          }
        }
      } catch (error) {
        console.error('获取账户数据失败:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAccount();
    const interval = setInterval(fetchAccount, 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const formatMoney = (value: number) => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  if (hideWhenDemo && !loading && accountData.isDemo) {
    return null;
  }

  return (
    <article className="account-card">
      <div className="panel-title">
        <strong>账号交易情况</strong>
        <span className={`pill ${accountData.isDemo ? 'amber' : 'green'}`}>
          {accountData.isDemo ? '演示数据' : '实时数据'}
        </span>
      </div>

      <div className="account-grid">
        <div className="account">
          <span className="sub">账户净值</span>
          <b>{loading ? '--' : `$${formatMoney(accountData.equity)}`}</b>
        </div>

        <div className="account">
          <span className="sub">可用保证金</span>
          <b>{loading ? '--' : `$${formatMoney(accountData.freeMargin)}`}</b>
        </div>

        <div className="account">
          <span className="sub">持仓手数</span>
          <b>{loading ? '--' : accountData.lots.toFixed(1)}</b>
        </div>

        <div className="account">
          <span className="sub">今日盈亏</span>
          <b className={accountData.dailyPnl >= 0 ? 'green' : 'red'}>
            {loading ? '--' : `${accountData.dailyPnl >= 0 ? '+' : ''}$${formatMoney(accountData.dailyPnl)}`}
          </b>
        </div>

        <div className="account">
          <span className="sub">风险占用</span>
          <b className="amber">{loading ? '--' : `${accountData.riskUsed}%`}</b>
        </div>

        <div className="account">
          <span className="sub">服务提醒</span>
          <b className="blue">待触达</b>
        </div>

        <div className="account">
          <span className="sub">持仓方向</span>
          <b className={accountData.dailyPnl >= 0 ? 'green' : 'red'}>
            {loading ? '--' : accountData.positionSide}
          </b>
        </div>
      </div>
    </article>
  );
}
