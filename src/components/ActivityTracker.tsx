'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackEvent, describeElement } from '@/lib/telemetry';

/**
 * ActivityTracker:
 * ユーザーの訪問・クリック・離脱・エラーを「意思決定データ」として自動収集する。
 * これらは自己進化エンジンの入力シグナルになる。
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enteredAt = useRef<number>(0);

  // 訪問 + 離脱（滞在時間）
  useEffect(() => {
    enteredAt.current = Date.now();

    trackEvent('visit', {
      path: pathname,
      query: Object.fromEntries(searchParams.entries()),
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    });

    return () => {
      const dwell = Date.now() - enteredAt.current;
      void trackEvent('leave', { path: pathname, dwell_ms: dwell });
    };
  }, [pathname, searchParams]);

  // クリック（どの操作が使われ、どれが使われないかを知る）
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const el = target?.closest('button,a,[role="button"],input,select,textarea') as HTMLElement | null;
      if (!el) return;
      void trackEvent('click_action', {
        path: pathname,
        label: describeElement(el),
        tag: el.tagName.toLowerCase(),
        feature: el.getAttribute('data-feature') || null,
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname]);

  // エラー（UX上の摩擦を検出する）
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void trackEvent('error', {
        path: pathname,
        message: (event.message || '').slice(0, 200),
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      void trackEvent('error', {
        path: pathname,
        message: String(reason?.message || reason).slice(0, 200),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [pathname]);

  return null;
}
