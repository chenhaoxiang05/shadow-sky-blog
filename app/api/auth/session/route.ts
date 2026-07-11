import { currentAuth, errorResponse, json } from "@/lib/http";
import { withoutPassword } from "@/lib/auth-service";
export async function GET(request: Request) { try { const { user } = await currentAuth(request); return json({ user: withoutPassword(user) }); } catch (error) { return errorResponse(error); } }
