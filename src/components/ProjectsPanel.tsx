'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderKanban, ChevronDown, ChevronUp, CheckCircle2,
  Clock, Zap, User, Loader2, ArrowRight, DollarSign, Users,
} from 'lucide-react';
import type { Project, ProjectTask } from '@/lib/types/engine';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  planning: { label: '計画中', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  in_progress: { label: '進行中', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  completed: { label: '完了', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  on_hold: { label: '保留', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
};

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待機', color: '#6b7280' },
  ready: { label: '実行可', color: '#f59e0b' },
  in_progress: { label: '実行中', color: '#3b82f6' },
  completed: { label: '完了', color: '#22c55e' },
  blocked: { label: 'ブロック', color: '#ef4444' },
};

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executingTask, setExecutingTask] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const executeTask = async (projectId: string, taskId: string) => {
    setExecutingTask(taskId);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchProjects();
      }
    } catch (err) {
      console.error('Task execution error:', err);
    } finally {
      setExecutingTask(null);
    }
  };

  const completeUserTask = async (projectId: string, taskId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      fetchProjects();
    } catch (err) {
      console.error('Task complete error:', err);
    }
  };

  const executeAllReady = async (project: Project) => {
    const readyTasks = (project.tasks || []).filter(
      (t) => t.status === 'ready' && t.execution_type !== 'user',
    );
    for (const task of readyTasks) {
      await executeTask(project.id, task.id);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (projects.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: '0.8rem', marginBottom: 0 }}
    >
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
        <FolderKanban size={14} className="text-accent" />
        プロジェクト
        <span style={{
          padding: '0.1rem 0.4rem',
          background: 'rgba(99, 102, 241, 0.2)',
          borderRadius: '10px',
          fontSize: '0.7rem',
          color: 'var(--accent-color)',
        }}>
          {projects.length}
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {projects.map((project) => {
          const tasks = project.tasks || [];
          const completedTasks = tasks.filter((t) => t.status === 'completed').length;
          const readyTasks = tasks.filter((t) => t.status === 'ready' && t.execution_type !== 'user');
          const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.planning;
          const expanded = expandedId === project.id;

          return (
            <motion.div
              key={project.id}
              layout
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px',
                border: '1px solid var(--glass-border)',
                overflow: 'hidden',
              }}
            >
              {/* Project Header */}
              <div
                onClick={() => setExpandedId(expanded ? null : project.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.7rem 0.8rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {project.title}
                    </span>
                    {project.is_social && (
                      <span title="社会課題" style={{ display: 'inline-flex', flexShrink: 0 }}>
                        <Users size={12} style={{ color: '#8b5cf6' }} />
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    <span>{completedTasks}/{tasks.length} タスク</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                      <DollarSign size={10} />
                      ¥{Number(project.total_estimated_cost).toLocaleString()}
                    </span>
                    {project.estimated_beneficiaries && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                        <Users size={10} />
                        ~{project.estimated_beneficiaries}人
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  <span style={{
                    padding: '0.15rem 0.4rem',
                    background: status.bg,
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    color: status.color,
                  }}>
                    {status.label}
                  </span>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>

              {/* Task List */}
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      padding: '0 0.8rem 0.8rem',
                      borderTop: '1px solid var(--glass-border)',
                    }}>
                      {project.description && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
                          {project.description}
                        </p>
                      )}

                      {/* Execute all ready */}
                      {readyTasks.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); executeAllReady(project); }}
                          className="btn-primary"
                          style={{
                            width: '100%',
                            padding: '0.4rem',
                            fontSize: '0.8rem',
                            marginBottom: '0.5rem',
                            marginTop: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <Zap size={14} />
                          実行可能なタスクをすべて進める ({readyTasks.length}件)
                        </button>
                      )}

                      {/* Tasks */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
                        {tasks.map((task, idx) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            index={idx}
                            projectId={project.id}
                            executing={executingTask === task.id}
                            onExecute={executeTask}
                            onComplete={completeUserTask}
                          />
                        ))}
                      </div>

                      {/* Cost Summary */}
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.4rem 0.5rem',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}>
                        <span>推定コスト: ¥{Number(project.total_estimated_cost).toLocaleString()}</span>
                        <span>実コスト: ¥{Number(project.total_actual_cost).toLocaleString()}</span>
                        {project.is_social && project.estimated_beneficiaries && (
                          <span>
                            推定負担: ¥{Math.round(Number(project.total_estimated_cost) / project.estimated_beneficiaries).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function TaskRow({
  task,
  index,
  projectId,
  executing,
  onExecute,
  onComplete,
}: {
  task: ProjectTask;
  index: number;
  projectId: string;
  executing: boolean;
  onExecute: (projectId: string, taskId: string) => void;
  onComplete: (projectId: string, taskId: string) => void;
}) {
  const taskStatus = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.pending;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
      padding: '0.4rem 0.5rem',
      background: task.status === 'completed' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255,255,255,0.02)',
      borderRadius: '6px',
      borderLeft: `3px solid ${taskStatus.color}`,
    }}>
      {/* Status icon */}
      <div style={{ flexShrink: 0, width: '16px' }}>
        {task.status === 'completed' ? (
          <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
        ) : task.status === 'in_progress' || executing ? (
          <Loader2 className="animate-spin" size={14} style={{ color: '#3b82f6' }} />
        ) : (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{index + 1}</span>
        )}
      </div>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{
            fontSize: '0.8rem',
            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
            color: task.status === 'completed' ? 'var(--text-secondary)' : 'white',
          }}>
            {task.title}
          </span>
          {task.execution_type === 'user' && (
            <span title="ユーザー実行" style={{ display: 'inline-flex', flexShrink: 0 }}>
              <User size={10} style={{ color: '#f59e0b' }} />
            </span>
          )}
          {task.execution_type === 'auto' && (
            <span title="自動実行" style={{ display: 'inline-flex', flexShrink: 0 }}>
              <Zap size={10} style={{ color: '#22c55e' }} />
            </span>
          )}
        </div>
      </div>

      {/* Cost */}
      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
        <Clock size={9} style={{ marginRight: '0.1rem' }} />
        ¥{Number(task.estimated_cost).toLocaleString()}
      </span>

      {/* Action */}
      {task.status === 'ready' && task.execution_type !== 'user' && (
        <button
          onClick={(e) => { e.stopPropagation(); onExecute(projectId, task.id); }}
          disabled={executing}
          style={{
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '4px',
            padding: '0.15rem 0.4rem',
            color: '#22c55e',
            cursor: 'pointer',
            fontSize: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.15rem',
            flexShrink: 0,
          }}
        >
          {executing ? <Loader2 className="animate-spin" size={10} /> : <ArrowRight size={10} />}
          実行
        </button>
      )}

      {task.status === 'ready' && task.execution_type === 'user' && (
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(projectId, task.id); }}
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '4px',
            padding: '0.15rem 0.4rem',
            color: '#f59e0b',
            cursor: 'pointer',
            fontSize: '0.7rem',
            flexShrink: 0,
          }}
        >
          完了報告
        </button>
      )}
    </div>
  );
}
