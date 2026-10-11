import { PasswordResetScreen } from '@/components/password-reset-screen';

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
    error?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token, error } = await searchParams;

  return <PasswordResetScreen token={token ?? null} hasError={Boolean(error)} />;
}
