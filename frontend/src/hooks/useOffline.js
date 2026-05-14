import React, { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getQueuedMutations, removeMutation } from '../lib/offlineStore';
import { toast } from 'sonner';

const API_URL = 'http://localhost:4000/api';

function getAuthHeaders() {
  const token = localStorage.getItem('taskly_token');
  const workspaceId = localStorage.getItem('taskly_workspace_id');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(workspaceId && { 'x-workspace-id': workspaceId }),
  };
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const syncQueue = useCallback(async () => {
    const queue = await getQueuedMutations();
    if (queue.length === 0) return;

    setIsSyncing(true);
    let synced = 0;

    for (const mutation of queue) {
      try {
        const res = await fetch(`${API_URL}${mutation.url}`, {
          method: mutation.method,
          headers: getAuthHeaders(),
          ...(mutation.body && { body: JSON.stringify(mutation.body) }),
        });
        if (res.ok) {
          await removeMutation(mutation.queueId);
          synced++;
        } else {
          // If it's a 404 (task was deleted), just remove from queue
          if (res.status === 404) {
            await removeMutation(mutation.queueId);
          }
          // Otherwise stop syncing on first real error
          break;
        }
      } catch {
        // Network still down, stop trying
        break;
      }
    }

    setIsSyncing(false);
    if (synced > 0) {
      toast.success(`Synced ${synced} offline change${synced > 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }, [queryClient]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncQueue();
    }
  }, [isOnline, syncQueue]);

  return { isOnline, isSyncing, syncQueue };
}
