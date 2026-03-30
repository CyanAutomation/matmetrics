import React from 'react';

import { cn } from '@/lib/utils';
import type {
  PluginRuntimeWarning,
  PluginUIContract,
  PluginUIContractState,
} from '@/lib/plugins/types';
import type { TabRenderContext } from '@/lib/navigation/tab-definitions';

export type PluginSurfaceRenderer = (
  context: TabRenderContext
) => React.ReactNode;

const SURFACE_LAYOUT_CLASSNAMES = {
  standard: 'mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 lg:px-8',
  wide: 'mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8',
} as const;

export const SUPPORTED_PLUGIN_SURFACE_LAYOUT_VARIANTS = Object.keys(
  SURFACE_LAYOUT_CLASSNAMES
) as Array<keyof typeof SURFACE_LAYOUT_CLASSNAMES>;

export const isSupportedPluginSurfaceLayoutVariant = (
  layoutVariant: string
): layoutVariant is keyof typeof SURFACE_LAYOUT_CLASSNAMES =>
  layoutVariant in SURFACE_LAYOUT_CLASSNAMES;

const UX_STATE_HELPER_NAMES: Record<
  PluginUIContractState,
  ReadonlySet<string>
> = {
  loading: new Set(['PluginLoadingState']),
  error: new Set(['PluginErrorState']),
  empty: new Set(['PluginEmptyState']),
  destructive: new Set(['PluginConfirmationDialog']),
};

const extractElementTypeName = (element: React.ReactElement): string | null => {
  const elementType = element.type as
    | string
    | {
        displayName?: string;
        name?: string;
        render?: { displayName?: string; name?: string };
      };

  if (typeof elementType === 'string') {
    return elementType;
  }

  return (
    elementType.displayName ??
    elementType.name ??
    elementType.render?.displayName ??
    elementType.render?.name ??
    null
  );
};

const collectRenderedHelperNames = (node: React.ReactNode): Set<string> => {
  const names = new Set<string>();

  const walk = (value: React.ReactNode): void => {
    if (value == null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!React.isValidElement<{ children?: React.ReactNode }>(value)) {
      return;
    }

    const typeName = extractElementTypeName(value);
    if (typeName) {
      names.add(typeName);
    }

    const childNodes = value.props.children;
    if (childNodes !== undefined && childNodes !== null) {
      walk(childNodes);
    }
  };

  walk(node);
  return names;
};

const resolveLayoutClassName = (
  uiContract: PluginUIContract | undefined,
  pluginId: string,
  extensionId: string
): { className: string; warnings: PluginRuntimeWarning[] } => {
  const layoutVariant = uiContract?.layoutVariant ?? 'standard';

  if (isSupportedPluginSurfaceLayoutVariant(layoutVariant)) {
    return {
      className:
        SURFACE_LAYOUT_CLASSNAMES[
          layoutVariant as keyof typeof SURFACE_LAYOUT_CLASSNAMES
        ],
      warnings: [],
    };
  }

  return {
    className: SURFACE_LAYOUT_CLASSNAMES.standard,
    warnings: [
      {
        code: 'dashboard_tab_surface_layout_variant_unknown',
        severity: 'warning',
        path: `plugins.${pluginId}.uiContract.layoutVariant`,
        message: `Dashboard extension "${extensionId}" declares unknown layoutVariant "${layoutVariant}". Falling back to "standard" shell layout.`,
        pluginId,
        extensionId,
      },
    ],
  };
};

const buildMissingUxStateWarnings = (
  renderedNode: React.ReactNode,
  uiContract: PluginUIContract | undefined,
  pluginId: string,
  extensionId: string
): PluginRuntimeWarning[] => {
  if (!uiContract?.requiredUxStates?.length) {
    return [];
  }

  const renderedHelperNames = collectRenderedHelperNames(renderedNode);

  return uiContract.requiredUxStates.flatMap((requiredState) => {
    const stateHelpers = UX_STATE_HELPER_NAMES[requiredState];
    if (!stateHelpers) {
      return [];
    }

    const matched = [...stateHelpers].some((helperName) =>
      renderedHelperNames.has(helperName)
    );

    if (matched) {
      return [];
    }

    return [
      {
        code: 'dashboard_tab_required_ux_state_helper_missing',
        severity: 'warning',
        path: `plugins.${pluginId}.uiContract.requiredUxStates`,
        message: `Dashboard extension "${extensionId}" requires "${requiredState}" UX state but did not render expected helper component(s): ${[
          ...stateHelpers,
        ].join(', ')}.`,
        pluginId,
        extensionId,
      } satisfies PluginRuntimeWarning,
    ];
  });
};

const buildMissingDesignTokenVariantWarnings = (
  uiContract: PluginUIContract | undefined,
  pluginId: string,
  extensionId: string
): PluginRuntimeWarning[] => {
  if (uiContract?.designTokenVariants?.length) {
    return [];
  }

  return [
    {
      code: 'dashboard_tab_design_token_variants_missing',
      severity: 'warning',
      path: `plugins.${pluginId}.uiContract.designTokenVariants`,
      message: `Dashboard extension "${extensionId}" should declare uiContract.designTokenVariants to document shared token usage and prevent style drift.`,
      pluginId,
      extensionId,
    },
  ];
};

const emitPluginSurfaceWarning = (
  warning: PluginRuntimeWarning,
  onWarning?: (warning: PluginRuntimeWarning) => void
): void => {
  onWarning?.(warning);
  console.warn('Plugin runtime warning', warning);
};

export const createPluginSurfaceRenderer = ({
  pluginId,
  extensionId,
  uiContract,
  renderer,
  onWarning,
}: {
  pluginId: string;
  extensionId: string;
  uiContract?: PluginUIContract;
  renderer: PluginSurfaceRenderer;
  onWarning?: (warning: PluginRuntimeWarning) => void;
}): PluginSurfaceRenderer => {
  const layoutResult = resolveLayoutClassName(
    uiContract,
    pluginId,
    extensionId
  );
  layoutResult.warnings.forEach((warning) =>
    emitPluginSurfaceWarning(warning, onWarning)
  );

  const PluginSurfaceRendererWithLayout: PluginSurfaceRenderer =
    function PluginSurfaceRendererWithLayout(context) {
      const renderedNode = renderer(context);
      const designTokenVariantWarnings = buildMissingDesignTokenVariantWarnings(
        uiContract,
        pluginId,
        extensionId
      );
      const runtimeWarnings = buildMissingUxStateWarnings(
        renderedNode,
        uiContract,
        pluginId,
        extensionId
      );
      designTokenVariantWarnings.forEach((warning) =>
        emitPluginSurfaceWarning(warning, onWarning)
      );
      runtimeWarnings.forEach((warning) =>
        emitPluginSurfaceWarning(warning, onWarning)
      );

      return React.createElement(
        'div',
        {
          className: cn(layoutResult.className),
          'data-plugin-surface': `${pluginId}:${extensionId}`,
          'data-layout-variant': uiContract?.layoutVariant ?? 'standard',
        },
        renderedNode
      );
    };

  return PluginSurfaceRendererWithLayout;
};

export const getPluginSurfaceLayoutClassName = (
  layoutVariant: string | undefined
): string =>
  layoutVariant && isSupportedPluginSurfaceLayoutVariant(layoutVariant)
    ? SURFACE_LAYOUT_CLASSNAMES[
        layoutVariant as keyof typeof SURFACE_LAYOUT_CLASSNAMES
      ]
    : SURFACE_LAYOUT_CLASSNAMES.standard;
