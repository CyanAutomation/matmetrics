/**
 * Plugin Interface and Guidelines
 *
 * This file documents the contract that all plugins must follow.
 */

import type { registerPluginComponent } from '@/lib/plugins/dashboard-tab-adapters';

/**
 * Plugin Initialization Context
 *
 * This context object is passed to the plugin's initPlugin function.
 * It provides methods for the plugin to register itself with the system.
 */
export type PluginInitContext = {
  /**
   * Legacy register function (currently unused)
   */
  register: () => undefined;

  /**
   * Register a component renderer for a dashboard tab
   *
   * @example
   * registerPluginComponent('my_component', (context) => {
   *   return <MyComponent sessionId={context.sessionId} />;
   * });
   */
  registerPluginComponent: typeof registerPluginComponent;
};

/**
 * Plugin Initializer Function
 *
 * Each plugin should export this function from its src/index.ts file.
 * The function receives a PluginInitContext object and should register
 * any components or handlers needed for the plugin to function.
 *
 * @example
 * export const initPlugin = (context: PluginInitContext) => {
 *   context.registerPluginComponent('my-component', (tabContext) => {
 *     return <MyComponent />;
 *   });
 * };
 */
export type PluginInitializerFunction = (
  context: PluginInitContext
) => void | Promise<void>;

/**
 * Plugin Manifest Structure
 *
 * Each plugin must have a plugin.json file in its root directory.
 * This manifest describes the plugin to the system.
 *
 * @example
 * {
 *   "id": "my-plugin",
 *   "name": "My Custom Plugin",
 *   "version": "1.0.0",
 *   "description": "A custom plugin that extends matmetrics",
 *   "capabilities": ["tag_mutation"],
 *   "minVersion": "0.1.0",
 *   "author": "Your Name",
 *   "homepage": "https://example.com",
 *   "settings": {},
 *   "enabled": true,
 *   "uiExtensions": [
 *     {
 *       "type": "dashboard_tab",
 *       "id": "my-plugin-tab",
 *       "title": "My Custom Tab",
 *       "config": {
 *         "tabId": "my-plugin",
 *         "headerTitle": "My Custom Tab",
 *         "component": "my-component",
 *         "icon": "star"
 *       }
 *     }
 *   ]
 * }
 */
export type PluginManifestJson = {
  /** Unique identifier for the plugin (lowercase, hyphens) */
  id: string;

  /** Display name of the plugin */
  name: string;

  /** Semantic version (X.Y.Z) */
  version: string;

  /** Description of what the plugin does */
  description: string;

  /** Capabilities required by the plugin's extensions */
  capabilities?: string[];

  /** Minimum matmetrics version required to run this plugin */
  minVersion?: string;

  /** Author name */
  author?: string;

  /** Plugin homepage URL */
  homepage?: string;

  /** Plugin-specific settings */
  settings?: Record<string, unknown>;

  /** Whether the plugin is enabled by default */
  enabled?: boolean;

  /** UI extensions provided by the plugin */
  uiExtensions: Array<{
    type: 'dashboard_tab' | 'menu_item' | 'session_action' | 'settings_panel';
    id: string;
    title: string;
    config: Record<string, unknown>;
  }>;
};

/**
 * Creating a New Plugin
 *
 * 1. Create a new directory under plugins/: plugins/my-plugin/
 *
 * 2. Create the following structure:
 *    plugins/my-plugin/
 *    ├── plugin.json          # Plugin manifest
 *    └── src/
 *        └── index.ts         # Plugin initializer
 *        └── MyComponent.tsx  # React components
 *
 * 3. Write your plugin.json manifest
 *
 * 4. Export initPlugin from src/index.ts:
 *    export const initPlugin = (context: PluginInitContext) => {
 *      context.registerPluginComponent('my-component', (tabContext) => {
 *        return <MyComponent />;
 *      });
 *    };
 *
 * 5. Add the plugin initialization to src/lib/plugins/plugin-component-bootstrap.ts
 *    in the initializePluginsStatically function
 *
 * 6. The plugin will be automatically discovered and loaded when the app starts
 */
