/**
 * 简化的账户卡片组件 - 使用模拟数据
 */
export function SimpleAccountCard() {
  // 模拟账户数据
  const accountData = {
    equity: 125000,
    freeMargin: 86400,
    lots: 3.2,
    dailyPnl: 2180,
    riskUsed: 31,
    modelConfidence: 72,
    nextEvent: '22:15',
    positionSide: '黄金多单' as const,
  };

  const formatMoney = (value: number) => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <article className="account-card">
      <div className="panel-title">
        <strong>账号交易情况</strong>
        <span className="pill green">模拟账户</span>
      </div>

      <div className="account-grid">
        <div className="account">
          <span className="sub">账户净值</span>
          <b>${formatMoney(accountData.equity)}</b>
        </div>

        <div className="account">
          <span className="sub">可用保证金</span>
          <b>${formatMoney(accountData.freeMargin)}</b>
        </div>

        <div className="account">
          <span className="sub">持仓手数</span>
          <b>{accountData.lots.toFixed(1)}</b>
        </div>

        <div className="account">
          <span className="sub">今日盈亏</span>
          <b className="green">
            +${formatMoney(accountData.dailyPnl)}
          </b>
        </div>

        <div className="account">
          <span className="sub">风险占用</span>
          <b className="amber">{accountData.riskUsed}%</b>
        </div>

        <div className="account">
          <span className="sub">服务提醒</span>
          <b className="blue">待触达</b>
        </div>

        <div className="account">
          <span className="sub">模型信心</span>
          <b>{accountData.modelConfidence}%</b>
        </div>

        <div className="account">
          <span className="sub">下一事件</span>
          <b>{accountData.nextEvent}</b>
        </div>

        <div className="account">
          <span className="sub">持仓方向</span>
          <b className="green">{accountData.positionSide}</b>
        </div>

        <div className="account">
          <span className="sub">产品阶段</span>
          <b>前端原型</b>
        </div>
      </div>
    </article>
  );
}
