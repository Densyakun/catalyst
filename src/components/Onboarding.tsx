'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';

const STEPS = [
  {
    title: '今、いちばん困っていることは？',
    description: '仕事・生活・人間関係など、なんでも構いません。1つだけ教えてください。',
    placeholder: '例: 副業を始めたいけど、何から手をつければいいか分からない',
    optional: false,
  },
  {
    title: '今使えるものは？',
    description: '時間・お金・スキル・道具・人脈など、使える資源を自由に書いてください。',
    placeholder: '例: 平日の夜に2時間、Web制作のスキル、月1万円まで',
    optional: true,
  },
  {
    title: '今週やりたいこと・やりたくないことは？',
    description: '目標でも、避けたいことでも構いません。',
    placeholder: '例: 週末に1つだけでも具体的な一歩を踏み出したい',
    optional: true,
  },
];

export default function Onboarding({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(['', '', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = STEPS[step];

  const update = (value: string) => {
    setAnswers((prev) => prev.map((answer, index) => (index === step ? value : answer)));
  };

  const canNext = current.optional || answers[step].trim().length > 0;

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const input = [
        `【今の困りごと】\n${answers[0].trim()}`,
        answers[1].trim() ? `【今使えるリソース】\n${answers[1].trim()}` : '',
        answers[2].trim() ? `【今週やりたいこと・やりたくないこと】\n${answers[2].trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '課題の整理に失敗しました');

      if (answers[1].trim()) {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `今使えるリソース: ${answers[1].trim()}` }),
        }).catch(() => null);
      }

      localStorage.setItem('katalyse_onboarding_done', '1');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!canNext) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      void finish();
    }
  };

  const skip = () => {
    localStorage.setItem('katalyse_onboarding_done', '1');
    onSkip();
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: 'clamp(1rem, 3vw, 1.5rem)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.05))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--accent-color)' }}>
          <Sparkles size={14} /> 3問だけ、はじめの整理
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {STEPS.map((_, index) => (
            <span
              key={index}
              style={{
                width: '18px',
                height: '3px',
                borderRadius: '999px',
                background: index <= step ? 'var(--accent-color)' : 'rgba(255,255,255,0.12)',
              }}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
        >
          <h3 style={{ fontSize: '1.05rem', marginBottom: '0.2rem' }}>{current.title}</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
            {current.description}
            {current.optional ? '（任意）' : ''}
          </p>
          <textarea
            value={answers[step]}
            onChange={(event) => update(event.target.value)}
            placeholder={current.placeholder}
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '0.6rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--glass-border)',
              borderRadius: '10px',
              color: 'white',
              fontFamily: 'inherit',
              fontSize: '0.85rem',
            }}
          />
        </motion.div>
      </AnimatePresence>

      {error && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.4rem' }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={skip}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.72rem', padding: 0 }}
        >
          あとで設定する
        </button>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={saving}
              style={{
                padding: '0.45rem 0.8rem',
                fontSize: '0.78rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                color: 'white',
              }}
            >
              戻る
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!canNext || saving}
            className="btn-primary"
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              opacity: !canNext || saving ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : null}
            {step === STEPS.length - 1 ? (saving ? '整理中...' : 'はじめる') : '次へ'}
            {!saving && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
