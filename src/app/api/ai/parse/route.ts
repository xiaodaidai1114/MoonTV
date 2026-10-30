import { NextRequest, NextResponse } from "next/server";
import { getAuthInfoFromCookie } from "@/lib/auth";
import { hasKimiKey, parseWithKimi } from "@/lib/kimi-client";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const a = getAuthInfoFromCookie(request);
  if (!a?.username) return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!hasKimiKey()) return NextResponse.json({available:false});
  const q = new URL(request.url).searchParams.get("q");
  if (!q || q.length<2) return NextResponse.json({available:true,result:null});
  const r = await parseWithKimi(q);
  return NextResponse.json({available:true,result:r});
}
