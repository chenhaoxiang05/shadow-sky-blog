import { z } from "zod";
import { errorResponse, json, mutationAuth, requestHandler, requestId, services } from "@/lib/http";
const schema = z.object({ active: z.boolean() });
export const PUT = requestHandler(async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { actor } = await mutationAuth(request); const { id } = await params; return json(await services().community.setLike(actor, id, schema.parse(await request.json()).active, requestId(request))); } catch (error) { return errorResponse(error); } });
