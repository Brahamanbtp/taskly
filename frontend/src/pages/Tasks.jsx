import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCorners, useSensor, useSensors, PointerSensor, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, Trash2, Calendar, AlertCircle, Plus, LayoutList, Sun, Moon, History, X, Undo2, Redo2, WifiOff, Wifi, Loader2, Brain, Search as SearchIcon, Network, Layout, Link, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { listTasks, createTask, updateTaskStatus, editTask, deleteTask, reorderTask, signOut, getTaskEvents, listWorkspaces, createWorkspace, getBoardHistory, undoTaskAction, searchTasks, semanticSearch, getSearchCapabilities, listDependencies, listWebhooks, addWebhook, deleteWebhook, listAttachments, getUploadPresign, registerAttachment, listMembers, addMember, removeMember, getAnalytics, createRazorpayOrder, verifyRazorpayPayment, listNotifications, markNotificationRead, listTaskComments, addTaskComment } from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Bell, CreditCard, BarChart3, MessageSquare, Send } from 'lucide-react';
import { IconLogo, Avatar } from '../components/UI';
import { DependencyGraph } from '../components/DependencyGraph';
import { CommandPalette } from '../components/CommandPalette';
import { RichTextEditor } from '../components/RichTextEditor';
import { useMultiplayer } from '../hooks/useMultiplayer';
import { MultiplayerCursors } from '../components/MultiplayerCursors';
import { getQueuedMutations, removeMutation } from '../lib/offlineStore';
import { useUndoRedo } from '../hooks/useUndoRedo';

