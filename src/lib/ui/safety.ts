export interface UICodeValidationResult {
  ok: boolean;
  errors: string[];
}

export const MAX_UI_CODE_LENGTH = 20000;
export const MAX_JSX_ELEMENTS = 200;

const ALLOWED_TAGS = new Set([
  'Card',
  'Title',
  'Text',
  'Badge',
  'Button',
  'List',
  'Note',
]);

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bimport\b/, reason: 'import は使用できません' },
  { pattern: /\brequire\s*\(/, reason: 'require は使用できません' },
  { pattern: /\beval\s*\(/, reason: 'eval は使用できません' },
  { pattern: /\bnew\s+Function\b/, reason: 'Function コンストラクタは使用できません' },
  { pattern: /\bwindow\b/, reason: 'window は使用できません' },
  { pattern: /\bdocument\b/, reason: 'document は使用できません' },
  { pattern: /\bglobalThis\b/, reason: 'globalThis は使用できません' },
  { pattern: /\bprocess\b/, reason: 'process は使用できません' },
  { pattern: /\bfetch\s*\(/, reason: 'fetch は使用できません' },
  { pattern: /\bXMLHttpRequest\b/, reason: 'XMLHttpRequest は使用できません' },
  { pattern: /\b(?:localStorage|sessionStorage)\b/, reason: 'ストレージAPIは使用できません' },
  { pattern: /\bWebSocket\b/, reason: 'WebSocket は使用できません' },
  { pattern: /\b(?:setTimeout|setInterval)\s*\(/, reason: 'タイマーは使用できません' },
  { pattern: /\brequestAnimationFrame\s*\(/, reason: 'requestAnimationFrame は使用できません' },
  { pattern: /\bwhile\s*\(/, reason: 'while ループは使用できません' },
  { pattern: /\bfor\s*\(/, reason: 'for ループは使用できません' },
  { pattern: /\bdo\s*\{/, reason: 'do-while ループは使用できません' },
  { pattern: /\b(?:async|await)\b/, reason: '非同期処理は使用できません' },
  { pattern: /\bclass\s+/, reason: 'class は使用できません' },
  { pattern: /\bdelete\b/, reason: 'delete は使用できません' },
  { pattern: /\bthis\b/, reason: 'this は使用できません' },
  { pattern: /\b__proto__\b/, reason: '__proto__ は使用できません' },
  { pattern: /\bprototype\b/, reason: 'prototype は使用できません' },
  { pattern: /\bconstructor\b/, reason: 'constructor は使用できません' },
  { pattern: /dangerouslySetInnerHTML/, reason: 'dangerouslySetInnerHTML は使用できません' },
  { pattern: /\b(?:Array\.from|new\s+Array)\b/, reason: '動的な配列生成は使用できません' },
  { pattern: /\.fill\s*\(/, reason: 'Array.fill は使用できません' },
];

const TAG_PATTERN = /<\s*\/?\s*([A-Za-z][A-Za-z0-9_.]*)/g;
const RENDER_FUNCTION_DEFINITION = /export\s+(?:async\s+)?function\s+render\s*\(/;
const RENDER_DEFINITION = /export\s+(?:async\s+)?function\s+render\s*\(|export\s+const\s+render\s*=/;
const RENDER_CALL = /\brender\s*\(/g;

export function validateUIVariantCode(code: unknown): UICodeValidationResult {
  if (typeof code !== 'string' || code.trim().length === 0) {
    return { ok: false, errors: ['コードが空です'] };
  }

  const errors: string[] = [];

  if (code.length > MAX_UI_CODE_LENGTH) {
    errors.push(`コードが長すぎます（${code.length} > ${MAX_UI_CODE_LENGTH}）`);
  }

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) errors.push(reason);
  }

  if (!RENDER_DEFINITION.test(code)) {
    errors.push('export function render(data) を定義してください');
  }

  if (/`/.test(code)) {
    errors.push('テンプレートリテラルは使用できません');
  }

  if (/\bhref\s*=\s*(?:["'{]|\{)\s*["']?\s*(?:javascript|data|vbscript)\s*:/i.test(code)) {
    errors.push('安全でない href は使用できません');
  }

  const renderCalls = code.match(RENDER_CALL)?.length ?? 0;
  const renderCallsInBody = RENDER_FUNCTION_DEFINITION.test(code) ? renderCalls - 1 : renderCalls;
  if (renderCallsInBody > 0) {
    errors.push('render の再帰呼び出しは使用できません');
  }

  let elementCount = 0;
  for (const match of code.matchAll(TAG_PATTERN)) {
    elementCount += 1;
    const tag = match[1];
    if (!ALLOWED_TAGS.has(tag)) {
      errors.push(`使用できないタグです: ${tag}`);
    }
  }
  if (elementCount > MAX_JSX_ELEMENTS) {
    errors.push(`JSX要素が多すぎます（${elementCount} > ${MAX_JSX_ELEMENTS}）`);
  }

  return { ok: errors.length === 0, errors: Array.from(new Set(errors)) };
}
