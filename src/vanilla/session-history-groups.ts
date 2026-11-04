import type { JudoSession } from '../lib/types';
import { escapeHtml, type ComponentController } from './component';
import {
  mountSessionHistoryRow,
  sessionHistoryRowHtml,
  validateSessionHistoryRow,
  type SessionHistoryRowProps,
} from './session-history-row';
import { surfaceClassName } from './surface';

export interface SessionHistoryMonthGroup {
  monthLabel: string;
  sessions: JudoSession[];
}

export interface SessionHistoryGroupsProps {
  grouped: SessionHistoryMonthGroup[];
  filteredSessions: JudoSession[];
  deletingSessionId: string | null;
  density: 'comfortable' | 'compact';
  semanticSearchActive: boolean;
  onRequestDelete: (session: JudoSession) => void;
  onEditSession: (session: JudoSession) => void;
  onFilterTechnique: (technique: string) => void;
}

interface MountedRow {
  host: HTMLElement;
  controller: ComponentController<SessionHistoryRowProps>;
}

interface ValidatedMountedTree {
  list: HTMLElement;
  groups: Map<string, HTMLElement>;
  rows: Map<string, HTMLElement>;
}

const noTextMatchesMessage = 'No sessions match these filters.';
const noSemanticMatchesMessage =
  'JEV found no likely sessions among the candidates checked.';

function rowProps(
  session: JudoSession,
  props: SessionHistoryGroupsProps
): SessionHistoryRowProps {
  return {
    session,
    onDelete: () => props.onRequestDelete(session),
    onEdit: props.onEditSession,
    onFilterTechnique: props.onFilterTechnique,
    deletingSessionId: props.deletingSessionId,
    density: props.density,
  };
}

function validateProps(props: SessionHistoryGroupsProps): void {
  const monthLabels = new Set<string>();
  const sessionIds = new Set<string>();

  for (const group of props.grouped) {
    if (!group.monthLabel.trim()) {
      throw new Error('Session history month labels must not be empty.');
    }
    if (monthLabels.has(group.monthLabel)) {
      throw new Error('Session history month labels must be unique.');
    }
    monthLabels.add(group.monthLabel);

    for (const session of group.sessions) {
      if (!session.id) {
        throw new Error('Session history session ids must not be empty.');
      }
      if (sessionIds.has(session.id)) {
        throw new Error('Session history session ids must be unique.');
      }
      sessionIds.add(session.id);
    }
  }

  const filteredIds = new Set(props.filteredSessions.map(({ id }) => id));
  if (filteredIds.size !== props.filteredSessions.length) {
    throw new Error('Session history filtered session ids must be unique.');
  }
  if (
    filteredIds.size !== sessionIds.size ||
    Array.from(sessionIds).some((id) => !filteredIds.has(id))
  ) {
    throw new Error(
      'Session history grouped and filtered sessions must contain the same ids.'
    );
  }
}

function emptyTitle(props: SessionHistoryGroupsProps): string {
  return props.semanticSearchActive
    ? noSemanticMatchesMessage
    : noTextMatchesMessage;
}

function emptyDescription(props: SessionHistoryGroupsProps): string {
  return props.semanticSearchActive
    ? 'Try another query or broaden the date, type, or effort filters.'
    : 'Try a different technique, date range, or effort level.';
}

function emptyHtml(props: SessionHistoryGroupsProps): string {
  return `<div class="ui-session-history-groups__empty" data-session-history-empty role="status">
    <p class="ui-session-history-groups__empty-title" data-session-history-empty-title>${escapeHtml(emptyTitle(props))}</p>
    <p class="ui-session-history-groups__empty-description" data-session-history-empty-description>${escapeHtml(emptyDescription(props))}</p>
  </div>`;
}

function sessionRowHtml(
  session: JudoSession,
  props: SessionHistoryGroupsProps
): string {
  return `<div class="ui-session-history-groups__row" data-session-id="${escapeHtml(session.id)}">${sessionHistoryRowHtml(rowProps(session, props))}</div>`;
}

