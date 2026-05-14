import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { signUp, signIn, API_URL } from '../api';
import { IconLogo } from '../components/UI';

export default function Auth() {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data) => mode === 'login' ? signIn(data.email, data.password) : signUp(data.email, data.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created successfully!');
      navigate('/');
    },
    onError: (error) => {
      toast.error(error.message || 'Authentication failed');
    }
  });

  const submit = (e) => {
    e.preventDefault();
    mutation.mutate({ email, password });
  };

  return (
    <motion.div 
      className="auth-wrap"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(90deg,#7c5cff,#5aa6ff)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconLogo />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Taskly</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Simple tasks, smarter life</div>
          </div>
        </div>
      </div>

      <form onSubmit={submit} style={{ marginTop: 8 }}>
        <input className="input" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? (mode === 'login' ? 'Logging…' : 'Signing…') : (mode === 'login' ? 'Log in' : 'Sign up')}
            </button>
            <button type="button" className="btn secondary" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Create account' : 'Have an account?'}
            </button>
          </div>
        </div>
      </form>

      <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
        <div style={{ fontSize: 12, opacity: 0.5 }}>OR</div>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
      </div>

      <button 
        type="button" 
        className="btn secondary" 
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        onClick={() => window.location.href = `${API_URL}/auth/google`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>
    </motion.div>
  );
}
