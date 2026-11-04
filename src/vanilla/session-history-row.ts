import { deferMenuDialogOpen } from '../lib/interaction';
import { getSessionNotePreview } from '../lib/session-history-format';
import {
  EFFORT_LABELS,
  type EffortLevel,
  type JudoSession,
  type SessionCategory,
} from '../lib/types';
import { formatDateLabel, parseDateOnly } from '../lib/utils';
import { actionChipListHtml, mountActionChipList } from './action-chip-list';
import { actionDisclosureHtml, mountActionDisclosure, type ActionDisclosureProps } from './action-disclosure';
import { badgeHtml, mountBadge, type BadgeVariant } from './badge';
import { escapeHtml, type ComponentController } from './component';
import { mountSessionDetails, sessionDetailsHtml } from './session-details';

export interface SessionHistoryRowProps {
  session: JudoSession;
  onDelete: (id: string) => void;
  onEdit: (session: JudoSession) => void;
  onFilterTechnique: (technique: string) => void;
  deletingSessionId: string | null;
  density: 'comfortable' | 'compact';
}

const categoryBadgeVariants: Record<SessionCategory, BadgeVariant> = {
  Technical: 'technical',
  Randori: 'randori',
  Shiai: 'shiai',
  Cardio: 'cardio',
  'S&C': 'strengthConditioning',
};

const effortBadgeVariants: Record<EffortLevel, BadgeVariant> = {
  1: 'effortEasy',
  2: 'effortLight',
  3: 'effortNormal',
  4: 'effortHard',
  5: 'effortIntense',
};

function getSessionDateLabels(session: JudoSession) {
  const date = parseDateOnly(session.date);
  return {
    short: formatDateLabel(date, 'weekday-month-day'),
    full: formatDateLabel(date, 'weekday-month-day-year'),
  };
}

function getActionProps(
  props: SessionHistoryRowProps,
  getLatestProps: () => SessionHistoryRowProps
): ActionDisclosureProps {
  const sessionDateLabel = getSessionDateLabels(props.session).full;
  return {
    label: 'Session actions',
    ariaLabel: `Actions for session from ${sessionDateLabel}`,
    triggerText: '',
    triggerIcon: 'more',
    className: 'ui-action-disclosure--menu',
    closeOnAction: true,
    options: [
      { value: 'edit', label: 'Edit session' },
      { value: 'delete', label: 'Delete session', tone: 'destructive', disabled: props.deletingSessionId === props.session.id },
    ],
    onAction(action) {
      const latest = getLatestProps();
      if (action === 'edit') deferMenuDialogOpen(() => latest.onEdit(latest.session));
      if (action === 'delete') deferMenuDialogOpen(() => latest.onDelete(latest.session.id));
    },
  };
}

function getTechniqueProps(props: SessionHistoryRowProps) {
  return {
    items: props.session.techniques,
    limit: 3,
    title: (technique: string) => `Show sessions tagged ${technique}`,
    onSelect: (technique: string) => props.onFilterTechnique(technique),
  };
}

function getDetailsProps(props: SessionHistoryRowProps) {
  return {
    description: props.session.description,
    notes: props.session.notes,
    videoUrl: props.session.videoUrl,
  };
}

function sessionBadgeHtml(
  label: string,
  variant: BadgeVariant,
  dataAttribute: 'data-session-category' | 'data-session-effort'
): string {
  return badgeHtml({ label, variant }).replace('data-ui-badge', `data-ui-badge ${dataAttribute}`);
}

