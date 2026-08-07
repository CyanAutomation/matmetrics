import { PluginErrorState } from '@/components/plugins/plugin-state';
import { checkFunctionType } from './shared';

export const helperB = () => {
  if (checkFunctionType(helperB)) {
    return PluginErrorState({ message: 'boom' });
  }
  return null;
};
