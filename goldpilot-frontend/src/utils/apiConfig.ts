/**
 * API配置工具
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/';

/**
 * 获取完整的API URL
 */
export function getApiUrl(path: string): string {
  const baseUrl = API_BASE_URL.replace(/\/$/, ''); // 移除末尾的斜杠
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