function groupHtml(
  group: SessionHistoryMonthGroup,
  props: SessionHistoryGroupsProps
): string {
  const surfaceClasses = surfaceClassName({ variant: 'subtle', padding: 'sm' });
  return `<section class="ui-session-history-groups__group" aria-label="${escapeHtml(group.monthLabel)}" data-session-history-group="${escapeHtml(group.monthLabel)}">
    <h3 class="ui-session-history-groups__heading">${escapeHtml(group.monthLabel)}</h3>
    <div class="${surfaceClasses} ui-session-history-groups__surface" data-session-history-group-surface>
      ${group.sessions.map((session) => sessionRowHtml(session, props)).join('')}
    </div>
  </section>`;
}

/** Render a reusable grouped list of session history rows. */
export function sessionHistoryGroupsHtml(
  props: SessionHistoryGroupsProps
): string {
  validateProps(props);
  const empty = props.filteredSessions.length === 0;
  return `<div class="ui-session-history-groups" data-ui-session-history-groups>
    ${empty ? emptyHtml(props) : ''}
    <div class="ui-session-history-groups__list" data-session-history-list>
      ${props.grouped.map((group) => groupHtml(group, props)).join('')}
    </div>
  </div>`;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Session history group markup is missing ${selector}`);
  }
  return element;
}

function rootFor(host: HTMLElement): HTMLElement {
  if (host.matches('[data-ui-session-history-groups]')) return host;
  return requireElement<HTMLElement>(host, '[data-ui-session-history-groups]');
}

function validateMountedTree(
  root: HTMLElement,
  props: SessionHistoryGroupsProps
): ValidatedMountedTree {
  const groups = new Map<string, HTMLElement>();
  const rows = new Map<string, HTMLElement>();
  const list = requireElement<HTMLElement>(root, '[data-session-history-list]');
  const groupElements = Array.from(
    list.querySelectorAll<HTMLElement>(':scope > [data-session-history-group]')
  );

  if (groupElements.length !== props.grouped.length) {
    throw new Error('Session history group markup does not match its props.');
  }

  for (const group of props.grouped) {
    const groupElement = groupElements.find(
      (element) => element.dataset.sessionHistoryGroup === group.monthLabel
    );
    if (!groupElement) {
      throw new Error(
        `Session history group markup is missing ${group.monthLabel}.`
      );
    }
    groups.set(group.monthLabel, groupElement);
    requireElement<HTMLHeadingElement>(groupElement, 'h3');
    const surface = requireElement<HTMLElement>(
      groupElement,
      '[data-session-history-group-surface]'
    );

    for (const rowHost of Array.from(
      surface.querySelectorAll<HTMLElement>(':scope > [data-session-id]')
    )) {
      const id = rowHost.dataset.sessionId;
      if (!id || rows.has(id)) {
        throw new Error('Session history group markup has an invalid row id.');
      }
      rows.set(id, rowHost);
    }
  }

  const expectedSessions = props.grouped.flatMap(({ sessions }) => sessions);
  if (rows.size !== expectedSessions.length) {
    throw new Error('Session history group markup does not match its rows.');
  }

  for (const session of expectedSessions) {
    const rowHost = rows.get(session.id);
    if (!rowHost) {
      throw new Error(
        `Session history group markup is missing a row for ${session.id}`
      );
    }
    validateSessionHistoryRow(rowHost);
  }

  return { list, groups, rows };
}

function createGroup(
  document: Document,
  monthLabel: string
): HTMLElement {
  const group = document.createElement('section');
  group.className = 'ui-session-history-groups__group';
  group.setAttribute('aria-label', monthLabel);
  group.dataset.sessionHistoryGroup = monthLabel;

  const heading = document.createElement('h3');
  heading.className = 'ui-session-history-groups__heading';
  heading.textContent = monthLabel;
  group.append(heading);

  const surface = document.createElement('div');
  surface.className = `${surfaceClassName({ variant: 'subtle', padding: 'sm' })} ui-session-history-groups__surface`;
  surface.dataset.sessionHistoryGroupSurface = '';
  group.append(surface);
  return group;
}

function groupSurface(group: HTMLElement): HTMLElement {
  return requireElement<HTMLElement>(group, '[data-session-history-group-surface]');
}

function createRow(
  document: Document,
  session: JudoSession,
  props: SessionHistoryGroupsProps
): MountedRow {
  const rowHost = document.createElement('div');
  rowHost.className = 'ui-session-history-groups__row';
  rowHost.dataset.sessionId = session.id;
  rowHost.innerHTML = sessionHistoryRowHtml(rowProps(session, props));
  return {
    host: rowHost,
    controller: mountSessionHistoryRow(rowHost, rowProps(session, props)),
  };
}

function updateEmptyMessage(
  root: HTMLElement,
  props: SessionHistoryGroupsProps
): void {
  let message = root.querySelector<HTMLElement>('[data-session-history-empty]');
  if (props.filteredSessions.length > 0) {
    message?.remove();
    return;
  }

  if (!message) {
    message = root.ownerDocument.createElement('div');
    message.className = 'ui-session-history-groups__empty';
    message.dataset.sessionHistoryEmpty = '';
    message.setAttribute('role', 'status');
    const title = root.ownerDocument.createElement('p');
    title.className = 'ui-session-history-groups__empty-title';
    title.dataset.sessionHistoryEmptyTitle = '';
    message.append(title);
    const description = root.ownerDocument.createElement('p');
    description.className = 'ui-session-history-groups__empty-description';
    description.dataset.sessionHistoryEmptyDescription = '';
    message.append(description);
  }
  requireElement<HTMLElement>(message, '[data-session-history-empty-title]').textContent =
    emptyTitle(props);
  requireElement<HTMLElement>(
    message,
    '[data-session-history-empty-description]'
  ).textContent = emptyDescription(props);
  root.prepend(message);
}

/** Mount and reconcile grouped rows while preserving existing row DOM. */
export function mountSessionHistoryGroups(
  host: HTMLElement,
  initialProps: SessionHistoryGroupsProps
): ComponentController<SessionHistoryGroupsProps> {
  validateProps(initialProps);
  const root = rootFor(host);
  const initialTree = validateMountedTree(root, initialProps);
  const list = initialTree.list;
  const rows = new Map<string, MountedRow>();

  try {
    for (const session of initialProps.grouped.flatMap(
      ({ sessions }) => sessions
    )) {
      const rowHost = initialTree.rows.get(session.id)!;
      rows.set(session.id, {
        host: rowHost,
        controller: mountSessionHistoryRow(rowHost, rowProps(session, initialProps)),
      });
    }
  } catch (error) {
    for (const row of rows.values()) row.controller.destroy();
    throw error;
  }

  let groups = initialTree.groups;
  let destroyed = false;

  const update = (next: SessionHistoryGroupsProps): void => {
    if (destroyed) return;
    validateProps(next);

    const activeElement = root.ownerDocument.activeElement;
    const view = root.ownerDocument.defaultView;
    const restoreFocus =
      activeElement &&
      view &&
      activeElement instanceof view.HTMLElement &&
      root.contains(activeElement)
        ? activeElement
        : null;
    const nextGroups = new Map<string, HTMLElement>();
    const nextIds = new Set<string>();
    let previousGroup: HTMLElement | null = null;

    for (const month of next.grouped) {
      let group = groups.get(month.monthLabel);
      if (!group) group = createGroup(root.ownerDocument, month.monthLabel);
      group.setAttribute('aria-label', month.monthLabel);
      group.querySelector('h3')!.textContent = month.monthLabel;
      const surface = groupSurface(group);
      let rowIndex = 0;

      for (const session of month.sessions) {
        nextIds.add(session.id);
        let row = rows.get(session.id);
        if (!row) {
          row = createRow(root.ownerDocument, session, next);
          rows.set(session.id, row);
        } else {
          row.controller.update(rowProps(session, next));
        }
        const currentRow = surface.children.item(rowIndex);
        if (currentRow !== row.host) {
          surface.insertBefore(row.host, currentRow);
        }
        rowIndex += 1;
      }

      const reference: Element | null = previousGroup
        ? previousGroup.nextElementSibling
        : list.firstElementChild;
      if (reference !== group) list.insertBefore(group, reference);
      previousGroup = group;
      nextGroups.set(month.monthLabel, group);
    }

    for (const [id, row] of rows) {
      if (nextIds.has(id)) continue;
      row.controller.destroy();
      row.host.remove();
      rows.delete(id);
    }

    for (const [label, group] of groups) {
      if (!nextGroups.has(label)) group.remove();
    }

    groups = nextGroups;
    updateEmptyMessage(root, next);
    if (
      restoreFocus &&
      root.contains(restoreFocus) &&
      root.ownerDocument.activeElement !== restoreFocus
    ) {
      restoreFocus.focus({ preventScroll: true });
    }
  };

  update(initialProps);
  return {
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const row of rows.values()) row.controller.destroy();
      rows.clear();
    },
  };
}
