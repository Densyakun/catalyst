'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * ActivityTracker:
 * ユーザーの訪問や行動を「意思決定データ」として自動収集します。
 */
export function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const trackVisit = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 訪問データの記録
      await supabase.from('user_activity').insert({
        user_id: user?.id,
        activity_type: 'visit',
        metadata: {
          path: pathname,
          query: Object.fromEntries(searchParams.entries()),
          referrer: document.referrer,
          timestamp: new Date().toISOString(),
        },
      });
    };

    trackVisit();
  }, [pathname, searchParams]);

  return null; // UIは持たない
}
