import { Component, type ReactNode } from 'react';
import { Result, Button } from 'antd';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界组件
 * 捕获子组件中的JavaScript错误，显示友好错误页面
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    logger.error('Error Boundary caught an error:', error);
    logger.error('Error Info:', errorInfo);

    // 在开发环境打印完整错误信息
    if (import.meta.env.DEV) {
      console.error('Component Stack:', errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 如果有自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误页面
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4">
          <Result
            status="error"
            title="页面出现错误"
            subTitle="抱歉，页面遇到了一些问题。您可以尝试刷新页面或联系技术支持。"
            extra={[
              <Button type="primary" key="reset" onClick={this.handleReset}>
                重试
              </Button>,
              <Button key="reload" onClick={this.handleReload}>
                刷新页面
              </Button>,
            ]}
          >
            {import.meta.env.DEV && this.state.error && (
              <div className="text-left bg-gray-100 p-4 rounded mt-4 overflow-auto max-h-60">
                <p className="font-bold mb-2">错误详情（仅开发环境显示）：</p>
                <p className="text-red-600 font-mono text-sm">
                  {this.state.error.toString()}
                </p>
                <pre className="text-xs mt-2 text-gray-600">
                  {this.state.error.stack}
                </pre>
              </div>
            )}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}
