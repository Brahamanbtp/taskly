// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  createTask as apiCreateTask,
  listTasks as apiListTasks,
  updateTaskStatus as apiUpdateTaskStatus,
  editTaskTitle as apiEditTaskTitle,
  deleteTask as apiDeleteTask
} from './api';

/* ---------- UI helpers (kept from original app) ---------- */
function IconLogo(){
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="white" opacity="0.12"/>
      <path d="M7 12H17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 8H13" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 16H11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function Avatar({name}){
  const initials = (name || 'U').split('@')[0].slice(0,2).toUpperCase();
  return <div className="avatar">{initials}</div>
}

/* ------------------ Auth Form ------------------ */
function Auth({ onLogin }) {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

    async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        const { data, error } = await signIn(email, password);
        if (error) {
          alert(error.message || error);
        } else {
          onLogin();
        }
      } else {
        // signup
        const { data, error } = await signUp(email, password);
        if (error) {
          alert(error.message || error);
        } else {
          // Some Supabase setups require email confirmation and do not create a session.
          // Try to sign in immediately to get a session (if allowed).
          const { data: signinData, error: signinError } = await signIn(email, password);
          if (signinError) {
            // still proceed — user may need to confirm email
            alert('Signed up. Please check your email to confirm login (if required).');
            onLogin(); // optional: treat as logged-in if your policy allows preview
          } else {
            onLogin();
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="auth-wrap">
      <div style={{display:'flex',alignItems:'center',gap:12, marginBottom:6}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:44,height:44,background:'linear-gradient(90deg,#7c5cff,#5aa6ff)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <IconLogo />
          </div>
          <div>
            <div style={{fontWeight:700}}>Taskly</div>
            <div style={{fontSize:13,color:'#94a3b8'}}>Simple tasks, smarter life</div>
          </div>
        </div>
      </div>

      <form onSubmit={submit} style={{marginTop:8}}>
        <input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12}}>
          <div style={{display:'flex',gap:8}}>
            <button type="submit" className="btn" disabled={busy}>{busy ? (mode==='login' ? 'Logging…' : 'Signing…') : (mode==='login' ? 'Log in' : 'Sign up')}</button>
            <button type="button" className="btn secondary" onClick={()=>setMode(mode==='login'?'signup':'login')}>
              {mode==='login' ? 'Create account' : 'Have an account?'}
            </button>
          </div>
          <div className="small" style={{color:'#94a3b8'}}>No password rules — demo only</div>
        </div>
      </form>
    </div>
  );
}

/* ------------------ Tasks App ------------------ */
function Tasks({ onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [userEmail, setUserEmail] = useState('you@domain');

  async function loadUser() {
    const userRes = await getCurrentUser();
    if (userRes) {
      setUserEmail(userRes.email || 'you@domain');
    }
  }

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await apiListTasks();
      if (error) {
        console.error(error);
        alert(error.message || 'Failed to fetch tasks');
      } else {
        setTasks(data || []);
      }
    } catch(e){
      console.error(e);
      alert('Network error');
    } finally { setLoading(false); }
  }

  useEffect(()=> {
    loadUser();
    load();
    // optional: subscribe to auth changes to refresh user & tasks when login/out
    // We keep it simple for demo
  }, []);

  async function createTask(e) {
    e.preventDefault();
    if (!title) return;
    setAdding(true);
    try {
      const { data, error } = await apiCreateTask(title);
      if (error) {
        console.error(error);
        alert(error.message || 'error');
      } else {
        setTitle('');
        await load();
      }
    } catch(err){
      console.error(err);
      alert('Network error');
    } finally { setAdding(false); }
  }

  async function updateStatus(id, status) {
    try {
      const { data, error } = await apiUpdateTaskStatus(id, status);
      if (error) {
        console.error(error);
        alert(error.message || 'err');
      } else {
        await load();
      }
    } catch(err){
      console.error(err);
      alert('Network error');
    }
  }

  const counts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="app-wrap">
      <div className="header">
        <div className="brand">
          <div className="logo"><IconLogo /></div>
          <div>
            <div className="title">Taskly</div>
            <div className="sub">Focus on what matters — tiny tasks, big wins.</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{textAlign:'right',marginRight:8}}>
            <div style={{fontWeight:700}}>{userEmail}</div>
            <div style={{fontSize:12,color:'#94a3b8'}}>Personal workspace</div>
          </div>
          <div>
            <button className="btn secondary" onClick={async () => { await signOut(); onLogout(); }}>Logout</button>
          </div>
        </div>
      </div>

      <div className="grid" style={{alignItems:'start'}}>
        <div className="card user-card">
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <Avatar name={userEmail} />
            <div>
              <div style={{fontWeight:800}}>{userEmail}</div>
              <div style={{color:'#94a3b8',fontSize:13}}>Member since demo</div>
            </div>
          </div>

          <div style={{marginTop:12}} className="summary">
            <div style={{fontSize:13,color:'#94a3b8'}}>Summary</div>
            <div className="counter-row">
              <div className="counter">
                <div className="num">{counts['TODO']||0}</div>
                <div className="lab">TODO</div>
              </div>
              <div className="counter">
                <div className="num">{counts['IN_PROGRESS']||0}</div>
                <div className="lab">IN PROGRESS</div>
              </div>
              <div className="counter">
                <div className="num">{counts['DONE']||0}</div>
                <div className="lab">DONE</div>
              </div>
            </div>

            <div style={{marginTop:12}}>
              <div style={{fontSize:13,color:'#94a3b8'}}>Quick tips</div>
              <ul style={{margin:8, paddingLeft:16, color:'#9fb0c9', fontSize:13}}>
                <li>Click status buttons to update a task.</li>
                <li>Tasks are cached server-side for 30s per user.</li>
              </ul>
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="topbar">
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <h3 style={{margin:0}}>Your tasks</h3>
                <div className="small" style={{marginLeft:6,color:'#94a3b8'}}>Manage your workflow</div>
              </div>
              <div className="controls">
                <button className="btn" onClick={load}>Refresh</button>
                <button className="btn secondary" onClick={()=>{ setTasks([]); alert('demo: clear local view'); }}>Clear view</button>
              </div>
            </div>

            <form className="add-form" onSubmit={createTask}>
              <input placeholder="Add a new task title…" value={title} onChange={e=>setTitle(e.target.value)} />
              <button className="btn" type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add'}</button>
            </form>

            {loading ? <div className="empty">Loading tasks…</div> : (
              tasks.length === 0 ? <div className="empty">No tasks yet — add one above ✨</div> :
              <div style={{overflowX:'auto'}}>
                <table>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th style={{width:130}}>Status</th>
                      <th style={{width:260}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t => (
                      <tr key={t.id}>
                        <td>
                          <div className="row-title">{t.title}</div>
                          <div className="small" style={{marginTop:6,color:'#94a3b8'}}>Created: {t.created_at ? new Date(t.created_at).toLocaleString() : '-'}</div>
                        </td>
                        <td>
                          <div>
                            <span className={`status-chip ${t.status==='TODO' ? 'status-TO' : t.status==='IN_PROGRESS' ? 'status-IP' : 'status-DN'}`}>
                              {t.status==='TODO' ? 'TODO' : t.status==='IN_PROGRESS' ? 'IN PROGRESS' : 'DONE'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:8}}>
                            {t.status !== 'TODO' && <button className="icon-btn" onClick={()=>updateStatus(t.id,'TODO')}>Mark TODO</button>}
                            {t.status !== 'IN_PROGRESS' && <button className="icon-btn" onClick={()=>updateStatus(t.id,'IN_PROGRESS')}>In Progress</button>}
                            {t.status !== 'DONE' && <button className="icon-btn" onClick={()=>updateStatus(t.id,'DONE')}>Done</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{height:16}} />

          <div className="card" style={{marginTop:12}}>
            <div style={{fontWeight:700, marginBottom:8}}>Activity</div>
            <div className="small">All task-related API calls are logged to the server console (method, path, timestamp).</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------ Root App ------------------ */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  // On mount, check if there is a logged-in user
  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) setLoggedIn(true);
    })();
    // optional: subscribe to auth state changes if you want realtime updates
  }, []);

  return (
    <div>
      {!loggedIn ? <Auth onLogin={() => setLoggedIn(true)} /> : <Tasks onLogout={() => setLoggedIn(false)} />}
    </div>
  );
}
