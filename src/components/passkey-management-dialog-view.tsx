'use client';

import React from 'react';
import { Fingerprint, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type PasskeySummary = { id: string; name: string | null };

type PasskeyManagementDialogViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  betterAuthConfigured: boolean;
  passkeyEnrolmentEnabled: boolean;
  hasBetterAuthSession: boolean;
  userEmail: string | undefined;
  userEmailVerified: boolean;
  passkeys: PasskeySummary[];
  newName: string;
  setNewName: (name: string) => void;
  editingId: string | null;
  editingName: string;
  setEditingName: (name: string) => void;
  pendingId: string | null;
  isLoading: boolean;
  isSendingReset: boolean;
  passwordResetSent: boolean;
  isSendingVerification: boolean;
  verificationSent: boolean;
  error: string | null;
  onAdd: () => void;
  onPasswordReset: () => void;
  onEmailVerification: () => void;
  onBeginRename: (passkey: PasskeySummary) => void;
  onRename: (id: string) => void;
  onDelete: (passkey: PasskeySummary) => void;
};

function EmailVerificationSection({
  userEmail,
  isSendingVerification,
  verificationSent,
  onEmailVerification,
}: Pick<
  PasskeyManagementDialogViewProps,
  | 'userEmail'
  | 'isSendingVerification'
  | 'verificationSent'
  | 'onEmailVerification'
>) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">Verify your email</div>
      <p className="text-sm text-muted-foreground">
        Password sign-in requires a verified email address. We can send a
        verification link to {userEmail ?? 'your account'}.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onEmailVerification}
        disabled={isSendingVerification || !userEmail}
      >
        {isSendingVerification && <Loader2 className="h-4 w-4 animate-spin" />}
        Send verification email
      </Button>
      {verificationSent && (
        <p role="status" className="text-sm text-muted-foreground">
          If verification is needed, an email is on its way.
        </p>
      )}
    </div>
  );
}

function PasswordAccessSection({
  userEmail,
  isSendingReset,
  passwordResetSent,
  onPasswordReset,
}: Pick<
  PasskeyManagementDialogViewProps,
  'userEmail' | 'isSendingReset' | 'passwordResetSent' | 'onPasswordReset'
>) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">Password sign-in</div>
      <p className="text-sm text-muted-foreground">
        Send a secure link to set or reset the password for{' '}
        {userEmail ?? 'your account'}.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onPasswordReset}
        disabled={isSendingReset || !userEmail}
      >
        {isSendingReset && <Loader2 className="h-4 w-4 animate-spin" />}
        Email password link
      </Button>
      {passwordResetSent && (
        <p role="status" className="text-sm text-muted-foreground">
          If the address is eligible, a password link is on its way.
        </p>
      )}
    </div>
  );
}

function PasskeyItem({
  passkey,
  editing,
  editingName,
  setEditingName,
  pending,
  canRemove,
  onBeginRename,
  onRename,
  onDelete,
}: {
  passkey: PasskeySummary;
  editing: boolean;
  editingName: string;
  setEditingName: (name: string) => void;
  pending: boolean;
  canRemove: boolean;
  onBeginRename: (passkey: PasskeySummary) => void;
  onRename: (id: string) => void;
  onDelete: (passkey: PasskeySummary) => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border p-3">
      <Fingerprint className="h-4 w-4 shrink-0 text-primary" />
      {editing ? (
        <>
          <Input
            aria-label="Passkey name"
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
            maxLength={80}
          />
          <Button
            size="sm"
            onClick={() => onRename(passkey.id)}
            disabled={pending || !editingName.trim()}
          >
            Save
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {passkey.name}
          </span>
          <IconButton
            type="button"
            variant="ghost"
            label={`Rename ${passkey.name}`}
            onClick={() => onBeginRename(passkey)}
            icon={<Pencil aria-hidden="true" />}
          />
          <IconButton
            type="button"
            variant="ghost"
            label={`Remove ${passkey.name}`}
            title={
              canRemove ? undefined : 'Keep at least one passkey on your account'
            }
            disabled={!canRemove || pending}
            onClick={() => onDelete(passkey)}
            icon={
              pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" />
              )
            }
          />
        </>
      )}
    </li>
  );
}

