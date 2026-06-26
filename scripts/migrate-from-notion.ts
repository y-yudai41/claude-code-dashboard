/**
 * Notion → ダッシュボード ログ同期スクリプト（CLI）
 *
 * 画面の「Notionから同期」ボタンと同じ処理を、サーバー無しでも実行できる版。
 * Notion DB を読み出し、data/logs.json（キャッシュ）に Notion と同じ形式で保存する。
 *
 * 実行: npm run sync   （= npx tsx scripts/migrate-from-notion.ts）
 * 必要な環境変数: NOTION_TOKEN, NOTION_DATABASE_ID（シェルに export しておく）
 *
 * 取得元の実スキーマ・マッピングは lib/notion.ts の COLUMN_MAP を参照（DB を変えたらそこを編集）。
 */

import { fetchNotionLogs, getNotionConfig } from '../lib/notion';
import { getLogs, saveLogs } from '../lib/storage';

async function main() {
  const cfg = getNotionConfig();
  if (!cfg) {
    console.error('ERROR: NOTION_TOKEN と NOTION_DATABASE_ID を環境変数に設定してください。');
    process.exit(1);
  }

  console.log('Notion DB を読み出し中…');
  const fetched = await fetchNotionLogs(cfg);
  for (const e of fetched) {
    console.log(`  - ${e.date}  ${e.project}  ${e.title}`);
  }

  // 既存キャッシュとマージ（Notion ページ id で重複排除）。
  const existing = await getLogs();
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of fetched) byId.set(e.id, e);
  const merged = [...byId.values()];
  await saveLogs(merged);

  console.log(`\n完了: ${fetched.length} 件取得 → data/logs.json に ${merged.length} 件を保存。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
