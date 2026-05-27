import { useState, useEffect } from 'react';

interface DataSource {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * 数据源设置组件
 */
export function DataSourceSettings() {
  const [currentSource, setCurrentSource] = useState<string>('eastmoney');
  const [availableSources, setAvailableSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 加载数据源列表和当前数据源
  useEffect(() => {
    loadDataSources();
  }, []);

  const loadDataSources = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';

      // 并行获取当前数据源和可用数据源列表
      const [currentRes, sourcesRes] = await Promise.all([
        fetch(`${apiUrl}/api/datasource`),
        fetch(`${apiUrl}/api/datasources`),
      ]);

      if (!currentRes.ok || !sourcesRes.ok) {
        throw new Error('加载数据源失败');
      }

      const currentData = await currentRes.json();
      const sourcesData = await sourcesRes.json();

      if (currentData.success) {
        setCurrentSource(currentData.data.currentSource);
      }

      if (sourcesData.success) {
        setAvailableSources(sourcesData.data.dataSources);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据源失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = async (sourceId: string) => {
    try {
      setSwitching(true);
      setError(null);
      setSuccess(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';

      const response = await fetch(`${apiUrl}/api/datasource`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: sourceId }),
      });

      if (!response.ok) {
        throw new Error('切换数据源失败');
      }

      const data = await response.json();

      if (data.success) {
        setCurrentSource(data.data.currentSource);
        setSuccess(`已切换到 ${availableSources.find(s => s.id === sourceId)?.name}`);

        // 3秒后清除成功消息
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换数据源失败');
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">数据源设置</h2>
        <p className="text-gray-600 text-sm">选择黄金价格数据的来源</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700">
          {success}
        </div>
      )}

      <div className="space-y-3">
        {availableSources.map((source) => (
          <div
            key={source.id}
            className={`border rounded-lg p-4 transition-all cursor-pointer ${
              currentSource === source.id
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300'
            } ${!source.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => source.enabled && !switching && handleSourceChange(source.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id={`source-${source.id}`}
                    name="datasource"
                    checked={currentSource === source.id}
                    onChange={() => handleSourceChange(source.id)}
                    disabled={!source.enabled || switching}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label
                    htmlFor={`source-${source.id}`}
                    className={`font-medium cursor-pointer ${
                      currentSource === source.id ? 'text-blue-700' : 'text-gray-900'
                    }`}
                  >
                    {source.name}
                  </label>
                  {currentSource === source.id && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      当前使用
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600 ml-7">{source.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-2">数据源说明</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• <strong>模拟数据</strong>：用于演示的生成数据，价格为美元/盎司</li>
          <li>• <strong>东方财富</strong>：中国东方财富网API数据</li>
          <li>• <strong>新浪黄金</strong>：新浪财经国际黄金API数据</li>
        </ul>
      </div>
    </div>
  );
}
