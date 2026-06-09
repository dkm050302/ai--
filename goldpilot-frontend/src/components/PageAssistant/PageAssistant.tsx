import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button, Input, Space, Tooltip, Typography, message } from 'antd';
import { CloseOutlined, HolderOutlined, MessageOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { aiService, type PageAssistantMessage } from '@/services/ai';
import { trackAIQuestion } from '@/services/actionTracker';

const { Text } = Typography;
const { TextArea } = Input;

interface PageAssistantProps {
  pageTitle: string;
  context: unknown | (() => unknown);
  quickQuestions?: string[];
}

export function PageAssistant({ pageTitle, context, quickQuestions = [] }: PageAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [assistantSuggestions, setAssistantSuggestions] = useState<string[]>([]);
  const [messages, setMessages] = useState<PageAssistantMessage[]>([
    {
      role: 'assistant',
      content: '我在看当前页的数据。可以问我数据质量、策略筛选结果、参数修改和下一步复盘。',
    },
  ]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingQuestionRef = useRef('');
  const dragRef = useRef({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const visibleQuickQuestions = useMemo(() => {
    const defaults = [
      '这页当前最需要注意什么？',
      '当前数据有没有风险？',
      '下一步应该看什么？',
    ];

    return [...assistantSuggestions, ...quickQuestions, ...defaults]
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
      .slice(0, 4);
  }, [assistantSuggestions, quickQuestions]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.dragging || !rootRef.current) return;

      const rect = rootRef.current.getBoundingClientRect();
      const nextX = Math.min(Math.max(10, event.clientX - dragRef.current.offsetX), window.innerWidth - rect.width - 10);
      const nextY = Math.min(Math.max(10, event.clientY - dragRef.current.offsetY), window.innerHeight - rect.height - 10);
      setPosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      dragRef.current.dragging = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const resolveContext = () => (typeof context === 'function' ? context() : context);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!rootRef.current) return;

    const rect = rootRef.current.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setPosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  const ask = async (questionInput?: string) => {
    const question = String(questionInput ?? input).trim();
    if (!question || loading) return;

    trackAIQuestion(question, pageTitle);
    pendingQuestionRef.current = question;
    const nextMessages: PageAssistantMessage[] = [
      ...messages,
      { role: 'user', content: question },
    ];
    const assistantIndex = nextMessages.length;

    setMessages([...nextMessages, { role: 'assistant', content: '正在结合当前页面数据回答...' }]);
    setInput('');
    setLoading(true);
    setStatus('正在整理当前页面上下文...');

    try {
      let streamed = '';
      const result = await aiService.askPageAssistantStream({
        pageTitle,
        question,
        context: resolveContext(),
        history: nextMessages.slice(-8),
      }, {
        onStatus: setStatus,
        onToken: (token) => {
          streamed += token;
          setMessages((current) => current.map((item, index) => (
            index === assistantIndex ? { ...item, content: streamed } : item
          )));
        },
      });

      setAssistantSuggestions(result.suggestedQuestions || []);
      setMessages((current) => current.map((item, index) => (
        index === assistantIndex
          ? { ...item, content: `${result.answer}${result.mode === 'local' ? '\n\n（本地页面摘要）' : ''}` }
          : item
      )));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '页面助手暂时不可用');
      setMessages((current) => current.map((item, index) => (
        index === assistantIndex
          ? { ...item, content: `刚才的问题没有拿到结果：${pendingQuestionRef.current}。可以稍后再试，或者先查看当前页面里的数据和状态。` }
          : item
      )));
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <div
      ref={rootRef}
      className={`page-assistant ${open ? 'page-assistant-open' : ''}`}
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      {open && (
        <section className="page-assistant-panel" aria-label="页面小助手">
          <div className="page-assistant-head">
            <Space size={8}>
              <button
                className="page-assistant-drag-handle"
                type="button"
                onPointerDown={startDrag}
                aria-label="拖动页面小助手"
              >
                <HolderOutlined />
              </button>
              <RobotOutlined />
              <div>
                <strong>页面小助手</strong>
                <Text type="secondary">{pageTitle}</Text>
              </div>
            </Space>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setOpen(false)}
              aria-label="关闭页面小助手"
            />
          </div>

          <div className="page-assistant-messages">
            {messages.map((item, index) => (
              <div className={`page-assistant-message ${item.role}`} key={`${item.role}-${index}`}>
                <div>{item.content}</div>
              </div>
            ))}
            {loading && (
              <div className="page-assistant-message assistant">
                <div>{status || '正在结合当前页面数据回答...'}</div>
              </div>
            )}
          </div>

          <div className="page-assistant-quick">
            {visibleQuickQuestions.map((question) => (
              <button type="button" key={question} onClick={() => ask(question)} disabled={loading}>
                {question}
              </button>
            ))}
          </div>

          <div className="page-assistant-input">
            <TextArea
              value={input}
              autoSize={{ minRows: 1, maxRows: 3 }}
              placeholder="问当前页..."
              onChange={(event) => setInput(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  ask();
                }
              }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={loading}
              onClick={() => ask()}
              aria-label="发送问题"
            />
          </div>
        </section>
      )}

      <Tooltip title={open ? '收起页面小助手' : '问当前页'}>
        <Button
          className="page-assistant-toggle"
          type="primary"
          shape="circle"
          size="large"
          icon={<MessageOutlined />}
          onClick={() => setOpen((value) => !value)}
          onPointerDown={(event) => {
            if (event.altKey) startDrag(event);
          }}
          aria-label="打开页面小助手"
        />
      </Tooltip>
    </div>
  );
}
