interface DecisionCardProps {
  headline: string;
  summary: string;
  eventCountdown: string;
  aiReason: string;
}

/**
 * 决策卡片组件 - 完全按照index.html设计
 * 三列布局（主内容 + 事件倒计时 + AI解释）
 */
export function DecisionCard({
  headline,
  summary,
  eventCountdown,
  aiReason,
}: DecisionCardProps) {
  return (
    <article className="decision-card">
      {/* 主内容区 */}
      <div className="decision-main">
        <div className="decision-kicker">TODAY DECISION</div>
        <h1>{headline}</h1>
        <p>{summary}</p>
      </div>

      {/* 事件倒计时 */}
      <div className="decision-box">
        <strong>事件倒计时</strong>
        <p>{eventCountdown}</p>
      </div>

      {/* AI解释 */}
      <div className="decision-box">
        <strong>AI 解释</strong>
        <p>{aiReason}</p>
      </div>
    </article>
  );
}
