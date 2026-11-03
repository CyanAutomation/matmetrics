export interface GuestWorkspaceNoticeProps {
  workspaceLabel: string;
  message: string;
  signInButtonText: string;
  onSignIn: () => void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** The same escaped HTML can be rendered on the server or mounted in the browser. */
export function guestWorkspaceNoticeHtml(props: GuestWorkspaceNoticeProps): string {
  return `<section role="status" class="guest-notice">
    <svg class="guest-notice__icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>
    <div class="guest-notice__content"><div class="guest-notice__heading"><p>Guest access is active</p><span data-notice-label>${escapeHtml(props.workspaceLabel)}</span></div>
      <details class="guest-notice__details"><summary>About this workspace</summary><p data-notice-message>${escapeHtml(props.message)}</p></details>
    </div><button class="guest-notice__button" type="button" data-notice-sign-in>${escapeHtml(props.signInButtonText)}</button>
  </section>`;
}

/** Attach behavior to server-rendered markup. The host owns the markup's lifetime. */
export function mountGuestWorkspaceNotice(host: HTMLElement, props: GuestWorkspaceNoticeProps) {
  const label = host.querySelector<HTMLElement>('[data-notice-label]');
  const message = host.querySelector<HTMLElement>('[data-notice-message]');
  const button = host.querySelector<HTMLButtonElement>('[data-notice-sign-in]');
  if (!label || !message || !button) throw new Error('Guest notice markup is incomplete');
  let current = props;
  const handleClick = () => current.onSignIn();
  button.addEventListener('click', handleClick);
  return {
    update(next: GuestWorkspaceNoticeProps) {
      current = next;
      label.textContent = next.workspaceLabel;
      message.textContent = next.message;
      button.textContent = next.signInButtonText;
    },
    destroy() { button.removeEventListener('click', handleClick); },
  };
}
