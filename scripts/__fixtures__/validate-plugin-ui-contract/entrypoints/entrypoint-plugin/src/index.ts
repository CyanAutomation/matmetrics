import React from 'react';
import { registerPluginComponent } from '@/lib/plugins/plugin-component-registry';
import TsComponent from './components/ts-component';
import TsxComponent from './components/tsx-component';
import IndexComponent from './components/index-variant';

registerPluginComponent('tab-ts', () => React.createElement(TsComponent));
registerPluginComponent('tab-tsx', () => React.createElement(TsxComponent));
registerPluginComponent('tab-index', () => React.createElement(IndexComponent));
