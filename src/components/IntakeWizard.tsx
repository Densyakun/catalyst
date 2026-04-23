'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, ArrowRight, Loader2 } from 'lucide-react';

interface IntakeWizardProps {
  onResult: (result: any) => void;
}

export default function IntakeWizard({ onResult }: IntakeWizardProps) {
  const [answers, setAnswers] = useState<{ question: string, answer: string }[]>([]);
  const [currentStep, setCurrentStep] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  // 最初の質問を取得
  useEffect(() => {
    fetchNextStep([]);
  }, []);

  const fetchNextStep = async (currentAnswers: any[]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: currentAnswers }),
      });
      const data = await res.json();
      
      if (data.type === 'result') {
        onResult(data);
      } else {
        setCurrentStep(data);
      }
    } catch (err) {
      console.error('Wizard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (answer: string) => {
    const newAnswers = [...answers, { question: currentStep.question, answer }];
    setAnswers(newAnswers);
    setInputValue('');
    fetchNextStep(newAnswers);
  };

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
          {loading ? (
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
