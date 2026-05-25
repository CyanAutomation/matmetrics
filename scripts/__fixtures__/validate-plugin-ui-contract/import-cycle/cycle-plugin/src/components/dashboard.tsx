import { PluginPageShell } from '@/components/plugins/plugin-page-shell';
import { PluginFormSection } from '@/components/plugins/plugin-kit';
import { PluginLoadingState } from '@/components/plugins/plugin-state';
import { helperA } from './helper-a';

export default function Dashboard() {
  return (
    <PluginPageShell title="Test" description="Test Dashboard">
      <PluginFormSection title="Form" />
      {helperA()}
      <PluginLoadingState description="Loading..." />
    </PluginPageShell>
  );
}
