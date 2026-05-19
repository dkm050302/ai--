interface RiskCardProps {
  risk: number;
  riskLevel: 'low' | 'medium' | 'high';
  positionAdvice: number;
  stopLoss: number;
}

/**
 * 仓位管理警示卡片组件 - 完全按照index.html设计
 */
export function RiskCard({ risk, riskLevel, positionAdvice, stopLoss }: RiskCardProps) {
  const getRiskLabel = () => {
    if (riskLevel === 'high') return '高风险';
    if (riskLevel === 'medium') return '中风险';
    return '低风险';
  };

  return (
    <article className="card">
      <div className="card-title">
        <strong>仓位管理警示</strong>
        <span className={`pill ${riskLevel === 'high' ? 'red' : riskLevel === 'medium' ? 'amber' : 'green'}`}>
          {getRiskLabel()}
        </span>
      </div>

      <div className="risk-bar">
        <div className="risk-fill" style={{ width: `${risk}%` }} />
      </div>

      <div className="metric">
        <span className="sub">建议仓位</span>
        <b>{positionAdvice.toFixed(0)}%</b>
      </div>

      <div className="metric">
        <span className="sub">最大止损</span>
        <b className="red">{stopLoss.toFixed(1)}%</b>
      </div>
    </article>
  );
}
