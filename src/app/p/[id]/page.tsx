import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PostViewer } from "@/components/viewer/PostViewer";
import { postIdParam } from "@/lib/validation";
import { getSession } from "@/server/identity";
import { getPost } from "@/server/wall";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-viewer" />}>
      <PostContent params={params} />
    </Suspense>
  );
}

async function PostContent({ params }: { params: Promise<{ id: string }> }) {
  const { active } = await getSession(await cookies());
  if (!active) redirect("/");
  // A malformed id would reach Postgres as an invalid uuid and come back as a 500.
  const id = postIdParam.safeParse((await params).id);
  if (!id.success) notFound();
  const post = await getPost(id.data);
  if (!post) notFound();
  if (post.type === "wish") redirect("/wall"); // wishes open in a drawer on the wall
  return <PostViewer post={post} mine={post.guestId === active.guestId} now={new Date().toISOString()} />;
}
