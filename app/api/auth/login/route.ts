import { z } from "zod";
import { clientIp, errorResponse, json, requestHandler, requestId, services } from "@/lib/http";
import { csrfCookie, readCookie, SESSION_COOKIE, sessionCookie } from "@/lib/security";

const schema = z.object({ login: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,31}$/), password: z.string().min(1).max(256) });
export const POST = requestHandler(async function POST(request: Request) { try { const body = schema.parse(await request.json()); const { auth } = services(); const result = await auth.login({ ...body, ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? undefined, oldSessionToken: readCookie(request, SESSION_COOKIE), requestId: requestId(request) }); const response = json({ user: result.user }); response.headers.append("set-cookie", sessionCookie(result.sessionToken, result.expiresAt)); response.headers.append("set-cookie", csrfCookie(result.csrfToken, result.expiresAt)); return response; } catch (error) { return errorResponse(error); } });