function PasskeyList({
  passkeys,
  editingId,
  editingName,
  setEditingName,
  pendingId,
  onBeginRename,
  onRename,
  onDelete,
}: Pick<
  PasskeyManagementDialogViewProps,
  | 'passkeys'
  | 'editingId'
  | 'editingName'
  | 'setEditingName'
  | 'pendingId'
  | 'onBeginRename'
  | 'onRename'
  | 'onDelete'
>) {
  return (
    <ul className="space-y-2" aria-label="Registered passkeys">
      {passkeys.map((passkey) => (
        <PasskeyItem
          key={passkey.id}
          passkey={passkey}
          editing={editingId === passkey.id}
          editingName={editingName}
          setEditingName={setEditingName}
          pending={pendingId === passkey.id}
          canRemove={passkeys.length > 1}
          onBeginRename={onBeginRename}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function PasskeyInventory({
  isLoading,
  hasBetterAuthSession,
  passkeys,
  passkeyEnrolmentEnabled,
  ...listProps
}: Pick<
  PasskeyManagementDialogViewProps,
  | 'isLoading'
  | 'hasBetterAuthSession'
  | 'passkeys'
  | 'passkeyEnrolmentEnabled'
> &
  Pick<
    PasskeyManagementDialogViewProps,
    | 'editingId'
    | 'editingName'
    | 'setEditingName'
    | 'pendingId'
    | 'onBeginRename'
    | 'onRename'
    | 'onDelete'
  >) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading passkeys...
      </div>
    );
  }
  if (hasBetterAuthSession && passkeys.length > 0) {
    return <PasskeyList passkeys={passkeys} {...listProps} />;
  }
  if (hasBetterAuthSession) {
    return <p className="text-sm text-muted-foreground">No passkeys are registered yet.</p>;
  }
  if (passkeyEnrolmentEnabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a passkey as another sign-in method for this MatMetrics account.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Passkey enrolment is currently disabled.
    </p>
  );
}

function NewPasskeyForm({
  newName,
  setNewName,
  pendingId,
  onAdd,
}: Pick<
  PasskeyManagementDialogViewProps,
  'newName' | 'setNewName' | 'pendingId' | 'onAdd'
>) {
  return (
    <div className="space-y-2">
      <Label htmlFor="new-passkey-name">Name for the new passkey</Label>
      <div className="flex gap-2">
        <Input
          id="new-passkey-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="e.g. iPhone or YubiKey"
          maxLength={80}
        />
        <Button
          type="button"
          onClick={onAdd}
          disabled={pendingId === 'new'}
        >
          {pendingId === 'new' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="sr-only sm:not-sr-only">Add</span>
        </Button>
      </div>
    </div>
  );
}

export function PasskeyManagementDialogView(
  props: PasskeyManagementDialogViewProps
) {
  const {
    open,
    onOpenChange,
    betterAuthConfigured,
    passkeyEnrolmentEnabled,
    hasBetterAuthSession,
    userEmail,
    userEmailVerified,
    passkeys,
    newName,
    setNewName,
    editingId,
    editingName,
    setEditingName,
    pendingId,
    isLoading,
    isSendingReset,
    passwordResetSent,
    isSendingVerification,
    verificationSent,
    error,
    onAdd,
    onPasswordReset,
    onEmailVerification,
    onBeginRename,
    onRename,
    onDelete,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sign-in methods</DialogTitle>
          <DialogDescription>
            Use your password or a passkey to sign in. Add another passkey so
            you can still sign in if a device is lost.
          </DialogDescription>
        </DialogHeader>
        {!betterAuthConfigured ? (
          <p className="text-sm text-muted-foreground">
            Passkey management is not available in this deployment yet.
          </p>
        ) : (
          <div className="space-y-5">
            {!userEmailVerified && (
              <EmailVerificationSection
                userEmail={userEmail}
                isSendingVerification={isSendingVerification}
                verificationSent={verificationSent}
                onEmailVerification={onEmailVerification}
              />
            )}
            <PasswordAccessSection
              userEmail={userEmail}
              isSendingReset={isSendingReset}
              passwordResetSent={passwordResetSent}
              onPasswordReset={onPasswordReset}
            />
            <PasskeyInventory
              isLoading={isLoading}
              hasBetterAuthSession={hasBetterAuthSession}
              passkeys={passkeys}
              passkeyEnrolmentEnabled={passkeyEnrolmentEnabled}
              editingId={editingId}
              editingName={editingName}
              setEditingName={setEditingName}
              pendingId={pendingId}
              onBeginRename={onBeginRename}
              onRename={onRename}
              onDelete={onDelete}
            />
            {passkeyEnrolmentEnabled && hasBetterAuthSession && (
              <NewPasskeyForm
                newName={newName}
                setNewName={setNewName}
                pendingId={pendingId}
                onAdd={onAdd}
              />
            )}
            {passkeys.length === 1 && hasBetterAuthSession && (
              <p className="text-xs text-muted-foreground">
                Keep this passkey until another one has been added and tested.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
