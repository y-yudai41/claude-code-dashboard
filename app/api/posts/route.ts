import { NextRequest, NextResponse } from 'next/server';
import { getPostList, getPostContent, savePost, deletePost, isValidSlug } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 記事はダッシュボードでは生成しない。Claude Code が作った .md を表示・保存・削除するだけ。

// GET /api/posts            — 記事一覧（slug・title・date・preview）
// GET /api/posts?slug=xxx   — 単体記事の Markdown 本文（text/markdown）
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (slug) {
    const content = await getPostContent(slug);
    if (content == null) {
      return NextResponse.json({ error: '記事が見つかりません' }, { status: 404 });
    }
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }
  const posts = await getPostList();
  return NextResponse.json(posts);
}

// POST /api/posts — { slug, content } を posts/{slug}.md に保存（Claude Code から直接）。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.slug !== 'string' || typeof body.content !== 'string') {
    return NextResponse.json(
      { error: '{ slug, content } が必要です（記事はClaude Codeが作成して保存します）' },
      { status: 400 },
    );
  }
  if (!isValidSlug(body.slug)) {
    return NextResponse.json({ error: 'slug が不正です' }, { status: 400 });
  }
  await savePost(body.slug, body.content);
  return NextResponse.json({ slug: body.slug }, { status: 201 });
}

// DELETE /api/posts — 削除 { slug }
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.slug !== 'string' || !isValidSlug(body.slug)) {
    return NextResponse.json({ error: 'slug が不正です' }, { status: 400 });
  }
  await deletePost(body.slug);
  return NextResponse.json({ ok: true });
}
