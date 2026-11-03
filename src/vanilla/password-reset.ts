import type { ComponentController } from './component';
import { noticeHtml } from './notice';
import { mountTextField, textFieldHtml, type TextFieldProps } from './text-field';

export interface PasswordResetProps {
  token: string | null;
  hasError: boolean;
  configured: boolean;
  resetPassword: (token: string, password: string) => Promise<void>;
  errorMessage: (error: unknown) => string;
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const PASSWORD_HINT = `Use ${MIN_LENGTH} to ${MAX_LENGTH} characters.`;

function field(id: string, label: string): TextFieldProps {
  return { id, label, value: '', type: 'password', autoComplete: 'new-password', minLength: MIN_LENGTH, maxLength: MAX_LENGTH, required: true, onInput() {} };
}

export function passwordResetHtml(props: PasswordResetProps): string {
  if (!props.configured) return noticeHtml({ title: 'Password reset is unavailable', message: 'Authentication is not configured in this deployment.', tone: 'warning' });
  if (!props.token || props.hasError) return `${noticeHtml({ title: 'This password link is invalid or expired', message: 'Request a new password link from the sign-in screen.', tone: 'error' })}<a class="password-reset__link" href="/">Return to sign in</a>`;
  return `<form class="password-reset__form"><div data-reset-error></div><div data-reset-password>${textFieldHtml({ ...field('new-password', 'New password'), hint: PASSWORD_HINT })}</div><div data-reset-confirmation>${textFieldHtml({ ...field('confirm-password', 'Confirm password'), hint: 'Use at least 8 characters.' })}</div><button class="password-reset__submit" type="submit" disabled>Update password</button></form>`;
}

export function mountPasswordReset(host: HTMLElement, initial: PasswordResetProps): ComponentController<PasswordResetProps> {
  let props = initial;
  let password = '';
  let confirmation = '';
  let submitting = false;
  let destroyed = false;
  let generation = 0;
  let cleanup = () => {};

  function bind() {
    const form = host.querySelector<HTMLFormElement>('form');
    if (!form) { cleanup = () => {}; return; }
    const passwordHost = host.querySelector<HTMLElement>('[data-reset-password]')!;
    const confirmationHost = host.querySelector<HTMLElement>('[data-reset-confirmation]')!;
    const button = form.querySelector<HTMLButtonElement>('button')!;
    const error = form.querySelector<HTMLElement>('[data-reset-error]')!;
    const passwordProps = (): TextFieldProps => ({ ...field('new-password', 'New password'), hint: PASSWORD_HINT, value: password, onInput: value => { password = value; refresh(); } });
    const confirmationProps = (): TextFieldProps => ({ ...field('confirm-password', 'Confirm password'), value: confirmation, invalid: confirmation.length > 0 && password !== confirmation, hint: confirmation.length > 0 && password !== confirmation ? 'Passwords do not match.' : 'Use at least 8 characters.', onInput: value => { confirmation = value; refresh(); } });
    const passwordController = mountTextField(passwordHost, passwordProps());
    const confirmationController = mountTextField(confirmationHost, confirmationProps());
    function refresh() {
      passwordController.update(passwordProps());
      confirmationController.update(confirmationProps());
      button.disabled = submitting || password.length < MIN_LENGTH || password.length > MAX_LENGTH || password !== confirmation;
      button.textContent = submitting ? 'Updating password…' : 'Update password';
    }
    const submit = async (event: Event) => {
      event.preventDefault();
      if (submitting || !props.configured || props.hasError || !props.token || password.length < MIN_LENGTH || password.length > MAX_LENGTH || password !== confirmation) return;
      const currentGeneration = generation;
      submitting = true; error.innerHTML = ''; refresh();
      try {
        await props.resetPassword(props.token, password);
        if (destroyed || currentGeneration !== generation) return;
        cleanup();
        host.innerHTML = `${noticeHtml({ title: 'Password updated', message: 'Your password is ready. Sign in with it or use your passkey.', tone: 'neutral' })}<a class="password-reset__link" href="/">Return to MatMetrics</a>`;
      } catch (reason) {
        if (destroyed || currentGeneration !== generation) return;
        error.innerHTML = noticeHtml({ title: 'Could not reset your password', message: props.errorMessage(reason), tone: 'error' });
      } finally {
        if (!destroyed && currentGeneration === generation) { submitting = false; refresh(); }
      }
    };
    form.addEventListener('submit', submit);
    cleanup = () => { form.removeEventListener('submit', submit); passwordController.destroy(); confirmationController.destroy(); };
    refresh();
  }
  bind();
  return {
    update(next) {
      const changed = next.token !== props.token || next.hasError !== props.hasError || next.configured !== props.configured;
      props = next;
      if (changed) { generation++; cleanup(); password = ''; confirmation = ''; submitting = false; host.innerHTML = passwordResetHtml(props); bind(); }
    },
    destroy() { destroyed = true; generation++; cleanup(); },
  };
}
