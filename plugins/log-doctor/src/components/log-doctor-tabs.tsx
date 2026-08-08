import { Badge } from '@/components/ui/badge';
import { PluginTabs } from '@/components/plugins/plugin-tabs';

export function LogDoctorTabs({
  activeTab,
  attentionCount,
  onTabChange,
}: {
  activeTab: 'validation' | 'audit';
  attentionCount: number;
  onTabChange: (tabId: string) => void;
}) {
  return (
    <PluginTabs
      tabs={[
        { id: 'validation', label: 'File Validation' },
        {
          id: 'audit',
          label: 'Session Audit',
          badge:
            attentionCount > 0 ? (
              <Badge variant="destructive" className="ml-1">
                {attentionCount}
              </Badge>
            ) : undefined,
        },
      ]}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />
  );
}
