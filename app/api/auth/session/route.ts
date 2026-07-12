import { currentAuth, errorResponse, json, requestHandler } from "@/lib/http";
import { withoutPassword } from "@/lib/auth-service";
export const GET = requestHandler(async function GET(request: Request) { try { const { user } = await currentAuth(request, { allowMustChangePassword: true }); return json({ user: withoutPassword(user) }); } catch (error) { return errorResponse(error); } });
