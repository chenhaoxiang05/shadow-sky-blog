import { z } from "zod";
import { errorResponse, json, mutationAuth, optionalActor, requestId, services } from "@/lib/http";
const schema = z.object({ body: z.string().min(1).max(4_000), parentId: z.uuid().nullable().optional() });
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const actor = await optionalActor(request); const { id } = await params; return json({ comments: await services().community.listComments(actor, id) }); } catch (error) { return errorResponse(error); } }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { actor } = await mutationAuth(request); const { id } = await params; return json({ comment: await services().community.createComment(actor, { postId: id, ...schema.parse(await request.json()), requestId: requestId(request) }) }, { status: 201 }); } catch (error) { return errorResponse(error); } }
