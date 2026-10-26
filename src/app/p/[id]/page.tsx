import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PostViewer } from "@/components/viewer/PostViewer";
import { postIdParam } from "@/lib/validation";
import { getSession } from "@/server/identity";
import { getPost } from "@/server/wall";
import { WallContent } from "../../wall/WallContent";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-viewer" />}>
      <PostContent params={params} />
    </Suspense>
  );
}

async function PostContent({ params }: { params: Promise<{ id: string }> }) {
  // A malformed id would reach Postgres as an invalid uuid and come back as a 500.
  const id = postIdParam.safeParse((await params).id);
  if (!id.success) notFound();
  const { active } = await getSession(await cookies());
  // No name yet: join first, then come back to this post.
  if (!active) redirect(`/?next=${encodeURIComponent(`/p/${id.data}`)}`);
  const post = await getPost(id.data);
  if (!post) notFound();
  // Wishes open in a drawer on the wall. Not a redirect to `/wall?wish=`: a `/wall` that reads
  // searchParams stalled the client navigation that follows joining (WebKit).
  if (post.type === "wish") return <WallContent openWish={post} />;
  return <PostViewer post={post} mine={post.guestId === active.guestId} now={new Date().toISOString()} />;
}
