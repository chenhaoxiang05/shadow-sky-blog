import { z } from "zod";
import { errorResponse, json, mutationAuth, requestHandler, requestId, services } from "@/lib/http";
const schema = z.object({ body: z.string().min(1).max(4_000) });
export const PATCH = requestHandler(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { actor } = await mutationAuth(request); const { id } = await params; return json({ comment: await services().community.updateComment(actor, id, schema.parse(await request.json()).body, requestId(request)) }); } catch (error) { return errorResponse(error); } });
export const DELETE = requestHandler(async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { actor } = await mutationAuth(request); const { id } = await params; return json({ comment: await services().community.deleteComment(actor, id, requestId(request)) }); } catch (error) { return errorResponse(error); } });
