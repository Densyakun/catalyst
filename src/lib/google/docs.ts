import { google } from 'googleapis';
import type { OAuth2Client } from 'googleapis-common';

/**
 * Google Docsからテキスト内容を取得
 */
export async function fetchDocContent(
  auth: OAuth2Client,
  docId: string,
): Promise<{ title: string; content: string }> {
  const docs = google.docs({ version: 'v1', auth });
  const res = await docs.documents.get({ documentId: docId });
  const doc = res.data;

  const title = doc.title || 'Untitled';
  const content = extractTextFromDoc(doc);

  return { title, content };
}

/**
 * Google Docsのドキュメントオブジェクトからプレーンテキストを抽出
 */
function extractTextFromDoc(doc: { title?: string | null; body?: { content?: Array<Record<string, unknown>> } }): string {
  const body = doc.body;
  if (!body?.content) return '';

  let text = '';
  for (const element of body.content) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        if (el.textRun?.content) {
          text += el.textRun.content;
        }
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            if (cellContent.paragraph) {
              for (const el of cellContent.paragraph.elements || []) {
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
  auth: OAuth2Client,
  docId: string,
  newContent: string,
): Promise<void> {
  const docs = google.docs({ version: 'v1', auth });

  // 現在のドキュメント内容を取得して既存テキストの範囲を特定
  const current = await docs.documents.get({ documentId: docId });
  const body = current.data.body;
  if (!body?.content) return;

  // ドキュメントの末尾インデックスを取得
  const lastElement = body.content[body.content.length - 1];
  const endIndex = lastElement?.endIndex ?? 1;

  if (endIndex <= 2) {
    // 空のドキュメント → 挿入のみ
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          { insertText: { location: { index: 1 }, text: newContent } },
        ],
      },
    });
    return;
  }

  // 既存テキストを削除してから新しいテキストを挿入
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          deleteContentRange: {
            range: { startIndex: 1, endIndex: endIndex - 1 },
          },
        },
        { insertText: { location: { index: 1 }, text: newContent } },
      ],
    },
  });
}

/**
 * Google Driveからドキュメント一覧を取得
 */
export async function listDocs(
  auth: OAuth2Client,
  query?: string,
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const drive = google.drive({ version: 'v3', auth });

  let q = "mimeType='application/vnd.google-apps.document' and trashed = false";
  if (query) {
    q += ` and fullText contains '${query.replace(/'/g, "\\'")}'`;
  }

  const res = await drive.files.list({
    q,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  });

  return (res.data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || 'Untitled',
    modifiedTime: f.modifiedTime || '',
  }));
}
