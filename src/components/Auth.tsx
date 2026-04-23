'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sparkles, ArrowRight, User, Mail, Lock, LogIn } from 'lucide-react';

export default function AuthUI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEmailMode, setIsEmailMode] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 匿名ログイン
  const handleAnonymousSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // メールアドレス認証
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setError('確認メールを送信しました。メールを確認してください。');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // OAuth ログイン
  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '440px', margin: '80px auto', padding: '3rem', textAlign: 'center' }}>
      <header style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'inline-flex', padding: '0.5rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', marginBottom: '1rem' }}>
          <Sparkles className="text-accent" size={32} />
        </div>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Catalyst</h2>
        <p style={{ color: 'var(--text-secondary)' }}>思考を構造化し、実行を支える。</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!isEmailMode ? (
          <>
            <button 
              onClick={handleAnonymousSignIn}
              disabled={loading}
              className="btn-primary"
              style={{ padding: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {loading ? '準備中...' : '名前を決めずに始める'}
              <ArrowRight size={18} />
            </button>

            <button 
              onClick={() => setIsEmailMode(true)}
              style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}
            >
              <Mail size={18} /> メールアドレスでログイン
            </button>
          </>
        ) : (
          <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white' }}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="password"
                placeholder="パスワード"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white' }}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ padding: '12px', width: '100%' }}>
              {isSignUp ? '新規登録' : 'ログイン'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <button type="button" onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}>
                {isSignUp ? 'すでにアカウントをお持ちの方' : '新しくアカウントを作成'}
              </button>
              <button type="button" onClick={() => setIsEmailMode(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                戻る
              </button>
            </div>
          </form>
        )}

        <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>または</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
          <button 
            onClick={() => handleOAuthSignIn('google')}
            style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontSize: '0.9rem' }}
          >
            Google
          </button>
          <button 
            onClick={() => handleOAuthSignIn('github')}
            style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontSize: '0.9rem' }}
          >
            <User size={18} /> GitHub
          </button>
        </div>

        {error && <p style={{ marginTop: '1rem', color: '#ff6b6b', fontSize: '0.85rem' }}>{error}</p>}
      </div>

      <footer style={{ marginTop: '2.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        匿名で始めても、後からアカウントを連携して<br />データを保存できます。
      </footer>
    </div>
  );
}
