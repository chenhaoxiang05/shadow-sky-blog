import { z } from "zod";
import { errorResponse, json, mutationAuth, requestHandler, requestId, services } from "@/lib/http";
import { clearSessionCookies } from "@/lib/security";
const schema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) });
export const POST = requestHandler(async function POST(request: Request) { try { const { actor } = await mutationAuth(request, { allowMustChangePassword: true }); const { auth } = services(); const body = schema.parse(await request.json()); await auth.changePassword(actor, body.currentPassword, body.newPassword, requestId(request)); const response = json({ ok: true }); for (const cookie of clearSessionCookies()) response.headers.append("set-cookie", cookie); return response; } catch (error) { return errorResponse(error); } });
