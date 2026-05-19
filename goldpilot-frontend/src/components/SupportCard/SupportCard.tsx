interface SupportCardProps {
  support1: number;
  support2: number;
  resistance1: number;
}

/**
 * 支撑压力卡片组件 - 完全按照index.html设计
 */
export function SupportCard({ support1, support2, resistance1 }: SupportCardProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <article className="card">
      <div className="card-title">
        <strong>当前行情支撑压力</strong>
        <span className="pill blue">现货黄金</span>
      </div>

      <div className="metric">
        <span className="sub">第一支撑</span>
        <b className="green">{formatNumber(support1)}</b>
      </div>

      <div className="metric">
        <span className="sub">第二支撑</span>
        <b className="green">{formatNumber(support2)}</b>
      </div>

      <div className="metric">
        <span className="sub">第一压力</span>
        <b className="red">{formatNumber(resistance1)}</b>
      </div>
    </article>
  );
}
