import { currentAuth, errorResponse, json, requestHandler, services } from "@/lib/http";
export const GET = requestHandler(async function GET(request: Request) { try { const { actor } = await currentAuth(request); return json({ posts: await services().community.bookmarks(actor) }); } catch (error) { return errorResponse(error); } });
