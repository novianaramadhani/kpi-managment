import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, loginWithNik, logoutUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await loginWithNik(body.nik, body.password);
  return NextResponse.json(res);
}

export async function DELETE() {
  await logoutUser();
  return NextResponse.json({ success: true });
}
