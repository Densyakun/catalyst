import patterns from './security-patterns.json';

interface PatternDef {
  label: string;
  pattern: string;
  flags?: string;
}

function compile(defs: PatternDef[]): Array<{ label: string; re: RegExp }> {
  return defs.map((def) => ({
    label: def.label,
    re: new RegExp(def.pattern, def.flags ?? ''),
  }));
}

const SUSPICIOUS = compile(patterns.suspicious as PatternDef[]);
const SECRETS = compile(patterns.secrets as PatternDef[]);
const PROTECTED = patterns.protectedPaths.map((pattern) => new RegExp(pattern));

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function scanUntrustedText(text: string): string[] {
  if (!text) return [];
  return unique(SUSPICIOUS.filter((item) => item.re.test(text)).map((item) => item.label));
}

export function scanSecrets(text: string): string[] {
  if (!text) return [];
  return unique(SECRETS.filter((item) => item.re.test(text)).map((item) => item.label));
}

export function scanProtectedPaths(paths: string[]): string[] {
  return unique(
    paths
      .filter((file) => file && PROTECTED.some((re) => re.test(file)))
      .map((file) => file.replace(/\\/g, '/')),
  );
}

export function countDiffLines(diff: string): number {
  if (!diff) return 0;
  return diff.split('\n').length;
}

export function redactSecrets(text: string): string {
  if (!text) return text;
  let result = text;
  for (const def of patterns.secrets as PatternDef[]) {
    result = result.replace(new RegExp(def.pattern, `${def.flags ?? ''}g`), '[REDACTED]');
  }
  return result;
}

export function sanitizeUntrustedText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n');
}

export function sanitizeCommitText(text: string, maxLength = 120): string {
  const cleaned = sanitizeUntrustedText(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}
