import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { getAdminEvent, getModerationPage, isAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Admin · Wedding Memories", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <Suspense>
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  await connection(); // the session check and "now" read the clock
  if (!isAdmin(await cookies())) return <AdminLogin />;
  const [event, posts] = await Promise.all([getAdminEvent(), getModerationPage(null)]);
  return <AdminDashboard event={event} initialPosts={posts} now={new Date().toISOString()} />;
}
