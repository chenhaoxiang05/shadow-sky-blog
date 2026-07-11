import { errorResponse, json, optionalActor, services } from "@/lib/http";
export async function GET(request: Request) { try { const actor = await optionalActor(request); const query = new URL(request.url).searchParams.get("q") ?? ""; return json({ posts: await services().search.search(actor, query) }); } catch (error) { return errorResponse(error); } }
