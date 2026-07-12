import { currentAuth, errorResponse, json, services } from "@/lib/http";
export async function GET(request: Request) { try { const { actor } = await currentAuth(request); return json({ posts: await services().community.bookmarks(actor) }); } catch (error) { return errorResponse(error); } }
