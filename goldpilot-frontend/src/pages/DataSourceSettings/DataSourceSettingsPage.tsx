import { DataSourceSettings } from '@/components/DataSourceSettings';

/**
 * 数据源设置页面
 */
export function DataSourceSettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <DataSourceSettings />
      </div>
    </div>
  );
}
