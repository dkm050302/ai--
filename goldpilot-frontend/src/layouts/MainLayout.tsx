import { Outlet, useLocation } from 'react-router-dom';
import { PageAssistant } from '@/components/PageAssistant';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Tabs } from '@/components/Tabs/Tabs';

const PAGE_LABELS: Record<string, string> = {
  '/': '交易看板',
  '/ai-account': 'AI账号',
  '/datasource-settings': '数据源设置',
  '/research-center': '量化策略实验室',
};

const PAGE_QUESTIONS: Record<string, string[]> = {
  '/': [
    '当前交易看板最需要注意什么？',
    '今日和本周重要事件怎么看？',
    '周末休市时这页该看什么？',
  ],
  '/ai-account': [
    'AI账号配置状态怎么看？',
    '为什么AI请求会超时？',
    '这页下一步该配置什么？',
  ],
  '/datasource-settings': [
    '当前数据源有什么风险？',
    'Twelve Data额度怎么看？',
    '真实数据不可用时页面会怎样？',
  ],
  '/research-center': [
    '这页当前最需要注意什么？',
    '剔除周末K线后数据质量怎么样？',
    '下一步参数应该怎么小步调整？',
  ],
};

export function MainLayout() {
  const location = useLocation();
  const pageTitle = PAGE_LABELS[location.pathname] || 'GoldPilot 页面';
  const quickQuestions = PAGE_QUESTIONS[location.pathname] || [
    '这页当前展示了什么？',
    '当前页面有什么风险提示？',
    '下一步应该看什么？',
  ];

  const getPageAssistantContext = () => {
    const visibleText = document
      .querySelector('.app-content-inner')
      ?.textContent
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);

    return {
      pageTitle,
      path: location.pathname,
      capturedAt: new Date().toISOString(),
      visibleText: visibleText || '当前页面暂无可读取文本。',
    };
  };

  return (
    <div className="app-shell">
      <div className="flex-shrink-0">
        <Sidebar />
      </div>

      <div className="app-main">
        <Tabs />

        <main className="app-content">
          <div className="app-content-inner">
            <Outlet />
          </div>
        </main>
      </div>

      <PageAssistant
        pageTitle={pageTitle}
        context={getPageAssistantContext}
        quickQuestions={quickQuestions}
      />
    </div>
  );
}