export function sessionHistoryRowHtml(props: SessionHistoryRowProps): string {
  const { session } = props;
  const dateLabels = getSessionDateLabels(session);
  const category = session.category || 'Technical';
  const notePreview = getSessionNotePreview(session);
  const actions = getActionProps(props, () => props);

  return `<article class="ui-session-history-row ui-session-history-row--${props.density}" data-ui-session-history-row>
    <div class="ui-session-history-row__layout">
      <div class="ui-session-history-row__main">
        <div class="ui-session-history-row__date-line">
          <svg aria-hidden="true" class="ui-session-history-row__calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
          <div class="ui-session-history-row__date-content">
            <span class="ui-session-history-row__date" data-session-date>${escapeHtml(dateLabels.short)}</span>
            ${sessionBadgeHtml(category, categoryBadgeVariants[category], 'data-session-category')}
            <span class="ui-session-history-row__duration" data-session-duration${session.duration ? '' : ' hidden'}>${session.duration ? `${session.duration} min` : ''}</span>
          </div>
        </div>
        <div class="ui-session-history-row__techniques" data-session-techniques>${actionChipListHtml(getTechniqueProps(props))}</div>
        <p class="ui-session-history-row__note-preview${notePreview ? '' : ' ui-session-history-row__note-preview--empty'}" data-session-note-preview>${escapeHtml(notePreview)}</p>
      </div>
      <div class="ui-session-history-row__side">
        <div class="ui-session-history-row__effort">
          <span class="ui-session-history-row__effort-label">Effort</span>
          ${sessionBadgeHtml(EFFORT_LABELS[session.effort], effortBadgeVariants[session.effort], 'data-session-effort')}
        </div>
        <div data-session-actions>${actionDisclosureHtml(actions)}</div>
      </div>
    </div>
    <div data-session-details-host>${sessionDetailsHtml(getDetailsProps(props))}</div>
  </article>`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Session history row markup is missing ${selector}`);
  return element;
}

export function mountSessionHistoryRow(
  host: HTMLElement,
  initialProps: SessionHistoryRowProps
): ComponentController<SessionHistoryRowProps> {
  const row = requireElement<HTMLElement>(host, '[data-ui-session-history-row]');
  const date = requireElement<HTMLElement>(row, '[data-session-date]');
  const categoryBadgeElement = requireElement<HTMLElement>(row, '[data-session-category]');
  const duration = requireElement<HTMLElement>(row, '[data-session-duration]');
  const effortBadgeElement = requireElement<HTMLElement>(row, '[data-session-effort]');
  const notePreview = requireElement<HTMLElement>(row, '[data-session-note-preview]');
  const techniques = requireElement<HTMLElement>(row, '[data-session-techniques] .ui-action-chip-list');
  const detailsHost = requireElement<HTMLElement>(row, '[data-session-details-host]');
  const actionsElement = requireElement<HTMLDetailsElement>(row, '[data-session-actions] > .ui-action-disclosure');
  const categoryBadge = mountBadge(categoryBadgeElement, { label: initialProps.session.category || 'Technical', variant: categoryBadgeVariants[initialProps.session.category || 'Technical'] });
  const effortBadge = mountBadge(effortBadgeElement, { label: EFFORT_LABELS[initialProps.session.effort], variant: effortBadgeVariants[initialProps.session.effort] });
  const techniqueList = mountActionChipList(techniques, getTechniqueProps(initialProps));
  const details = mountSessionDetails(detailsHost, getDetailsProps(initialProps));

  let current = initialProps;
  const actions = mountActionDisclosure(actionsElement, getActionProps(initialProps, () => current));

  const update = (next: SessionHistoryRowProps) => {
    current = next;
    const nextDateLabels = getSessionDateLabels(next.session);
    const category = next.session.category || 'Technical';
    const nextNotePreview = getSessionNotePreview(next.session);

    row.classList.toggle('ui-session-history-row--comfortable', next.density === 'comfortable');
    row.classList.toggle('ui-session-history-row--compact', next.density === 'compact');
    if (date.textContent !== nextDateLabels.short) date.textContent = nextDateLabels.short;
    categoryBadge.update({ label: category, variant: categoryBadgeVariants[category] });
    duration.hidden = !next.session.duration;
    duration.textContent = next.session.duration ? `${next.session.duration} min` : '';
    effortBadge.update({ label: EFFORT_LABELS[next.session.effort], variant: effortBadgeVariants[next.session.effort] });
    notePreview.classList.toggle('ui-session-history-row__note-preview--empty', !nextNotePreview);
    notePreview.textContent = nextNotePreview;
    techniqueList.update(getTechniqueProps(next));
    details.update(getDetailsProps(next));
    actions.update(getActionProps(next, () => current));
  };

  update(initialProps);
  return {
    update,
    destroy() {
      actions.destroy();
      details.destroy();
      techniqueList.destroy();
      effortBadge.destroy();
      categoryBadge.destroy();
    },
  };
}
