interface ProbCardProps {
  upProb: number;
  downProb: number;
}

/**
 * 概率卡片组件 - 完全按照index.html设计
 */
export function ProbCard({ upProb, downProb }: ProbCardProps) {
  return (
    <article className="card">
      <div className="card-title">
        <strong>上涨 / 下跌概率</strong>
        <span className="pill">公式待接入</span>
      </div>

      <div className="metric">
        <span className="sub">上涨概率</span>
        <b className="green">{upProb.toFixed(1)}%</b>
      </div>

      <div className="prob-bar">
        <div className="prob-fill" style={{ width: `${upProb}%` }} />
      </div>

      <div className="metric">
        <span className="sub">下跌概率</span>
        <b className="red">{downProb.toFixed(1)}%</b>
      </div>

      <div className="sub">当前先用行情动量与波动率计算，后续可替换为正式公式。</div>
    </article>
  );
}
