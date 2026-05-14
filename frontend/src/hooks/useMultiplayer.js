import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../api';

const SOCKET_URL = API_URL.replace(/\/api$/, ''); // Remove /api suffix if present

export function useMultiplayer(user, currentWorkspaceId) {
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user || !currentWorkspaceId) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem('taskly_token');
    if (!token) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token, workspaceId: currentWorkspaceId },
    });

    newSocket.on('connect', () => {
      console.log('Multiplayer connected:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.warn('Multiplayer connection error:', err.message);
    });

    newSocket.on('task_created', (newTask) => {
      queryClient.setQueryData(['tasks'], (old = []) => [...old, newTask]);
    });

    newSocket.on('task_updated', (updatedTask) => {
      queryClient.setQueryData(['tasks'], (old = []) => 
        old.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t)
      );
    });

    newSocket.on('task_deleted', (taskId) => {
      queryClient.setQueryData(['tasks'], (old = []) => 
        old.filter(t => t.id !== taskId)
      );
    });

    newSocket.on('notification', () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, currentWorkspaceId, queryClient]);

  return socket;
}
