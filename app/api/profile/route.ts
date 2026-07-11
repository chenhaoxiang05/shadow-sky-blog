import { z } from "zod";
import { currentAuth, errorResponse, json, mutationAuth, services } from "@/lib/http";
import { withoutPassword } from "@/lib/auth-service";
const schema = z.object({ displayName: z.string().min(1).max(80).optional(), bio: z.string().max(500).nullable().optional(), avatarKey: z.string().max(512).nullable().optional() });
export async function GET(request: Request) { try { const { user } = await currentAuth(request); return json({ user: withoutPassword(user) }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request) { try { const { user } = await mutationAuth(request); const { repo } = services(); const updated = await repo.updateUserProfile(user.id, schema.parse(await request.json()), new Date()); if (!updated) return json({ error: { code: "NOT_FOUND", message: "用户不存在" } }, { status: 404 }); return json({ user: withoutPassword(updated) }); } catch (error) { return errorResponse(error); } }
