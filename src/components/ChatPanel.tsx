'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, Loader2, Plus, ChevronDown,
  AlertCircle, Package, Lightbulb, X, FileSearch,
} from 'lucide-react';
import type { Conversation, ChatMessage } from '@/lib/types/engine';

export interface EditingInsight {
  id: string;
  title: string;
  content: string;
}

interface ChatPanelProps {
  editingInsight?: EditingInsight | null;
  onClearEditingInsight?: () => void;
  onInsightUpdated?: () => void;
}

export default function ChatPanel({ editingInsight, onClearEditingInsight, onInsightUpdated }: ChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [extractedSummary, setExtractedSummary] = useState<{
    problems: string[];
    resources: string[];
    info: string[];
  } | null>(null);
  const [reinvestigateResult, setReinvestigateResult] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, []);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversation = (conv: Conversation) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages || []);
    setShowHistory(false);
    setExtractedSummary(null);
  };

  const startNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setExtractedSummary(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const body: Record<string, string | null> = {
        conversation_id: activeConvId,
        message: userMsg.content,
      };
      if (editingInsight) {
        body.editing_insight_id = editingInsight.id;
        body.editing_insight_title = editingInsight.title;
        body.editing_insight_content = editingInsight.content;
      }

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveConvId(data.conversation_id);
        setMessages((prev) => [...prev, data.reply]);
        setExtractedSummary(data.extracted_items);
        setReinvestigateResult(data.reinvestigate_result || null);
        if (data.insight_updated) {
          onInsightUpdated?.();
        }
        fetchConversations();
      }
    } catch (err) {
      console.error('Send message error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const extractedCount = extractedSummary
    ? extractedSummary.problems.length + extractedSummary.resources.length + extractedSummary.info.length
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: '0.8rem', marginBottom: 0 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, fontSize: '0.85rem' }}>
          <MessageSquare size={14} className="text-accent" />
          チャット
        </h3>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
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
            <ChevronDown size={12} style={{ transform: showHistory ? 'rotate(180deg)' : 'none' }} />
            履歴
          </button>
          <button
            onClick={startNewConversation}
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
            <Plus size={12} />
            新規
          </button>
        </div>
      </div>

      {/* Conversation History */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginBottom: '0.5rem' }}
          >
            <div style={{
              maxHeight: '150px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}>
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv)}
                  style={{
                    background: conv.id === activeConvId ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    padding: '0.4rem 0.6rem',
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '0.8rem',
                  }}
                >
                  {conv.title || '無題の会話'}
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                    {new Date(conv.updated_at).toLocaleDateString('ja-JP')}
                  </span>
                </button>
              ))}
              {conversations.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0.5rem' }}>
                  会話履歴はありません
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editing Insight Banner */}
      {editingInsight && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0.6rem',
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '6px',
          marginBottom: '0.4rem',
          fontSize: '0.7rem',
          color: '#a78bfa',
        }}>
          <Lightbulb size={10} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            編集中: {editingInsight.title}
          </span>
          <button
            onClick={onClearEditingInsight}
            style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: 0, display: 'flex' }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={{
        maxHeight: '200px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        marginBottom: '0.5rem',
        padding: '0.4rem',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: '6px',
        minHeight: '60px',
      }}>
        {messages.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>
            課題やリソースを自動で検出します
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '0.5rem 0.7rem',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.05)',
              fontSize: '0.85rem',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '0.5rem 0.7rem',
              borderRadius: '12px 12px 12px 2px',
              background: 'rgba(255,255,255,0.05)',
            }}>
              <Loader2 className="animate-spin" size={14} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Extracted Items Notification */}
      {extractedSummary && extractedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '0.5rem 0.7rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: '6px',
            marginBottom: '0.5rem',
            fontSize: '0.75rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            alignItems: 'center',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>検出:</span>
          {extractedSummary.problems.map((p, i) => (
            <span key={`p-${i}`} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.15rem',
              padding: '0.1rem 0.3rem',
              background: 'rgba(239, 68, 68, 0.15)',
              borderRadius: '3px',
              color: '#ef4444',
            }}>
              <AlertCircle size={10} /> {p.description}
            </span>
          ))}
          {extractedSummary.resources.map((r, i) => (
            <span key={`r-${i}`} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.15rem',
              padding: '0.1rem 0.3rem',
              background: 'rgba(59, 130, 246, 0.15)',
              borderRadius: '3px',
              color: '#3b82f6',
            }}>
              <Package size={10} /> {r.name}
            </span>
          ))}
          {extractedSummary.info.map((info, i) => (
            <span key={`i-${i}`} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.15rem',
              padding: '0.1rem 0.3rem',
              background: 'rgba(245, 158, 11, 0.15)',
              borderRadius: '3px',
              color: '#f59e0b',
            }}>
              <Lightbulb size={10} /> {info}
            </span>
          ))}
        </motion.div>
      )}

      {/* Reinvestigate Result */}
      {reinvestigateResult && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '0.4rem 0.6rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '6px',
            marginBottom: '0.4rem',
            fontSize: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            color: '#60a5fa',
          }}
        >
          <FileSearch size={10} />
          {reinvestigateResult}
        </motion.div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={editingInsight ? `「${editingInsight.title}」をどう修正しますか？` : "困っていること、やりたいこと、持っているリソースなど..."}
          disabled={sending}
          style={{
            flex: 1,
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
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="btn-primary"
          style={{
            padding: '0.4rem 0.6rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.8rem',
          }}
        >
          {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
        </button>
      </div>
    </motion.div>
  );
}
