import { cookies } from "next/headers";
import { monogramConfirmBody, monogramPresignBody } from "@/lib/validation";
import { confirmMonogram, presignMonogram, removeMonogram, requireAdmin } from "@/server/admin";
import { handle } from "@/server/http";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      requireAdmin(await cookies());
      const { mime, bytes } = monogramPresignBody.parse(await req.json().catch(() => null));
      return presignMonogram(mime, bytes);
    },
    201,
  );

export const PUT = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return confirmMonogram(monogramConfirmBody.parse(await req.json().catch(() => null)).key);
  });

export const DELETE = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return removeMonogram();
  });
