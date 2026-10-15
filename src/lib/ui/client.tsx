'use client';

import React from 'react';

/**
 * 動的UIランタイム（ブラウザ専用）。
 *
 * AIが生成したTSXをクライアントでコンパイル（ts-morph のメモリFS）し、
 * tsx-safe-eval のインタプリタで評価して React 要素を生成する。
 * eval/new Function を使わず、サーバー（Cloudflare Workers等）では実行しない。
 */

export interface RenderVariantResult {
  element: React.ReactElement | null;
  error?: string;
}

type KitProps = {
  className?: string;
  text?: string;
  href?: string;
  items?: unknown[];
  children?: unknown;
};

function createKit() {
  const h = (
    type: string,
    props: Record<string, unknown> | null,
    children?: unknown,
  ): React.ReactElement => {
    const childArray = Array.isArray(children)
      ? children
      : children === undefined || children === null
        ? []
        : [children];
    return React.createElement(type, props, ...childArray);
  };

  return {
    Card: (p: KitProps) => h('div', { className: `glass-panel ev-card ${p.className || ''}`.trim() }, p.children),
    Title: (p: KitProps) => h('h3', { className: 'ev-title' }, p.text ?? p.children),
    Text: (p: KitProps) => h('p', { className: 'ev-text' }, p.children),
    Badge: (p: KitProps) => h('span', { className: 'ev-badge' }, p.children),
    Button: (p: KitProps) =>
      p.href
        ? h('a', { className: 'btn-primary ev-btn', href: p.href }, p.text)
        : h('button', { className: 'btn-primary ev-btn' }, p.text),
    List: (p: KitProps) =>
      h(
        'ul',
        { className: 'ev-list' },
        (p.items || []).map((item, i) => h('li', { key: i }, String(item))),
      ),
    Note: (p: KitProps) => h('p', { className: 'ev-note' }, p.children),
  };
}

export async function renderVariant(
  code: string,
  data: Record<string, unknown>,
): Promise<RenderVariantResult> {
  try {
    const { Project } = await import('ts-morph');
    const { compileSourceFileToJSON, evalSyntaxList } = await import('tsx-safe-eval');

    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { jsx: 4, esModuleInterop: true, strict: false },
    });
    const sourceFile = project.createSourceFile('variant.tsx', code);
    const json = compileSourceFileToJSON(sourceFile);

    const variables = [{ ...createKit(), data }];
    const modules = (() => undefined) as unknown as Parameters<typeof evalSyntaxList>[2];

    const result = evalSyntaxList(
      json.syntaxList as unknown as Parameters<typeof evalSyntaxList>[0],
      variables,
      modules,
    );

    const render = (result?.exports?.object as { render?: (d: unknown) => unknown } | undefined)?.render;
    if (typeof render !== 'function') {
      return { element: null, error: 'render function not found' };
    }

    const element = render(data) as React.ReactElement;
    return { element };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('renderVariant error:', message);
    return { element: null, error: message };
  }
}
