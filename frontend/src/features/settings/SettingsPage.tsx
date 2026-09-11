import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api/client';
import type { Profile } from '../../lib/api/types';
import { useAuth } from '../../lib/auth-context';
import { errorMessage } from '../../lib/error-message';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<Profile>('/users/me') });
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateProfile = useMutation({
    mutationFn: (name: string) => api.patch<Profile>('/users/me', { displayName: name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(errorMessage(err, 'Could not update your profile.')),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-paper-900">Settings</h1>
        <p className="mt-1 text-sm text-paper-600">Manage your account.</p>
      </div>

      <Card className="max-w-md p-5">
        <h2 className="mb-4 font-display text-lg text-paper-900">Profile</h2>
        <div className="flex flex-col gap-3">
          {error && <ErrorBanner message={error} />}
          <Input label="Email" value={profile.data?.email ?? ''} disabled />
          <Input label="Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <Button
            className="self-start"
            onClick={() => {
              setError(null);
              updateProfile.mutate(displayName);
            }}
            isLoading={updateProfile.isPending}
          >
            {saved ? 'Saved' : 'Save changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
