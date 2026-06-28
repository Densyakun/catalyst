'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, Trash2, Clock, DollarSign,
  Wrench, Users, Brain, Loader2,
} from 'lucide-react';
import type { UserResource, ResourceType } from '@/lib/types/engine';

const RESOURCE_TYPE_CONFIG: Record<ResourceType, { label: string; icon: typeof Clock; color: string }> = {
  time: { label: '時間', icon: Clock, color: '#3b82f6' },
  money: { label: 'お金', icon: DollarSign, color: '#22c55e' },
  skill: { label: 'スキル', icon: Brain, color: '#8b5cf6' },
  tool: { label: 'ツール', icon: Wrench, color: '#f59e0b' },
  connection: { label: '人脈', icon: Users, color: '#ec4899' },
};

export default function ResourcesPanel() {
  const [resources, setResources] = useState<UserResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<ResourceType>('skill');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch('/api/resources');
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error('Failed to fetch resources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  const handleAdd = async () => {
    if (!formName.trim() || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: formType,
          name: formName.trim(),
          description: formDesc.trim() || undefined,
        }),
      });

      if (res.ok) {
        setFormName('');
        setFormDesc('');
        setShowForm(false);
        fetchResources();
      }
    } catch (err) {
      console.error('Add resource error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch('/api/resources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchResources();
    } catch (err) {
      console.error('Delete resource error:', err);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const grouped = resources.reduce<Record<string, UserResource[]>>((acc, r) => {
    const type = r.resource_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Package size={20} className="text-accent" />
          リソース管理
          {resources.length > 0 && (
            <span style={{
              padding: '0.1rem 0.4rem',
              background: 'rgba(99, 102, 241, 0.2)',
              borderRadius: '10px',
              fontSize: '0.7rem',
              color: 'var(--accent-color)',
            }}>
              {resources.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            padding: '0.3rem 0.5rem',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.2rem',
          }}
        >
          <Plus size={12} /> 追加
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginBottom: '0.8rem' }}
          >
            <div style={{
              padding: '0.8rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {(Object.entries(RESOURCE_TYPE_CONFIG) as [ResourceType, typeof RESOURCE_TYPE_CONFIG[ResourceType]][]).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => setFormType(type)}
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        border: formType === type ? `1px solid ${config.color}` : '1px solid var(--glass-border)',
                        background: formType === type ? `${config.color}20` : 'transparent',
                        color: formType === type ? config.color : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                      }}
                    >
                      <Icon size={10} /> {config.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="リソース名（例: JavaScript、車、友人の田中さん）"
                style={{
                  padding: '0.4rem 0.6rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="説明（任意）"
                style={{
                  padding: '0.4rem 0.6rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!formName.trim() || submitting}
                className="btn-primary"
                style={{ padding: '0.4rem', fontSize: '0.8rem' }}
              >
                {submitting ? <Loader2 className="animate-spin" size={14} /> : '追加'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resource List */}
      {resources.length === 0 && !showForm && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>
          リソースを追加すると、課題解決のアイデア生成に活用されます
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {(Object.entries(grouped) as [string, UserResource[]][]).map(([type, items]) => {
          const config = RESOURCE_TYPE_CONFIG[type as ResourceType];
          if (!config) return null;
          const Icon = config.icon;

          return (
            <div key={type}>
              <div style={{
                fontSize: '0.7rem',
                color: config.color,
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                marginBottom: '0.2rem',
                marginTop: '0.4rem',
              }}>
                <Icon size={10} /> {config.label}
              </div>
              {items.map((resource) => (
                <div
                  key={resource.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.3rem 0.5rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '6px',
                    marginBottom: '0.2rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.8rem' }}>{resource.name}</span>
                    {resource.description && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '0.3rem' }}>
                        - {resource.description}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(resource.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '0.2rem',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
