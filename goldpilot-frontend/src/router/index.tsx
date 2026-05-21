import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { Home } from '@/pages/Home/Home';
import { MT4Account } from '@/pages/MT4Account/MT4Account';
import { AIAccount } from '@/pages/AIAccount/AIAccount';
import { Login } from '@/pages/Login/Login';

// 受保护的路由组件
function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace state={{ from: { pathname: window.location.pathname } }} />;
  }
  return children;
}

// 公开路由组件（未登录时显示，已登录跳转到首页）
function PublicRoute({ children }: { children: React.ReactElement }) {
  const token = localStorage.getItem('token');
  if (token) {
    return <Navigate to="/mt4-account" replace />;
  }
  return children;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicRoute>
        <Login />
      </PublicRoute>
    ),
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        ),
      },
      {
        path: 'mt4-account',
        element: (
          <ProtectedRoute>
            <MT4Account />
          </ProtectedRoute>
        ),
      },
      {
        path: 'ai-account',
        element: (
          <ProtectedRoute>
            <AIAccount />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
