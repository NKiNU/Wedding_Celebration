import { cookies } from "next/headers";
import { qrConfirmBody, qrPresignBody } from "@/lib/validation";
import { confirmQr, presignQr, requireAdmin } from "@/server/admin";
import { handle } from "@/server/http";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      requireAdmin(await cookies());
      const { mime, bytes } = qrPresignBody.parse(await req.json().catch(() => null));
      return presignQr(mime, bytes);
    },
    201,
  );

export const PUT = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return confirmQr(qrConfirmBody.parse(await req.json().catch(() => null)).key);
  });
