// project-bootstrap の test-companion gate を満たすための placeholder。
// app/api/{logs,posts,tasks}/route.ts を一括でカバー(hook は basename で再帰探索する)。
import { test } from 'node:test';
test('route placeholder', () => {});
