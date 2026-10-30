import { NextRequest, NextResponse } from "next/server";
import { getAuthInfoFromCookie } from "@/lib/auth";
import { hasExaKey, searchMovie } from "@/lib/exa-client";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const a = getAuthInfoFromCookie(request);
  if (!a?.username) return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!hasExaKey()) return NextResponse.json({available:false,results:[]});
  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.length<2) return NextResponse.json({available:true,results:[]});
  const r = await searchMovie(q);
  return NextResponse.json({available:true,results:r});
}
