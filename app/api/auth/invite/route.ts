import { z } from "zod";
import { errorResponse, json, requestId, services } from "@/lib/http";
const schema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(256), handle: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,31}$/), displayName: z.string().min(1).max(80) });
export async function POST(request: Request) { try { const { auth } = services(); const user = await auth.acceptInvitation({ ...schema.parse(await request.json()), requestId: requestId(request) }); return json({ user }, { status: 201 }); } catch (error) { return errorResponse(error); } }
