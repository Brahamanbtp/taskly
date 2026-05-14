import { useMemo } from 'react';

export function useCommandParser() {
  const parse = (input, selectedTaskId) => {
    const text = input.trim().toLowerCase();
    
    if (!text) return null;

    // Direct actions that don't need a specific task context if they are global
    if (text === '/undo' || text === 'undo') return { type: 'UNDO_GLOBAL' };

    // Actions that NEED a selected task
    if (!selectedTaskId) {
      // If no task selected, maybe the user is searching for a task
      return { type: 'SEARCH_TASKS', query: text };
    }

    if (text.startsWith('/prio ') || text.startsWith('prio ')) {
      const val = text.replace('/prio ', '').replace('prio ', '').trim().toUpperCase();
      if (['LOW', 'MEDIUM', 'HIGH'].includes(val)) {
        return { type: 'SET_PRIORITY', taskId: selectedTaskId, value: val };
      }
    }

    if (text.startsWith('/status ') || text.startsWith('status ')) {
      const val = text.replace('/status ', '').replace('status ', '').trim().toUpperCase();
      // Normalize common variants
      let status = val;
      if (val === 'TODO' || val === 'TO DO') status = 'TODO';
      if (val === 'INPROG' || val === 'IN PROGRESS' || val === 'DOING') status = 'IN_PROGRESS';
      if (val === 'DONE' || val === 'FINISHED') status = 'DONE';

      if (['TODO', 'IN_PROGRESS', 'DONE'].includes(status)) {
        return { type: 'SET_STATUS', taskId: selectedTaskId, value: status };
      }
    }

    if (text === '/delete' || text === 'delete') {
      return { type: 'DELETE_TASK', taskId: selectedTaskId };
    }

    return { type: 'SEARCH_COMMANDS', query: text };
  };

  return { parse };
}