function AnalyticsModal({ isOpen, onClose }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: getAnalytics,
    enabled: isOpen,
  });

  const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-content large">
            <div className="modal-header">
              <h3><BarChart3 size={20} /> Team Analytics</h3>
              <button onClick={onClose} className="btn-icon"><X size={20} /></button>
            </div>
            
            {isLoading ? <div className="p-8 flex justify-center"><Loader2 className="spin" /></div> : (
              <div className="analytics-grid">
                <div className="chart-card" style={{ minWidth: 0 }}>
                  <h4>Velocity (Tasks Done)</h4>
                  <div style={{ height: 250, width: '100%', minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={100} aspect={2}>
                      <BarChart data={stats?.velocity || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric' })} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="chart-card" style={{ minWidth: 0 }}>
                  <h4>Status Distribution</h4>
                  <div style={{ height: 250, width: '100%', minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%" debounce={100} aspect={2}>
                      <PieChart>
                        <Pie data={stats?.statusDistribution || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label>
                          {(stats?.statusDistribution || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="stats-mini-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 20 }}>
                  <div className="stat-box" style={{ background: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Avg. Cycle Time</div>
                    <strong style={{ fontSize: 20 }}>{stats?.averageCycleTimeHours}h</strong>
                  </div>
                  <div className="stat-box" style={{ background: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Total Tasks</div>
                    <strong style={{ fontSize: 20 }}>{stats?.totalTasks}</strong>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BillingModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async (plan) => {
    setLoading(true);
    try {
      // 1. Load Razorpay Script
      const loadScript = (src) => {
        return new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = src;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const res = await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      if (!res) {
        toast.error("Razorpay SDK failed to load. Check your internet connection.");
        setLoading(false);
        return;
      }

      // 2. Create Order
      const order = await createRazorpayOrder(plan);

      // 3. Open Checkout
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Taskly Enterprise",
        description: `${plan} Subscription Upgrade`,
        order_id: order.id,
        handler: async function (response) {
          try {
            await verifyRazorpayPayment({
              ...response,
              plan,
              workspaceId: localStorage.getItem('taskly_workspace_id')
            });
            toast.success("Payment Successful! Your plan has been upgraded.");
            window.location.reload(); // Refresh to apply changes
          } catch (err) {
            toast.error(err.message);
          }
        },
        prefill: {
          email: "user@example.com", // You can pass actual user email here
        },
        theme: {
          color: "#7c5cff",
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
      setLoading(false);
    } catch (e) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-content">
            <div className="modal-header">
              <h3><CreditCard size={20} /> Subscription Plans</h3>
              <button onClick={onClose} className="btn-icon"><X size={20} /></button>
            </div>
            
            <div className="plans-grid">
              <div className="plan-card">
                <h4>Pro Plan</h4>
                <div className="price">₹1,900<span>/mo</span></div>
                <ul>
                  <li>Up to 5,000 tasks</li>
                  <li>50 Team Members</li>
                  <li>Advanced Analytics</li>
                </ul>
                <button disabled={loading} onClick={() => handleUpgrade('PRO')} className="btn primary block">
                  {loading ? <Loader2 className="spin" size={16} /> : 'Upgrade to Pro'}
                </button>
              </div>
              
              <div className="plan-card featured">
                <h4>Enterprise</h4>
                <div className="price">₹9,900<span>/mo</span></div>
                <ul>
                  <li>Unlimited Tasks</li>
                  <li>Unlimited Members</li>
                  <li>SSO & Audit Logs</li>
                </ul>
                <button disabled={loading} onClick={() => handleUpgrade('ENTERPRISE')} className="btn primary block">
                  {loading ? <Loader2 className="spin" size={16} /> : 'Upgrade to Enterprise'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TaskComments({ taskId, workspaceId }) {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();

  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => listTaskComments(taskId),
    enabled: !!taskId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['workspace_members', workspaceId],
    queryFn: listMembers,
    enabled: !!workspaceId,
  });

  const [selectedMentions, setSelectedMentions] = useState([]);

  const mutation = useMutation({
    mutationFn: (data) => addTaskComment(taskId, data.content, data.mentions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      setContent('');
      setSelectedMentions([]);
      toast.success('Comment added');
    },
    onError: (e) => toast.error(e.message)
  });

  return (
    <div className="comments-section">
      <h4><MessageSquare size={16} /> Discussion</h4>
      <div className="comment-list">
        {isLoading ? <Loader2 className="spin mx-auto" /> : comments?.map(c => (
          <div key={c.id} className="comment-item">
            <div className="comment-meta">
              <strong>{c.user_email.split('@')[0]}</strong>
              <span>{new Date(c.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="comment-body">{c.content}</div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ content, mentions: selectedMentions }); }} className="comment-form">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea 
            placeholder="Write a comment... use @ to mention" 
            value={content} 
            onChange={(e) => setContent(e.target.value)}
          />
          {members.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {members.filter(m => m.user_id !== user?.id).map(m => (
                <button 
                  key={m.user_id} 
                  type="button"
                  className={`btn-tag ${selectedMentions.includes(m.user_id) ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedMentions.includes(m.user_id)) {
                      setSelectedMentions(prev => prev.filter(id => id !== m.user_id));
                    } else {
                      setSelectedMentions(prev => [...prev, m.user_id]);
                      setContent(prev => prev + (prev.endsWith(' ') || prev === '' ? '' : ' ') + '@' + m.email.split('@')[0] + ' ');
                    }
                  }}
                >
                  @{m.email.split('@')[0]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button disabled={!content.trim() || mutation.isPending} className="btn primary btn-sm">
          {mutation.isPending ? <Loader2 className="spin" size={14} /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
}
function TaskActivity({ taskId }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ['task_events', taskId],
    queryFn: () => getTaskEvents(taskId),
    enabled: !!taskId,
  });

  if (!taskId) return null;
  
  const formatEvent = (ev) => {
    if (ev.event_type === 'CREATED') return 'created this task.';
    if (ev.event_type === 'STATUS_CHANGED') {
      const oldP = JSON.parse(ev.old_payload || '{}');
      const newP = JSON.parse(ev.new_payload || '{}');
      return `moved this task from ${oldP.status} to ${newP.status}.`;
    }
    if (ev.event_type === 'REORDERED') return 'reordered this task.';
    if (ev.event_type === 'EDITED') return 'edited task details.';
    if (ev.event_type === 'DELETED') return 'deleted this task.';
    return 'modified this task.';
  };

  return (
    <div className="activity-log">
      <h4>Activity History</h4>
      {isLoading ? (
        <div className="timeline-content">Loading history...</div>
      ) : !events || events.length === 0 ? (
        <div className="timeline-content">No history available.</div>
      ) : (
        <div className="timeline">
          {events.map(ev => (
            <div key={ev.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-content">
                <strong>{ev.user_email.split('@')[0]}</strong> {formatEvent(ev)}
                <div className="timeline-date">{new Date(ev.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useOfflineInternal(queryClient) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

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
    const API_URL = 'http://localhost:4000/api';
    const getAuthHeaders = () => {
      const token = localStorage.getItem('taskly_token');
      const workspaceId = localStorage.getItem('taskly_workspace_id');
      return {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(workspaceId && { 'x-workspace-id': workspaceId }),
      };
    };

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
        } else if (res.status === 404) {
          await removeMutation(mutation.queueId);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    setIsSyncing(false);
    if (synced > 0) {
      toast.success(`Synced ${synced} offline change${synced > 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  }, [queryClient]);

  useEffect(() => {
    if (isOnline) syncQueue();
  }, [isOnline, syncQueue]);

  return { isOnline, isSyncing };
}

function DroppableColumn({ id, title, tasks, onEdit, onDelete, readOnly }) {
  const { setNodeRef } = useDroppable({ id, data: { type: 'Column', id } });

  return (
    <div ref={setNodeRef} className="kanban-col">
      <div className="col-header">
        <div className="col-title">{title}</div>
        <div className="col-count">{tasks.length}</div>
      </div>
      <div className="col-body">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence>
            {tasks.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="empty">
                <LayoutList size={32} className="empty-icon" />
                <div>No tasks here</div>
              </motion.div>
            ) : (
              tasks.map(t => (
                <SortableCard key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} readOnly={readOnly} />
              ))
            )}
          </AnimatePresence>
        </SortableContext>
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, readOnly, setNodeRef, style, isDragging, listeners, attributes }) {
  const prioColors = { LOW: '#4ade80', MEDIUM: '#facc15', HIGH: '#f87171' };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      {...listeners} 
      {...attributes}
    >
      <div className="card-top">
        <span className="priority-badge" style={{ color: prioColors[task.priority || 'MEDIUM'], borderColor: prioColors[task.priority || 'MEDIUM'] }}>
          <AlertCircle size={12} /> {task.priority || 'MEDIUM'}
        </span>
        {!readOnly && (
          <div className="card-actions">
            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onEdit(task)}><Pencil size={14} /></button>
            <button className="danger" onPointerDown={(e) => e.stopPropagation()} onClick={() => onDelete(task.id)}><Trash2 size={14} /></button>
          </div>
        )}
      </div>
      <div className="card-title">{task.title}</div>
      {task.description && (
        <div className="card-desc">
          {(() => {
            const text = task.description.replace(/<[^>]*>?/gm, '');
            return text.length > 100 ? text.slice(0, 100) + '...' : text;
          })()}
        </div>
      )}
      {Array.isArray(task.tags) && task.tags.length > 0 && (
        <div className="card-tags">
          {task.tags.map(tag => <span key={tag} className="tag-pill">{tag}</span>)}
        </div>
      )}
      {task.due_date && (
        <div className="card-due">
          <Calendar size={12} /> {new Date(task.due_date).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function SortableCard({ task, onEdit, onDelete, readOnly }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: task.id, 
    data: { type: 'Task', task } 
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return <TaskCard task={task} onEdit={onEdit} onDelete={onDelete} readOnly={readOnly} setNodeRef={setNodeRef} style={style} isDragging={isDragging} listeners={!readOnly ? listeners : undefined} attributes={!readOnly ? attributes : undefined} />;
}

function TaskAttachments({ taskId }) {
  const queryClient = useQueryClient();
  const { data: files, isLoading } = useQuery({
    queryKey: ['attachments', taskId],
    queryFn: () => listAttachments(taskId),
    enabled: !!taskId,
  });

  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Get presigned URL
      const { uploadUrl, fileKey } = await getUploadPresign(taskId, file.name, file.type);

      // 2. Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadRes.ok) throw new Error('S3 upload failed');

      // 3. Register attachment in our DB
      await registerAttachment({
        taskId,
        fileName: file.name,
        fileKey,
        fileSize: file.size,
        mimeType: file.type
      });

      queryClient.invalidateQueries({ queryKey: ['attachments', taskId] });
      toast.success('File uploaded successfully');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (!taskId) return null;

  return (
    <div className="activity-log" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Attachments</h4>
        <label className="btn secondary" style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {isUploading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          {isUploading ? 'Uploading...' : 'Attach File'}
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={isUploading} />
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading ? (
          <div style={{ fontSize: 12, opacity: 0.5 }}>Loading files...</div>
        ) : !files || files.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.5 }}>No attachments yet.</div>
        ) : (
          files.map(file => (
            <a 
              key={file.id} 
              href={file.downloadUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="attachment-item"
              style={{ 
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', 
                background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)',
                textDecoration: 'none', color: 'inherit', transition: 'all 0.2s'
              }}
            >
              <Link size={16} style={{ color: 'var(--accent)', opacity: 0.7 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.file_name}</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>{(file.file_size / 1024).toFixed(1)} KB</div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function WorkspaceMembers({ workspaceId, currentRole }) {
  const queryClient = useQueryClient();
  const { data: members, isLoading } = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => listMembers(),
    enabled: !!workspaceId,
  });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      await addMember(inviteEmail, inviteRole);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      toast.success('Member invited successfully');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await removeMember(userId);
      queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
      toast.success('Member removed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN';

  return (
    <div className="activity-log" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
      <h4 style={{ margin: '0 0 16px 0' }}>Workspace Team</h4>
      
      {canManage && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input 
            className="input" 
            placeholder="User Email" 
            style={{ flex: 1, fontSize: 13 }} 
            value={inviteEmail} 
            onChange={e => setInviteEmail(e.target.value)} 
            required 
          />
          <select className="input" style={{ width: 110, fontSize: 13 }} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button className="btn" type="submit" disabled={isAdding}>
            {isAdding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading ? (
          <div style={{ fontSize: 12, opacity: 0.5 }}>Loading team...</div>
        ) : (
          members?.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <Avatar name={m.email} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>{m.role} • Joined {new Date(m.joined_at).toLocaleDateString()}</div>
              </div>
              {canManage && m.role !== 'OWNER' && (
                <button className="btn secondary" style={{ padding: 6, color: '#f87171' }} onClick={() => handleRemove(m.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Tasks({ user }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem('taskly_workspace_id') || '');
  const [currentRole, setCurrentRole] = useState('VIEWER');
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: listNotifications,
    refetchInterval: 10000, 
  });

  const socket = useMultiplayer(user, workspaceId);
  
  const [theme, setTheme] = useState(localStorage.getItem('taskly_theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('taskly_theme', theme);
  }, [theme]);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [prioFilter, setPrioFilter] = useState('ALL');
  
  // Add/Edit Form State
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', priority: 'MEDIUM', due_date: '', description: '', tags: '' });
  const [showForm, setShowForm] = useState(false);

  // Local state for smooth drag and drop
  const [localTasks, setLocalTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);

  const [timeTravelMode, setTimeTravelMode] = useState(false);
  const [timeTravelDate, setTimeTravelDate] = useState(new Date().toISOString().slice(0, 16));

  const { data: workspaces = [], isLoading: wsLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: listWorkspaces,
  });

  useEffect(() => {
    if (workspaces.length > 0) {
      if (!workspaceId) {
        const firstWs = workspaces[0];
        setWorkspaceId(firstWs.id);
        setCurrentRole(firstWs.role || 'MEMBER');
        localStorage.setItem('taskly_workspace_id', firstWs.id);
      } else {
        const currentWs = workspaces.find(w => w.id === workspaceId);
        if (currentWs) setCurrentRole(currentWs.role || 'MEMBER');
      }
    }
  }, [workspaces, workspaceId]);

  const handleWorkspaceChange = (newId) => {
    const ws = workspaces.find(w => w.id === newId);
    setWorkspaceId(newId);
    setCurrentRole(ws?.role || 'MEMBER');
    localStorage.setItem('taskly_workspace_id', newId);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const createWsMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: (newWs) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      handleWorkspaceChange(newWs.id);
      toast.success('Workspace created');
    },
    onError: (e) => toast.error(e.message)
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: listTasks,
    enabled: !!workspaceId && !timeTravelMode,
  });

  const { data: historyTasks, isLoading: historyLoading } = useQuery({
    queryKey: ['tasks_history', workspaceId, timeTravelDate],
    queryFn: () => getBoardHistory(new Date(timeTravelDate).toISOString()),
    enabled: !!workspaceId && timeTravelMode && !!timeTravelDate,
  });

  const isLoading = timeTravelMode ? historyLoading : tasksLoading;

  useEffect(() => {
    const source = timeTravelMode ? historyTasks : tasks;
    if (source) {
      setLocalTasks(source);
    } else {
      setLocalTasks([]);
    }
  }, [tasks, historyTasks, timeTravelMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const createMutation = useMutation({
    mutationFn: (data) => createTask(data.title, data.priority, data.due_date || null, data.description, data.tags),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task created successfully'); closeForm(); },
    onError: (e) => toast.error(e.message)
  });

  const editMutation = useMutation({
    mutationFn: (data) => editTask(data.id, data.title, data.priority, data.due_date || null, data.description, data.tags),
    onSuccess: (_, vars) => {
      undoRedo.pushAction({ type: 'edit', taskId: vars.id });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task updated successfully');
      closeForm();
    },
    onError: (e) => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: (_, id) => {
      undoRedo.pushAction({ type: 'delete', taskId: id });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
    },
    onError: (e) => toast.error(e.message)
  });

  const reorderMutation = useMutation({
    mutationFn: ({ id, status, position }) => reorderTask(id, status, position),
    onSuccess: (_, vars) => {
      undoRedo.pushAction({ type: 'reorder', taskId: vars.id });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  });

  const undoMutation = useMutation({
    mutationFn: (taskId) => undoTaskAction(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Action undone');
    },
    onError: (e) => toast.error(e.message)
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => updateTaskStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Status updated');
    },
    onError: (e) => toast.error(e.message)
  });

  // ─── Offline & Undo/Redo ──────────────────────────────
  const { isOnline, isSyncing } = useOfflineInternal(queryClient);

  const handleUndo = async (action) => {
    if (!action?.taskId) return;
    try {
      await undoTaskAction(action.taskId);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Action undone');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const undoRedo = useUndoRedo({
    onUndo: handleUndo,
    enabled: !timeTravelMode,
  });

  // ─── Search & AI Intelligence ──────────────────────────
  const [searchMode, setSearchMode] = useState('DEFAULT'); // 'DEFAULT' or 'AI'
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: searchCapabilities } = useQuery({
    queryKey: ['search_capabilities'],
    queryFn: getSearchCapabilities,
  });

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['search', searchMode, debouncedSearch, workspaceId],
    queryFn: () => searchMode === 'AI' ? semanticSearch(debouncedSearch) : searchTasks(debouncedSearch),
    enabled: !!debouncedSearch && !!workspaceId && !timeTravelMode,
  });

  const activeTasks = debouncedSearch && searchResults ? searchResults.results : localTasks;

  // ─── View Management ───────────────────────────────────
  const [viewMode, setViewMode] = useState('KANBAN'); // 'KANBAN' or 'GRAPH'
  const { data: dependencies = [] } = useQuery({
    queryKey: ['dependencies', workspaceId],
    queryFn: listDependencies,
    enabled: !!workspaceId && viewMode === 'GRAPH',
  });

  // ─── Command Palette ──────────────────────────────────
  const [isCpOpen, setIsCpOpen] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCpOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCommandAction = (action) => {
    switch (action.type) {
      case 'UNDO_GLOBAL':
        const a = undoRedo.undo();
        if (a) handleUndo(a);
        break;
      case 'SET_PRIORITY':
        const t1 = localTasks.find(t => t.id === action.taskId);
        if (t1) editMutation.mutate({ ...t1, priority: action.value });
        break;
      case 'SET_STATUS':
        updateStatusMutation.mutate({ id: action.taskId, status: action.value });
        break;
      case 'DELETE_TASK':
        handleDelete(action.taskId);
        break;
      default:
        console.warn('Unknown command action', action);
    }
  };

  // ─── Webhooks ──────────────────────────────────────────
  const { data: webhooks = [] } = useQuery({
    queryKey: ['webhooks', workspaceId],
    queryFn: listWebhooks,
    enabled: !!workspaceId && showWebhooks,
  });

  const addWebhookMutation = useMutation({
    mutationFn: addWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook added');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook removed');
    },
    onError: (e) => toast.error(e.message),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ title: '', priority: 'MEDIUM', due_date: '', description: '', tags: '' });
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title cannot be empty'); return; }
    
    const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const submitData = { ...form, tags: tagsArray };

    if (editingId) {
      editMutation.mutate({ id: editingId, ...submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const openEdit = (task) => {
    setEditingId(task.id);
    setForm({ 
      title: task.title, 
      priority: task.priority || 'MEDIUM', 
      due_date: task.due_date ? task.due_date.split('T')[0] : '',
      description: task.description || '',
      tags: task.tags ? task.tags.join(', ') : ''
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this task?')) {
      setLocalTasks(prev => prev.filter(t => t.id !== id));
      deleteMutation.mutate(id);
    }
  };

  const handleDragStart = (event) => {
    if (timeTravelMode) return;
    const { active } = event;
    setActiveTask(localTasks.find(t => t.id === active.id));
  };

  const handleDragOver = (event) => {
    if (timeTravelMode) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeIndex = localTasks.findIndex(t => t.id === activeId);
    const overIndex = localTasks.findIndex(t => t.id === overId);

    const isOverColumn = ['TODO', 'IN_PROGRESS', 'DONE'].includes(overId);
    
    setLocalTasks((prev) => {
      if (activeIndex === -1) return prev;
      let next = [...prev];
      if (isOverColumn) {
        if (next[activeIndex].status !== overId) {
          next[activeIndex] = { ...next[activeIndex], status: overId };
          next.push(next.splice(activeIndex, 1)[0]);
        }
      } else if (overIndex !== -1) {
        const overTask = next[overIndex];
        if (next[activeIndex].status !== overTask.status) {
          next[activeIndex] = { ...next[activeIndex], status: overTask.status };
        }
        next = arrayMove(next, activeIndex, overIndex);
      }
      return next;
    });
  };

  const handleDragEnd = (event) => {
    if (timeTravelMode) return;
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTaskFinal = localTasks.find(t => t.id === activeId);
    if (!activeTaskFinal) return;

    const targetStatus = activeTaskFinal.status;
    const columnTasks = localTasks.filter(t => t.status === targetStatus);
    const finalIndex = columnTasks.findIndex(t => t.id === activeId);

    let newPosition = 1000;
    if (columnTasks.length > 1) {
      if (finalIndex === 0) {
        newPosition = columnTasks[1].position / 2;
      } else if (finalIndex === columnTasks.length - 1) {
        newPosition = columnTasks[finalIndex - 1].position + 1000;
      } else {
        newPosition = (columnTasks[finalIndex - 1].position + columnTasks[finalIndex + 1].position) / 2;
      }
    }

    // Update local state permanently
    setLocalTasks(prev => prev.map(t => t.id === activeId ? { ...t, position: newPosition } : t));

    // Save to backend
    reorderMutation.mutate({ id: activeId, status: targetStatus, position: newPosition });
  };

  const handleLogout = () => {
    signOut();
    queryClient.setQueryData(['user'], null);
    navigate('/login');
  };

  const filtered = activeTasks.filter(t => {
    if (prioFilter !== 'ALL' && t.priority !== prioFilter) return false;
    // Client-side filtering only if not in server-side search mode
    if (!debouncedSearch && search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const todo = filtered.filter(t => t.status === 'TODO');
  const inProg = filtered.filter(t => t.status === 'IN_PROGRESS');
  const done = filtered.filter(t => t.status === 'DONE');

  return (
    <motion.div className="app-wrap full-width" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <MultiplayerCursors socket={socket} />
      <div className="header">
        <div className="brand">
          <div className="logo"><IconLogo /></div>
          <div>
            <div className="title">Taskly</div>
            <div className="sub">Enterprise Kanban</div>
          </div>
          <select 
            className="input" 
            style={{ marginLeft: 24, minWidth: 180, maxWidth: 220, padding: '6px 12px' }} 
            value={workspaceId} 
            onChange={e => {
              if (e.target.value === 'NEW_WORKSPACE') {
                const name = prompt('Enter new workspace name:');
                if (name && name.trim()) {
                  createWsMutation.mutate(name.trim());
                }
                // Reset select back to current workspace (prevent it from staying on NEW_WORKSPACE)
                e.target.value = workspaceId;
              } else {
                handleWorkspaceChange(e.target.value);
              }
            }}
          >
            {workspaces.length === 0 && <option value="" disabled>No workspaces</option>}
            {workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.name}</option>)}
            <option value="NEW_WORKSPACE">+ Create New Workspace...</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Online/Offline indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: isOnline ? '#4ade80' : '#f87171', opacity: 0.8 }}>
            {isSyncing ? <Loader2 size={14} className="spin" /> : isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isSyncing ? 'Syncing...' : isOnline ? 'Online' : 'Offline'}</span>
          </div>
          {/* Undo button */}
          {!timeTravelMode && (
            <button 
              className="btn secondary" 
              style={{ padding: '8px' }} 
              title="Global Undo (Ctrl+Z)" 
              disabled={!workspaceId || undoMutation.isPending}
              onClick={() => {
                // Find the last task that was modified locally to guess which one to undo on
                // In a true enterprise app, this would be a "Global Undo" route on the workspace
                // For now, we'll undo the last global workspace action if we had a specific ID, 
                // but our backend undoLastAction (POST /:id/undo) requires a task ID.
                // BUG FIX: We should actually have a /workspaces/:id/undo route.
                // For now, we'll find the most recently updated task.
                const lastTask = [...localTasks].sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
                if (lastTask) undoMutation.mutate(lastTask.id);
              }}
            >
              {undoMutation.isPending ? <Loader2 size={16} className="spin" /> : <Undo2 size={16} />}
            </button>
          )}
          {timeTravelMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(124,92,255,0.3)' }}>
              <History size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <input type="datetime-local" className="input" style={{ padding: '4px 8px', fontSize: 13, width: 190 }} value={timeTravelDate} onChange={e => setTimeTravelDate(e.target.value)} />
              <button className="btn secondary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setTimeTravelMode(false)}><X size={14} /> Exit</button>
            </div>
          ) : (
            <button className="btn secondary" disabled={!workspaceId} onClick={() => setTimeTravelMode(true)}><History size={16} /> Rewind</button>
          )}

          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }}>
            <button 
              className={`btn ${viewMode === 'KANBAN' ? '' : 'secondary'}`} 
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, border: 'none' }}
              onClick={() => setViewMode('KANBAN')}
            >
              <Layout size={14} style={{ marginRight: 6 }} /> Board
            </button>
            <button 
              className={`btn ${viewMode === 'GRAPH' ? '' : 'secondary'}`} 
              style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, border: 'none' }}
              onClick={() => setViewMode('GRAPH')}
            >
              <Network size={14} style={{ marginRight: 6 }} /> Graph
            </button>
          </div>

          <div className="notification-wrapper">
            <button onClick={() => setNotificationsOpen(!notificationsOpen)} className="btn-icon">
              <Bell size={20} />
              {notifications?.some(n => !n.read) && <span className="notification-dot" />}
            </button>
            <AnimatePresence>
              {notificationsOpen && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="notification-dropdown">
                  <h4>Notifications</h4>
                  {notifications?.length === 0 ? <p className="p-4 text-center">No notifications</p> : notifications?.map(n => (
                    <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`} onClick={() => { markNotificationRead(n.id); setNotificationsOpen(false); }}>
                      <p>{n.body}</p>
                      <span>{new Date(n.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={() => setAnalyticsOpen(true)} className="btn-icon" title="Analytics"><BarChart3 size={20} /></button>
          <button onClick={() => setBillingOpen(true)} className="btn-icon" title="Billing"><CreditCard size={20} /></button>
          <button className="btn secondary" style={{padding: '8px'}} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="btn" disabled={!workspaceId || timeTravelMode} onClick={() => setShowForm(true)} style={{ whiteSpace: 'nowrap' }}>
            <Plus size={16} /> New Task
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={user?.email} />
            <button className="btn secondary" onClick={() => setShowMembers(true)} title="Team Members">
              <Users size={16} />
            </button>
            <button className="btn secondary" onClick={() => setShowWebhooks(true)} title="Integrations">
              <Link size={16} />
            </button>
            <button className="btn secondary" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </div>

      {!workspaceId ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 20 }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}>
            <LayoutList size={80} style={{ opacity: 0.1 }} />
          </motion.div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Welcome to Taskly</h2>
            <p style={{ color: 'var(--muted)', maxWidth: '400px' }}>
              Your workspace is the home for all your projects. Create your first organization to start managing tasks.
            </p>
          </div>
          <button className="btn" onClick={() => {
            const name = prompt('Enter your new workspace name:');
            if (name && name.trim()) createWsMutation.mutate(name.trim());
          }}>
            <Plus size={18} /> Create First Workspace
          </button>
        </div>
      ) : (
        <>
          {timeTravelMode && (
        <div style={{ background: 'linear-gradient(90deg, rgba(124,92,255,0.15), rgba(90,166,255,0.1))', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
          <History size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span><strong style={{ color: 'var(--text)' }}>Time Machine Active</strong> — You are viewing a read-only snapshot of the board. All edits and drag-and-drop are disabled.</span>
        </div>
      )}

      {!isOnline && (
        <div className="offline-banner">
          <WifiOff size={16} style={{ color: '#f87171', flexShrink: 0 }} />
          <span><strong style={{ color: 'var(--text)' }}>You are offline</strong> — Changes are saved locally and will sync automatically when you reconnect.</span>
        </div>
      )}

      <div className="filters">
        <div style={{ position: 'relative', flex: 1, display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <SearchIcon size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
            <input 
              className="input search" 
              style={{ paddingLeft: 36 }}
              placeholder={searchMode === 'AI' ? "Ask anything... (Semantic AI)" : "Search tasks (Full-text)..."} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
            {isSearching && (
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <Loader2 size={16} className="spin" style={{ opacity: 0.5 }} />
              </div>
            )}
          </div>
          
          {searchCapabilities?.semantic && (
            <button 
              className={`btn ${searchMode === 'AI' ? '' : 'secondary'}`}
              style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}
              onClick={() => setSearchMode(prev => prev === 'AI' ? 'DEFAULT' : 'AI')}
            >
              <Brain size={16} />
              <span>AI Search</span>
            </button>
          )}
        </div>

        <select className="input" value={prioFilter} onChange={e => setPrioFilter(e.target.value)}>
          <option value="ALL">All Priorities</option>
          <option value="HIGH">High Priority</option>
          <option value="MEDIUM">Medium Priority</option>
          <option value="LOW">Low Priority</option>
        </select>
      </div>

      {isLoading ? (
        <div className="kanban-board">
          {[1, 2, 3].map(col => (
            <div key={col} className="kanban-col">
              <div className="col-header"><div className="skeleton-card" style={{height:20, width:'40%', padding:0}}></div></div>
              <div className="col-body"><div className="skeleton-card"></div></div>
            </div>
          ))}
        </div>
      ) : viewMode === 'GRAPH' ? (
        <DependencyGraph tasks={activeTasks} dependencies={dependencies} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="kanban-board">
            <DroppableColumn id="TODO" title="To Do" tasks={todo} onEdit={openEdit} onDelete={handleDelete} readOnly={timeTravelMode} />
            <DroppableColumn id="IN_PROGRESS" title="In Progress" tasks={inProg} onEdit={openEdit} onDelete={handleDelete} readOnly={timeTravelMode} />
            <DroppableColumn id="DONE" title="Done" tasks={done} onEdit={openEdit} onDelete={handleDelete} readOnly={timeTravelMode} />
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} onEdit={()=>{}} onDelete={()=>{}} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </>
  )}

      <AnimatePresence>
        {showForm && (
          <motion.div className="modal-overlay" onClick={closeForm} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" onClick={e => e.stopPropagation()} initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
              <h3>{editingId ? 'Edit Task' : 'New Task'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Title</label>
                <input className="input" autoFocus value={form.title} onChange={e => setForm({...form, title: e.target.value})} required disabled={timeTravelMode || currentRole === 'VIEWER'} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <RichTextEditor 
                  content={form.description} 
                  onChange={(html) => setForm({...form, description: html})} 
                  placeholder="Add rich details, lists, or code blocks..."
                  readOnly={timeTravelMode || currentRole === 'VIEWER'}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} disabled={timeTravelMode || currentRole === 'VIEWER'}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" className="input" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} disabled={timeTravelMode || currentRole === 'VIEWER'} />
                </div>
              </div>
              <div className="form-group">
                <label>Tags (comma separated)</label>
                <input className="input" value={form.tags} onChange={e => setForm({...form, tags: e.target.value})} placeholder="e.g. Frontend, Bug" disabled={timeTravelMode || currentRole === 'VIEWER'} />
              </div>
              
              {!timeTravelMode && currentRole !== 'VIEWER' && (
                <div className="modal-actions" style={{marginTop: '20px'}}>
                  <button type="button" className="btn secondary" onClick={closeForm}>Cancel</button>
                  <button type="submit" className="btn" disabled={createMutation.isPending || editMutation.isPending}>
                    {editingId ? 'Save Changes' : 'Create Task'}
                  </button>
                </div>
              )}
              {(timeTravelMode || currentRole === 'VIEWER') && (
                <div className="modal-actions" style={{marginTop: '20px'}}>
                  <button type="button" className="btn" onClick={closeForm}>Close</button>
                </div>
              )}
            </form>
            {editingId && (
              <>
                <TaskAttachments taskId={editingId} />
                <TaskComments taskId={editingId} workspaceId={workspaceId} />
                <TaskActivity taskId={editingId} />
              </>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette 
        isOpen={isCpOpen} 
        onClose={() => setIsCpOpen(false)} 
        tasks={localTasks}
        onAction={handleCommandAction}
      />

      {/* Webhook Settings Modal */}
      <AnimatePresence>
        {showWebhooks && (
          <motion.div className="modal-overlay" onClick={() => setShowWebhooks(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" onClick={e => e.stopPropagation()} initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0 }}>Workspace Integrations</h3>
                <button className="btn secondary" style={{ padding: 6 }} onClick={() => setShowWebhooks(false)}><X size={16} /></button>
              </div>
              
              <div className="form-group">
                <label>Outgoing Webhooks</label>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                  Receive real-time notifications in Slack, Discord, or your own server when tasks are created or moved.
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  <input id="webhook-url" className="input" placeholder="https://your-server.com/webhook" style={{ flex: 1 }} />
                  <button className="btn" onClick={() => {
                    const url = document.getElementById('webhook-url').value;
                    if (url) {
                      addWebhookMutation.mutate(url);
                      document.getElementById('webhook-url').value = '';
                    }
                  }}>Add</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {webhooks.length === 0 && <div style={{ textAlign: 'center', padding: 20, opacity: 0.5 }}>No webhooks configured</div>}
                  {webhooks.map(wh => (
                    <div key={wh.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{wh.url}</div>
                      <button className="btn secondary danger" style={{ padding: 4 }} onClick={() => deleteWebhookMutation.mutate(wh.id)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team Modal */}
      <AnimatePresence>
        {showMembers && (
          <div className="modal-overlay" onClick={() => setShowMembers(false)}>
            <motion.div 
              className="modal" 
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>Team Management</h2>
                <button className="btn secondary" style={{ padding: 6 }} onClick={() => setShowMembers(false)}><X size={20} /></button>
              </div>
              <WorkspaceMembers workspaceId={workspaceId} currentRole={currentRole} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnalyticsModal isOpen={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
      <BillingModal isOpen={billingOpen} onClose={() => setBillingOpen(false)} />
    </motion.div>
  );
}
