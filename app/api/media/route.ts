import { z } from "zod";
import { errorResponse, json, mutationAuth, requestHandler, requestId, services } from "@/lib/http";
import { mediaUploadEnabled } from "@/lib/storage";

const purposeSchema = z.enum(["AVATAR", "COVER", "CONTENT"]);

export async function GET() { return json({ uploadEnabled: mediaUploadEnabled() }); }

const upload = requestHandler(async function upload(request: Request) {
  try {
    const { actor } = await mutationAuth(request);
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return json({ error: { code: "INVALID_INPUT", message: "缺少图片文件" } }, { status: 400 });
    const purpose = purposeSchema.parse(form.get("purpose"));
    const asset = await services().media.upload(actor, { data: new Uint8Array(await file.arrayBuffer()), declaredMime: file.type, purpose, requestId: requestId(request) });
    return json({ asset }, { status: 201 });
  } catch (error) { return errorResponse(error); }
});

export async function POST(request: Request) {
  if (!mediaUploadEnabled()) return json({ error: { code: "FEATURE_UNAVAILABLE", message: "媒体上传暂未启用" } }, { status: 503 });
  return upload(request);
}
