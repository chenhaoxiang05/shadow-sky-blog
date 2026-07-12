import { z } from "zod";
import { currentAuth, errorResponse, json, mutationAuth, requestId, services } from "@/lib/http";
import { withoutPassword } from "@/lib/auth-service";
const optionalWebUrl = z.url().refine((value) => value.startsWith("https://"), "必须使用 HTTPS").nullable().optional();
const schema = z.object({ displayName: z.string().min(1).max(80).optional(), bio: z.string().max(500).nullable().optional(), avatarKey: z.string().regex(/^\/api\/media\/[0-9a-f-]{36}$/).nullable().optional(), githubUrl: optionalWebUrl, websiteUrl: optionalWebUrl });
export async function GET(request: Request) { try { const { user } = await currentAuth(request); return json({ user: withoutPassword(user) }); } catch (error) { return errorResponse(error); } }
export async function PATCH(request: Request) { try { const { actor, user } = await mutationAuth(request); const body = schema.parse(await request.json()); const { avatarKey, ...profile } = body; const { repo, media } = services(); let updated = avatarKey !== undefined ? await media.setAvatar(actor, avatarKey, requestId(request)) : user; if (Object.keys(profile).length) updated = await repo.updateUserProfile(user.id, profile, new Date()) ?? updated; return json({ user: withoutPassword(updated) }); } catch (error) { return errorResponse(error); } }
