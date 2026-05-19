interface ActionItem {
  title: string;
  text: string;
}

interface ActionPanelProps {
  actions: ActionItem[];
}

/**
 * 客户服务动作面板组件 - 完全按照index.html设计
 */
export function ActionPanel({ actions }: ActionPanelProps) {
  return (
    <article className="card feed">
      <div className="panel-title">
        <strong>客户服务动作</strong>
        <span className="pill green">可执行</span>
      </div>

      <div className="action-list">
        {actions.map((action, index) => (
          <div key={index} className="action-item">
            <strong>{action.title}</strong>
            <div className="sub">{action.text}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
