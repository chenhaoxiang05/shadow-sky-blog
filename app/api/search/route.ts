import { z } from "zod";
import { errorResponse, json, optionalActor, requestHandler, services } from "@/lib/http";
import { toSearchResponse } from "@/lib/search";
const schema = z.object({ q: z.string().max(200).optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(50).default(20), category: z.string().max(100).optional(), tag: z.string().max(100).optional(), author: z.string().max(40).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const GET = requestHandler(async function GET(request: Request) { try { const actor = await optionalActor(request); const url = new URL(request.url); const input = schema.parse(Object.fromEntries(url.searchParams.entries())); return json(toSearchResponse(await services().search.search(actor, input))); } catch (error) { return errorResponse(error); } });
