import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { getCurrentUser } from './api';
import Auth from './pages/Auth';
import Tasks from './pages/Tasks';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: getCurrentUser,
    retry: false,
  });

  useEffect(() => {
    if (!isLoading) {
      if (!user && location.pathname !== '/login') {
        navigate('/login');
      } else if (user && location.pathname === '/login') {
        navigate('/');
      }
    }
  }, [user, isLoading, navigate, location.pathname]);

  if (isLoading) {
    return <div className="app-wrap"><div className="empty">Loading...</div></div>;
  }

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <Routes>
        <Route path="/login" element={<Auth />} />
        <Route path="/" element={user ? <Tasks user={user} /> : <Navigate to="/login" />} />
      </Routes>
    </>
  );
}
