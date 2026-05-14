import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, Zap, ArrowRight, CornerDownLeft, Trash2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useCommandParser } from '../hooks/useCommandParser';

export function CommandPalette({ isOpen, onClose, tasks, onAction }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedTask, setSelectedTask] = useState(null);
  const { parse } = useCommandParser();
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSelectedTask(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredTasks = query && !selectedTask
    ? tasks.filter(t => t.title.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const availableCommands = [
    { id: 'prio_high', label: 'Set Priority: High', cmd: '/prio high', icon: <AlertCircle size={16} color="#f87171" /> },
    { id: 'prio_med', label: 'Set Priority: Medium', cmd: '/prio medium', icon: <AlertCircle size={16} color="#facc15" /> },
    { id: 'status_done', label: 'Move to Done', cmd: '/status done', icon: <CheckCircle2 size={16} color="#4ade80" /> },
    { id: 'status_prog', label: 'Move to In Progress', cmd: '/status in progress', icon: <Clock size={16} color="#60a5fa" /> },
    { id: 'delete', label: 'Delete Task', cmd: '/delete', icon: <Trash2 size={16} color="#f87171" /> },
  ];

  const filteredCommands = selectedTask 
    ? availableCommands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()) || c.cmd.includes(query.toLowerCase()))
    : [];

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, (selectedTask ? filteredCommands.length : filteredTasks.length) - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!selectedTask && filteredTasks.length > 0) {
        setSelectedTask(filteredTasks[selectedIndex]);
        setQuery('');
        setSelectedIndex(0);
      } else if (selectedTask && filteredCommands.length > 0) {
        executeCommand(filteredCommands[selectedIndex].cmd);
      } else if (query.startsWith('/')) {
        executeCommand(query);
      }
    }
  };

  const executeCommand = (cmdText) => {
    const action = parse(cmdText, selectedTask?.id);
    if (action) {
      onAction(action);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '15vh', zIndex: 10000 }} onClick={onClose}>
      <motion.div 
        className="command-palette"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
      >
        <div className="cp-input-wrap">
          <Command size={18} className="cp-icon" />
          {selectedTask && (
            <div className="cp-chip">
              {selectedTask.title}
              <span onClick={() => setSelectedTask(null)}>×</span>
            </div>
          )}
          <input 
            ref={inputRef}
            placeholder={selectedTask ? "Type a command (e.g. /prio high)..." : "Search for a task or type a command..."}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="cp-results">
          {selectedTask ? (
            <>
              <div className="cp-label">Actions for "{selectedTask.title}"</div>
              {filteredCommands.map((c, i) => (
                <div key={c.id} className={`cp-item ${i === selectedIndex ? 'active' : ''}`} onClick={() => executeCommand(c.cmd)}>
                  <div className="cp-item-main">
                    {c.icon}
                    <span>{c.label}</span>
                  </div>
                  <div className="cp-shortcut">{c.cmd}</div>
                </div>
              ))}
            </>
          ) : filteredTasks.length > 0 ? (
            <>
              <div className="cp-label">Tasks</div>
              {filteredTasks.map((t, i) => (
                <div key={t.id} className={`cp-item ${i === selectedIndex ? 'active' : ''}`} onClick={() => setSelectedTask(t)}>
                  <div className="cp-item-main">
                    <Zap size={16} style={{ color: 'var(--accent)' }} />
                    <span>{t.title}</span>
                  </div>
                  <ArrowRight size={14} className="cp-arrow" />
                </div>
              ))}
            </>
          ) : (
            <div className="cp-empty">
              <div style={{ marginBottom: 8 }}>No results found</div>
              <div style={{ fontSize: '11px', opacity: 0.5, display: 'flex', gap: 12 }}>
                <span><strong>/status done</strong> to finish</span>
                <span><strong>/prio high</strong> for urgency</span>
                <span><strong>/undo</strong> to revert</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="cp-footer">
          <div className="cp-guide"><CornerDownLeft size={10} /> Select</div>
          <div className="cp-guide">↑↓ Navigate</div>
          <div className="cp-guide">ESC Close</div>
        </div>
      </motion.div>
    </div>
  );
}
