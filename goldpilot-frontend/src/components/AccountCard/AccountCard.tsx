import { formatMoney } from '@/utils/format';
import type { Account } from '@/types';

interface AccountCardProps {
  accountData: Account;
}

/**
 * 账户卡片组件 - 完全按照index.html设计
 */
export function AccountCard({ accountData }: AccountCardProps) {
  const {
    equity,
    freeMargin,
    positions,
    dailyPnl,
    riskUsed,
  } = accountData;

  const totalLots = positions.reduce((sum, pos) => sum + pos.volume, 0);

  // 模拟其他数据 - 参考index.html
  const modelConfidence = 72;
  const nextEvent = '22:15';
  const positionSide = dailyPnl >= 0 ? '黄金多单' : '黄金轻仓';

  const getColorClass = (value: number) => {
    return value >= 0 ? 'green' : 'red';
  };

  return (
    <article className="account-card">
      <div className="panel-title">
        <strong>账号交易情况</strong>
        <span className="pill green">模拟账户</span>
      </div>

      <div className="account-grid">
        {/* 账户净值 */}
        <div className="account">
          <span className="sub">账户净值</span>
          <b>${formatMoney(equity)}</b>
        </div>

        {/* 可用保证金 */}
        <div className="account">
          <span className="sub">可用保证金</span>
          <b>${formatMoney(freeMargin)}</b>
        </div>

        {/* 持仓手数 */}
        <div className="account">
          <span className="sub">持仓手数</span>
          <b>{totalLots.toFixed(1)}</b>
        </div>

        {/* 今日盈亏 */}
        <div className="account">
          <span className="sub">今日盈亏</span>
          <b className={getColorClass(dailyPnl)}>
            {dailyPnl >= 0 ? '+' : ''}{formatMoney(dailyPnl)}
          </b>
        </div>

        {/* 风险占用 */}
        <div className="account">
          <span className="sub">风险占用</span>
          <b className="amber">{riskUsed.toFixed(0)}%</b>
        </div>

        {/* 服务提醒 */}
        <div className="account">
          <span className="sub">服务提醒</span>
          <b className="blue">待触达</b>
        </div>

        {/* 模型信心 */}
        <div className="account">
          <span className="sub">模型信心</span>
          <b>{modelConfidence}%</b>
        </div>

        {/* 下一事件 */}
        <div className="account">
          <span className="sub">下一事件</span>
          <b>{nextEvent}</b>
        </div>

        {/* 持仓方向 */}
        <div className="account">
          <span className="sub">持仓方向</span>
          <b className={dailyPnl >= 0 ? 'green' : 'amber'}>{positionSide}</b>
        </div>

        {/* 产品阶段 */}
        <div className="account">
          <span className="sub">产品阶段</span>
          <b>前端原型</b>
        </div>
      </div>
    </article>
  );
}
