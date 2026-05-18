'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, ArrowRight, Loader2, RotateCcw, Play, ChevronDown, ChevronUp, History, Plus, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface IntakeWizardProps {
  onResult: (result: any) => void;
}

const MAX_EXPECTED_STEPS = 8;
const MIN_STEPS = 3;

export default function IntakeWizard({ onResult }: IntakeWizardProps) {
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [currentStep, setCurrentStep] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<{ message: string; stack?: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingInput, setPendingInput] = useState('');
  const [showNewSession, setShowNewSession] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkActiveSession();
  }, []);

  useEffect(() => {
    if (!loading && !thinking && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, thinking, currentStep]);

  const checkActiveSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      initNewSession(null);
      return;
    }

    const { data, error } = await supabase
      .from('diagnostic_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_completed', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      setResumePrompt(data);
    } else {
      initNewSession(null);
    }
  };

  const initNewSession = async (userId: string | null) => {
    if (userId) {
      const { data, error } = await supabase
        .from('diagnostic_sessions')
        .insert({
          user_id: userId,
          answers: [],
          is_completed: false,
          context: '新しい診断セッション'
        })
        .select()
        .single();
      
      if (!error && data) {
        setSessionId(data.id);
      }
    }
    fetchNextStep([]);
  };

  const handleResume = (session: any) => {
    setAnswers(session.answers || []);
    setCurrentStep(session.current_question);
    setSessionId(session.id);
    setResumePrompt(null);
  };

  const handleStartFresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (sessionId) {
      await supabase.from('diagnostic_sessions').delete().eq('id', sessionId);
    }
    
    setResumePrompt(null);
    setAnswers([]);
    setCurrentStep(null);
    setIsCompleted(false);
    initNewSession(user?.id || null);
  };

  const fetchNextStep = async (currentAnswers: any[]) => {
    setLoading(true);
    setThinking(false);
    setError(null);
    
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: currentAnswers,
          sessionId: sessionId
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'サーバーでエラーが発生しました。');
      }

      const data = await res.json();
      
      if (data.type === 'result') {
        setIsCompleted(true);
        if (sessionId) {
          await supabase
            .from('diagnostic_sessions')
            .update({ is_completed: true })
            .eq('id', sessionId);
        }
        onResult(data);
      } else {
        setCurrentStep(data);
        if (sessionId) {
          await supabase.from('diagnostic_sessions').upsert({
            id: sessionId,
            answers: currentAnswers,
            current_question: data,
            is_completed: false,
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error('Wizard error:', err);
      setError({
        message: err.message || '通信エラーが発生しました。しばらく待ってから再試行してください。',
        stack: err.stack
      });
    } finally {
      setLoading(false);
      setThinking(false);
    }
  };

  const handleRetry = () => {
    fetchNextStep(answers);
  };

  const handleAnswer = (answer: string, isPending = false) => {
    const newAnswers = [...answers, { question: currentStep?.question || '初期質問', answer }];
    setAnswers(newAnswers);
    setInputValue('');
    setPendingInput('');
    
    if (!isPending) {
      setThinking(true);
    }
    
    fetchNextStep(newAnswers);
  };

  const handlePendingSubmit = () => {
    if (pendingInput.trim()) {
      handleAnswer(pendingInput.trim(), true);
      setPendingInput('');
    }
  };

  const progressPercent = Math.min((answers.length / MAX_EXPECTED_STEPS) * 100, 90);
  const estimatedStepsLeft = Math.max(MIN_STEPS, MAX_EXPECTED_STEPS - answers.length);

  if (resumePrompt) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel"
        style={{ padding: '3rem', textAlign: 'center' }}
      >
        <div style={{ background: 'rgba(99, 102, 241, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
          <RotateCcw size={30} className="text-accent" />
        </div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>中断された診断があります</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          前回の診断を続きから再開しますか？
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
          {resumePrompt.answers?.length || 0} 回答済み • {new Date(resumePrompt.updated_at).toLocaleDateString('ja-JP')}
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <button onClick={() => handleResume(resumePrompt)} className="btn-primary" style={{ padding: '1rem' }}>
            <Play size={18} style={{ marginRight: '0.5rem' }} /> 再開する
          </button>
          <button onClick={handleStartFresh} style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '12px', color: 'white' }}>
            新しく開始
          </button>
        </div>
      </motion.div>
    );
  }

  if (!currentStep && loading) {
    return (
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center' }}>
        <Loader2 className="animate-spin" size={40} style={{ margin: '0 auto 1rem', color: 'var(--accent-color)' }} />
        <p>診断を開始しています...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
      style={{ padding: '2.5rem', minHeight: '450px', display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)' }}>
            <Sparkles size={20} />
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>INTAKE</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '20px',
              fontSize: '0.85rem'
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>進捗</span>
              <div style={{ 
                width: '80px', 
                height: '6px', 
                background: 'rgba(255,255,255,0.1)', 
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${progressPercent}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, var(--accent-color), #818cf8)',
                  borderRadius: '3px',
                  transition: 'width 0.5s ease'
                }} />
              </div>
              <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{answers.length}</span>
            </div>
            
            <button
              onClick={() => setShowHistory(!showHistory)}
              style={{
                padding: '0.5rem',
                background: showHistory ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <History size={18} />
            </button>
          </div>
        </div>
        
        <h2 style={{ fontSize: '1.4rem', lineHeight: 1.4 }}>{currentStep?.question}</h2>
        
        {answers.length > 0 && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            あと推定 {estimatedStepsLeft} 問
          </div>
        )}
      </header>

      <AnimatePresence mode="wait">
        <div style={{ flex: 1 }}>
          {showHistory && answers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1.5rem',
                maxHeight: '150px',
                overflow: 'auto'
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 'bold' }}>
                これまでの回答
              </div>
              {answers.map((a, i) => (
                <div key={i} style={{ 
                  display: 'flex', 
                  gap: '0.75rem', 
                  padding: '0.5rem 0',
                  borderBottom: i < answers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
                }}>
                  <span style={{ 
                    background: 'var(--accent-color)', 
                    color: 'white', 
                    borderRadius: '50%', 
                    width: '20px', 
                    height: '20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    flexShrink: 0
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                      {a.question.length > 50 ? a.question.slice(0, 50) + '...' : a.question}
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>{a.answer}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ padding: '1.5rem', background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', borderRadius: '12px', textAlign: 'center' }}
            >
              <p style={{ color: '#ff4444', marginBottom: '0.5rem' }}>{error.message}</p>
              {error.stack && (
                <pre style={{ 
                  fontSize: '0.75rem', 
                  color: '#ff8888', 
                  textAlign: 'left', 
                  marginTop: '1rem', 
                  padding: '1rem', 
                  background: 'rgba(0,0,0,0.3)', 
                  borderRadius: '8px',
                  overflow: 'auto',
                  maxHeight: '100px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {error.stack}
                </pre>
              )}
              <button 
                onClick={handleRetry}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem', marginTop: '0.5rem' }}
              >
                再試行する
              </button>
            </motion.div>
          ) : loading || thinking ? (
            <motion.div 
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ padding: '2rem', textAlign: 'center' }}
            >
              <Loader2 className="animate-spin" size={30} style={{ margin: '0 auto 1rem', color: 'var(--accent-color)' }} />
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>AIが思考中...</p>
              
              <div style={{ 
                padding: '1rem', 
                background: 'rgba(255,255,255,0.03)', 
                borderRadius: '12px',
                border: '1px solid var(--glass-border)'
              }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  この間に気になることがあれば、下の自由回答欄に入力できます
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={pendingInput}
                    onChange={(e) => setPendingInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && pendingInput && handlePendingSubmit()}
                    placeholder="他に気になることを入力..."
                    disabled={thinking}
                    ref={inputRef}
                    style={{ 
                      flex: 1, 
                      padding: '12px', 
                      background: 'rgba(255,255,255,0.05)', 
                      border: '1px solid var(--glass-border)', 
                      borderRadius: '8px', 
                      color: 'white',
                      fontSize: '0.9rem'
                    }}
                  />
                  <button 
                    disabled={!pendingInput}
                    onClick={handlePendingSubmit}
                    style={{ 
                      padding: '12px',
                      background: pendingInput ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: pendingInput ? 'pointer' : 'not-allowed',
                      opacity: pendingInput ? 1 : 0.5
                    }}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="options"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: 'grid', gap: '0.75rem' }}
            >
              {currentStep?.options?.map((option: string, i: number) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(option)}
                  className="history-item"
                  style={{ 
                    textAlign: 'left', 
                    padding: '1rem 1.25rem', 
                    fontSize: '1rem',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{option}</span>
                  <ArrowRight size={16} style={{ opacity: 0.5 }} />
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </AnimatePresence>

      {!(loading || thinking) && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            または、具体的に入力する：
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && inputValue && handleAnswer(inputValue)}
              placeholder="ここに答えを入力..."
              ref={inputRef}
              style={{ 
                flex: 1, 
                padding: '12px', 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid var(--glass-border)', 
                borderRadius: '8px', 
                color: 'white'
              }}
            />
            <button 
              disabled={!inputValue}
              onClick={() => handleAnswer(inputValue)}
              style={{ 
                padding: '12px',
                background: inputValue ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: inputValue ? 'pointer' : 'not-allowed',
                opacity: inputValue ? 1 : 0.5
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {isCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={20} color="#22c55e" />
            <span style={{ fontSize: '0.9rem' }}>診断完了 • {answers.length} 回答</span>
          </div>
          <button
            onClick={() => {
              setShowNewSession(true);
              setIsCompleted(false);
            }}
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px solid var(--accent-color)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem'
            }}
          >
            <Plus size={16} /> 新しい診断
          </button>
        </motion.div>
      )}

      {showNewSession && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-panel"
            style={{ padding: '2rem', maxWidth: '400px', textAlign: 'center' }}
          >
            <h3 style={{ marginBottom: '1rem' }}>新しい診断を開始しますか？</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              現在の診断結果は保存済みです
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={handleStartFresh}
                className="btn-primary"
                style={{ flex: 1, padding: '0.75rem' }}
              >
                <Plus size={16} style={{ marginRight: '0.5rem' }} /> 開始
              </button>
              <button
                onClick={() => setShowNewSession(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                閉じる
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}