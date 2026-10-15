/**
 * Google Docs / Drive の REST API を fetch で直接叩く。
 * （googleapis の node:https 依存を避け、Cloudflare Workers 等でも動作させる）
 */

const DOCS_API = 'https://docs.googleapis.com/v1';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

interface DocParagraphElement {
  textRun?: { content?: string };
}

interface DocStructuralElement {
  endIndex?: number;
  paragraph?: { elements?: DocParagraphElement[] };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{ content?: DocStructuralElement[] }>;
    }>;
  };
}

interface DocDocument {
  title?: string;
  body?: { content?: DocStructuralElement[] };
}

async function googleError(res: Response): Promise<string> {
  let detail = '';
  try {
    const data = await res.json();
    detail = data?.error?.message || JSON.stringify(data);
  } catch {
    detail = res.statusText;
  }
  return `Google API ${res.status}: ${detail}`;
}

/**
 * Google Docsからテキスト内容を取得
 */
export async function fetchDocContent(
  accessToken: string,
  docId: string,
): Promise<{ title: string; content: string }> {
  const res = await fetch(`${DOCS_API}/documents/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await googleError(res));

  const doc = (await res.json()) as DocDocument;
  return {
    title: doc.title || 'Untitled',
    content: extractTextFromDoc(doc),
  };
}

/**
 * Google Docsのドキュメントオブジェクトからプレーンテキストを抽出
 */
function extractTextFromDoc(doc: DocDocument): string {
  const body = doc.body;
  if (!body?.content) return '';

  let text = '';
  for (const element of body.content) {
    const paragraph = element.paragraph;
    if (paragraph?.elements) {
      for (const el of paragraph.elements) {
        if (el.textRun?.content) {
          text += el.textRun.content;
        }
      }
    }
    const table = element.table;
    if (table?.tableRows) {
      for (const row of table.tableRows) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            const cellParagraph = cellContent.paragraph;
            if (cellParagraph?.elements) {
              for (const el of cellParagraph.elements) {
                if (el.textRun?.content) {
                  text += el.textRun.content;
                }
              }
            }
          }
          text += '\t';
        }
        text += '\n';
      }
    }
  }

  return text.trim();
}

/**
 * Google Docsにテキストを書き戻す（全置換方式）
 */
export async function writeDocContent(
  accessToken: string,
  docId: string,
  newContent: string,
): Promise<void> {
  const currentRes = await fetch(`${DOCS_API}/documents/${encodeURIComponent(docId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!currentRes.ok) throw new Error(await googleError(currentRes));

  const current = (await currentRes.json()) as DocDocument;
  const content = current.body?.content;
  const endIndex = content?.length ? content[content.length - 1].endIndex ?? 1 : 1;

  const requests = endIndex <= 2
    ? [{ insertText: { location: { index: 1 }, text: newContent } }]
    : [
        { deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } },
        { insertText: { location: { index: 1 }, text: newContent } },
      ];

  const updateRes = await fetch(`${DOCS_API}/documents/${encodeURIComponent(docId)}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!updateRes.ok) throw new Error(await googleError(updateRes));
}

/**
 * Google Driveからドキュメント一覧を取得
 */
export async function listDocs(
  accessToken: string,
  query?: string,
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  let q = "mimeType='application/vnd.google-apps.document' and trashed = false";
  if (query) {
    q += ` and fullText contains '${query.replace(/'/g, "\\'")}'`;
  }

  const params = new URLSearchParams({
    q,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  });

  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(await googleError(res));

  const data = (await res.json()) as { files?: Array<{ id?: string; name?: string; modifiedTime?: string }> };
  return (data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || 'Untitled',
    modifiedTime: f.modifiedTime || '',
  }));
}
