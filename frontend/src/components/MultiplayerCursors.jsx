import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CURSOR_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#ec4899'];

export function MultiplayerCursors({ socket }) {
  const [cursors, setCursors] = useState({});

  useEffect(() => {
    if (!socket) return;

    const handleMouseMove = (e) => {
      // Throttle mouse move slightly to prevent network spam
      socket.emit('cursor_move', { x: e.clientX, y: e.clientY });
    };

    let throttleTimer;
    const throttledMouseMove = (e) => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        handleMouseMove(e);
        throttleTimer = null;
      }, 30); // ~30fps cursor sync
    };

    window.addEventListener('mousemove', throttledMouseMove);

    socket.on('cursor_moved', (data) => {
      setCursors(prev => ({
        ...prev,
        [data.socketId]: { x: data.x, y: data.y, email: data.email, color: getColor(data.socketId) }
      }));
    });

    socket.on('cursor_left', (data) => {
      setCursors(prev => {
        const next = { ...prev };
        delete next[data.socketId];
        return next;
      });
    });

    return () => {
      window.removeEventListener('mousemove', throttledMouseMove);
      socket.off('cursor_moved');
      socket.off('cursor_left');
      clearTimeout(throttleTimer);
    };
  }, [socket]);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      <AnimatePresence>
        {Object.entries(cursors).map(([id, cursor]) => (
          <motion.div
            key={id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: cursor.x, y: cursor.y }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300, mass: 0.5 }}
            style={{ position: 'absolute', top: 0, left: 0, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}
          >
            <svg width="24" height="36" viewBox="0 0 24 36" fill="none" stroke="white" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.65376 2.00015L2.35306 29.5663C2.10657 31.6247 4.54245 32.9648 6.13642 31.6465L11.5165 27.1977C11.8385 26.9315 12.2599 26.8049 12.6865 26.8459L18.6677 27.4206C20.686 27.6146 22.1818 25.597 21.218 23.7594L9.12354 0.697475C8.16335 -1.13324 5.43324 -0.0163351 5.65376 2.00015Z" fill={cursor.color}/>
            </svg>
            <div style={{ 
              background: cursor.color, color: 'white', padding: '2px 8px', borderRadius: '12px', 
              fontSize: '11px', fontWeight: 600, marginTop: '4px', marginLeft: '12px', whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
              {cursor.email.split('@')[0]}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function getColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}
