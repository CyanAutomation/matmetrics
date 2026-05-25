import { PluginErrorState } from '@/components/plugins/plugin-state';
import { helperA } from './helper-a';

export const helperB = () => {
  if (helperA) {
    return PluginErrorState({ message: 'boom' });
  }
  return null;
};
