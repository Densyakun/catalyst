'use client';

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { renderVariant } from '@/lib/ui/client';
import { trackEvent } from '@/lib/telemetry';

/**
 * DynamicUISlot:
 * 指定領域(area)で有効なUIバリアントがあれば、ブラウザ内で tsx-safe-eval により
 * 評価して描画する。無ければ children（既定UI）を表示する。
 */
export default function DynamicUISlot({ area, children }: { area: string; children: ReactNode }) {
  const [element, setElement] = useState<ReactElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/ui-variants/active?area=${encodeURIComponent(area)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data?.code) return;

        const { element: rendered } = await renderVariant(data.code, data.data || {});
        if (active && rendered) {
          setElement(rendered);
          void trackEvent('ui_variant_impression', { area, variantId: data.id });
        }
      } catch {
        // 失敗時は既定UIを表示
      }
    })();
    return () => {
      active = false;
    };
  }, [area]);

  if (element) {
    return (
      <div className="dynamic-ui-slot" onClickCapture={() => void trackEvent('ui_variant_click', { area })}>
        {element}
      </div>
    );
  }

  return <>{children}</>;
}
