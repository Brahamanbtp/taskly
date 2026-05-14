import React from 'react';

export function IconLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="white" opacity="0.12"/>
      <path d="M7 12H17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 8H13" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 16H11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function Avatar({ name }) {
  const initials = (name || 'U').split('@')[0].slice(0, 2).toUpperCase();
  return <div className="avatar">{initials}</div>;
}
