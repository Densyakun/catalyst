'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';

export default function DiagnosisForm({ onResult }: { onResult: (data: any) => void }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '予期せぬエラーが発生しました');
      }
      
      onResult(data);
    } catch (error: any) {
      console.error('Submit error:', error);
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel"
    >
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Sparkles size={24} color="var(--accent-color)" />
        現状の課題を教えてください
      </h2>
      
      <form onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例：最近、ゲームのモチベーションが上がらず、何をすればいいか分かりません。時間は夜の2時間くらいあります。"
          style={{
            width: '100%',
            minHeight: '150px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            color: 'white',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '1rem',
            resize: 'vertical'
          }}
        />
        
        <button 
          type="submit" 
          className="btn-primary"
          disabled={isLoading}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              解析を開始する
              <ArrowRight size={20} />
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
