import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDependency, removeDependency } from '../api';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

const TaskNode = ({ data }) => {
  const prioColors = { LOW: '#4ade80', MEDIUM: '#facc15', HIGH: '#f87171' };
  
  return (
    <div style={{ 
      padding: '12px', 
      borderRadius: '8px', 
      background: 'var(--bg-card)', 
      border: '1px solid var(--border)',
      minWidth: '200px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      fontSize: '13px'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: prioColors[data.priority] }} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>{data.status}</span>
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{data.title}</div>
      {data.description && (
        <div style={{ fontSize: '11px', color: 'var(--muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxDirection: 'vertical', overflow: 'hidden' }}>
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

const nodeTypes = {
  task: TaskNode,
};

export function DependencyGraph({ tasks, dependencies }) {
  const queryClient = useQueryClient();

  const initialNodes = useMemo(() => tasks.map((t, idx) => ({
    id: t.id,
    type: 'task',
    data: t,
    position: { x: (idx % 3) * 300, y: Math.floor(idx / 3) * 200 },
  })), [tasks]);

  const initialEdges = useMemo(() => dependencies.map(d => ({
    id: `e-${d.task_id}-${d.depends_on_id}`,
    source: d.depends_on_id, // depends_on_id is the "parent/blocker"
    target: d.task_id,       // task_id is the "child/blocked"
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
    style: { stroke: '#6366f1', strokeWidth: 2 },
  })), [dependencies]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const addDepMutation = useMutation({
    mutationFn: ({ taskId, dependsOnId }) => addDependency(taskId, dependsOnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
      toast.success('Dependency added');
    },
    onError: (err) => toast.error(err.message || 'Cycle detected'),
  });

  const removeDepMutation = useMutation({
    mutationFn: ({ taskId, dependsOnId }) => removeDependency(taskId, dependsOnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependencies'] });
    },
  });

  const onConnect = useCallback((params) => {
    // source depends on target is wrong in my marker setup, let's fix logic:
    // User drags from B (source) to A (target) means A depends on B.
    addDepMutation.mutate({ taskId: params.target, dependsOnId: params.source });
  }, [addDepMutation]);

  const onEdgesDelete = useCallback((deletedEdges) => {
    deletedEdges.forEach(edge => {
      const [_, taskId, dependsOnId] = edge.id.split('-');
      removeDepMutation.mutate({ taskId, dependsOnId });
    });
  }, [removeDepMutation]);

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 200px)', background: 'var(--bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ position: 'absolute', zIndex: 5, top: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={14} />
        <span>Drag from a <strong>Blocker</strong> task to the <strong>Blocked</strong> task to create a dependency.</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap nodeColor={(n) => {
          if (n.data.priority === 'HIGH') return '#f87171';
          if (n.data.priority === 'MEDIUM') return '#facc15';
          return '#4ade80';
        }} />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
