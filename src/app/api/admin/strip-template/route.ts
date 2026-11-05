import { cookies } from "next/headers";
import { stripTemplateConfirmBody, stripTemplatePresignBody } from "@/lib/validation";
import { confirmStripTemplate, presignStripTemplate, removeStripTemplate, requireAdmin } from "@/server/admin";
import { handle } from "@/server/http";

export const POST = (req: Request) =>
  handle(
    req,
    async () => {
      requireAdmin(await cookies());
      const { mime, bytes } = stripTemplatePresignBody.parse(await req.json().catch(() => null));
      return presignStripTemplate(mime, bytes);
    },
    201,
  );

export const PUT = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return confirmStripTemplate(stripTemplateConfirmBody.parse(await req.json().catch(() => null)).key);
  });

export const DELETE = (req: Request) =>
  handle(req, async () => {
    requireAdmin(await cookies());
    return removeStripTemplate();
  });
