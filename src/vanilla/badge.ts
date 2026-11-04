import { escapeHtml, type ComponentController } from './component';

export const BADGE_VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'technical',
  'randori',
  'shiai',
  'cardio',
  'strengthConditioning',
  'effortEasy',
  'effortLight',
  'effortNormal',
  'effortHard',
  'effortIntense',
] as const;

export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const classNames: Record<BadgeVariant, string> = {
  default: 'default',
  secondary: 'secondary',
  destructive: 'destructive',
  outline: 'outline',
  technical: 'technical',
  randori: 'randori',
  shiai: 'shiai',
  cardio: 'cardio',
  strengthConditioning: 'strength-conditioning',
  effortEasy: 'effort-easy',
  effortLight: 'effort-light',
  effortNormal: 'effort-normal',
  effortHard: 'effort-hard',
  effortIntense: 'effort-intense',
};

function variantClass(variant: BadgeVariant = 'default'): string {
  return `ui-badge--${classNames[variant]}`;
}

export function badgeHtml(props: BadgeProps): string {
  return `<span class="ui-badge ${variantClass(props.variant)}" data-ui-badge>${escapeHtml(props.label)}</span>`;
}

export function mountBadge(
  element: HTMLElement,
  initialProps: BadgeProps
): ComponentController<BadgeProps> {
  const update = (props: BadgeProps) => {
    const nextClass = variantClass(props.variant);
    for (const variant of BADGE_VARIANTS) {
      const variantClassName = `ui-badge--${classNames[variant]}`;
      element.classList.toggle(variantClassName, nextClass === variantClassName);
    }
    if (element.textContent !== props.label) element.textContent = props.label;
  };

  update(initialProps);
  return { update, destroy() {} };
}
