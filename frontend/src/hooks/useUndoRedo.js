import { useEffect, useCallback, useRef } from 'react';

export function useUndoRedo({ onUndo, onRedo, enabled = true }) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const pushAction = useCallback((action) => {
    undoStack.current.push(action);
    redoStack.current = []; // Clear redo on new action
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return null;
    const action = undoStack.current.pop();
    redoStack.current.push(action);
    return action;
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return null;
    const action = redoStack.current.pop();
    undoStack.current.push(action);
    return action;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e) => {
      // Ctrl+Z / Cmd+Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const action = undo();
        if (action && onUndo) onUndo(action);
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        const action = redo();
        if (action && onRedo) onRedo(action);
      }
      // Ctrl+Y = Redo (Windows)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        const action = redo();
        if (action && onRedo) onRedo(action);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, undo, redo, onUndo, onRedo]);

  return {
    pushAction,
    undo,
    redo,
    canUndo: () => undoStack.current.length > 0,
    canRedo: () => redoStack.current.length > 0,
  };
}
