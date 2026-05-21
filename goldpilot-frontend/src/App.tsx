import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { router } from '@/router';
import './index.css';

function Root() {
  return <RouterProvider router={router} />;
}

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1769e0',
        },
      }}
    >
      <App>
        <Root />
      </App>
    </ConfigProvider>
  );
}

export default App;
