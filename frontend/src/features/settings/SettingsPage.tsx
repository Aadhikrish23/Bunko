import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api/client';
import type { Profile } from '../../lib/api/types';
import { useAuth } from '../../lib/auth-context';
import { errorMessage } from '../../lib/error-message';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DevicesList } from '../sync/DevicesList';
import { OfflineBooksList } from '../sync/OfflineBooksList';

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

      <Card className="max-w-md p-5">
        <h2 className="mb-1 font-display text-lg text-paper-900">Offline books</h2>
        <p className="mb-3 text-sm text-paper-600">
          Downloaded to this device only. Reading, highlights, notes, and bookmarks made offline sync when you
          reconnect.
        </p>
        <OfflineBooksList showStorage />
      </Card>

      <Card className="max-w-md p-5">
        <h2 className="mb-3 font-display text-lg text-paper-900">Your devices</h2>
        <DevicesList />
      </Card>

      <Card className="max-w-md p-5">
        <h2 className="mb-2 font-display text-lg text-paper-900">Reading soundtrack</h2>
        <p className="text-sm text-paper-600">
          Optional music while you read, from your own Spotify, YouTube, Apple Music, or SoundCloud playlists.
        </p>
        <Link to="/soundtracks" className="focus-visible:focus-ring mt-3 inline-block rounded text-sm font-medium text-moss-700 underline">
          Manage playlists
        </Link>
      </Card>
    </div>
  );
}
