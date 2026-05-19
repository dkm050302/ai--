/**
 * API配置工具
 */
const isDev = import.meta.env.DEV;
export const API_BASE_URL = isDev
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3006')
  : '';

/**
 * 获取完整的API URL
 */
export function getApiUrl(path: string): string {
  if (!API_BASE_URL) {
    // 生产环境：使用相对路径
    return path.startsWith('/') ? path : `/${path}`;
  }
  // 开发环境：使用完整URL
  const baseUrl = API_BASE_URL.replace(/\/$/, '');
  const apiPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${apiPath}`;
}

/**
 * 带认证的fetch请求
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  return fetch(getApiUrl(url), {
    ...options,
    headers,
  });
}
