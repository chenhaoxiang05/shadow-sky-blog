import { z } from "zod";
import { errorResponse, json, mutationAuth, requestHandler, requestId, services } from "@/lib/http";

const schema = z.object({ userId: z.uuid(), temporaryPassword: z.string().min(12).max(256).optional() });
export const POST = requestHandler(async function POST(request: Request) {
  try { const { actor } = await mutationAuth(request); const body = schema.parse(await request.json()); const { auth } = services(); return json(await auth.resetUserPassword(actor, body.userId, requestId(request), body.temporaryPassword)); }
  catch (error) { return errorResponse(error); }
});
