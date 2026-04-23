'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, ArrowRight, Loader2, RotateCcw, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface IntakeWizardProps {
  onResult: (result: any) => void;
}

export default function IntakeWizard({ onResult }: IntakeWizardProps) {
  const [answers, setAnswers] = useState<{ question: string, answer: string }[]>([]);
  const [currentStep, setCurrentStep] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<any>(null);

  // 起動時に未完了のセッションがあるか確認
  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      fetchNextStep([]);
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
      fetchNextStep([]);
    }
  };

  const handleResume = (session: any) => {
    setAnswers(session.answers);
    setCurrentStep(session.current_question);
    setSessionId(session.id);
    setResumePrompt(null);
  };

  const handleStartFresh = () => {
    setResumePrompt(null);
    fetchNextStep([]);
  };

  const fetchNextStep = async (currentAnswers: any[]) => {
    setLoading(true);
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
        onResult(data);
      } else {
        setCurrentStep(data);
      }
    } catch (err: any) {
      console.error('Wizard error:', err);
      setError(err.message || '通信エラーが発生しました。しばらく待ってから再試行してください。');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    fetchNextStep(answers);
  };

  const handleAnswer = (answer: string) => {
    const newAnswers = [...answers, { question: currentStep.question, answer }];
    setAnswers(newAnswers);
    setInputValue('');
    fetchNextStep(newAnswers);
  };

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
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>前回の診断を続きから再開しますか？それとも新しく開始しますか？</p>
        
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
      style={{ padding: '2.5rem', minHeight: '400px', display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', marginBottom: '0.5rem' }}>
          <Sparkles size={20} />
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>INTAKE AGENT</span>
        </div>
        <h2 style={{ fontSize: '1.5rem', lineHeight: 1.4 }}>{currentStep?.question}</h2>
      </header>

      <div style={{ flex: 1 }}>
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ padding: '1.5rem', background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', borderRadius: '12px', textAlign: 'center' }}
            >
              <p style={{ color: '#ff4444', marginBottom: '1rem' }}>{error}</p>
              <button 
                onClick={handleRetry}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem' }}
              >
                再試行する
              </button>
            </motion.div>
          ) : loading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ padding: '2rem', textAlign: 'center' }}
            >
              <Loader2 className="animate-spin" size={30} style={{ margin: '0 auto 1rem', color: 'var(--accent-color)' }} />
              <p style={{ color: 'var(--text-secondary)' }}>AIが思考中...</p>
            </motion.div>
          ) : (
            <motion.div 
              key="options"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{ display: 'grid', gap: '1rem' }}
            >
              {currentStep?.options?.map((option: string, i: number) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(option)}
                  className="history-item"
                  style={{ 
                    textAlign: 'left', 
                    padding: '1rem 1.5rem', 
                    fontSize: '1rem', 
                    background: 'rgba(255,255,255,0.03)',
                    color: 'white' // 視認性向上のために追加
                  }}
                >
                  {option}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.8rem' }}>または、具体的に入力する：</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && inputValue && handleAnswer(inputValue)}
            placeholder="ここに答えを入力..."
            style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white' }}
          />
          <button 
            disabled={!inputValue || loading}
            onClick={() => handleAnswer(inputValue)}
            className="btn-primary" 
            style={{ padding: '12px' }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
