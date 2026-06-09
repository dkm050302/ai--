import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { PageAssistant } from '@/components/PageAssistant';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Tabs } from '@/components/Tabs/Tabs';
import { authService } from '@/services/auth';
import { trackPageVisit, flushActions } from '@/services/actionTracker';

const PAGE_LABELS: Record<string, string> = {
  '/': '交易看板',
  '/ai-account': 'AI账号',
  '/manual-sim': '手动模拟账户',
  '/datasource-settings': '数据源设置',
  '/research-center': '量化策略实验室',
  '/admin': '测试管理',
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
  '/manual-sim': [
    '当前模拟账户风险在哪里？',
    '预下单什么时候会触发？',
    '这笔持仓应不应该先平仓？',
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
  '/admin': [
    '测试员们的整体活跃度如何？',
    '哪个测试员的交易表现最好？',
    '有什么需要关注的异常行为？',
  ],
};

// 不需要登录就能访问的页面
const PUBLIC_PAGES = ['/', '/event-driven'];

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = authService.isAuthenticated();
  const isPublicPage = PUBLIC_PAGES.includes(location.pathname);

  // 未登录且访问受保护页面时，跳转登录
  useEffect(() => {
    if (!isAuthenticated && !isPublicPage) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isPublicPage, navigate]);

  // 页面访问追踪
  useEffect(() => {
    if (isAuthenticated) {
      trackPageVisit(location.pathname);
    }
  }, [location.pathname, isAuthenticated]);

  // 页面卸载前刷新缓冲
  useEffect(() => {
    const handler = () => flushActions();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  if (!isAuthenticated && !isPublicPage) {
    return null;
  }

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
