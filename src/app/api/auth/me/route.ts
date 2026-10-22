import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, loginWithNik, logoutUser } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const body = await request.json();
    const nik = (body?.nik || "").trim();
    const password = body?.password || "";

    const limitKey = `auth:${ip}:${nik || "unknown"}`;
    const limit = checkRateLimit(limitKey, 5, 60_000);

    if (!limit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${limit.retryAfterSeconds} detik.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfterSeconds),
          },
        }
      );
    }

    const res = await loginWithNik(nik, password);
    if (res.success) {
      resetRateLimit(limitKey);
    }

    return NextResponse.json(res, { status: res.success ? 200 : 401 });
  } catch (err: any) {
    console.error("Authentication error:", err);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan pada sistem saat memproses login." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  await logoutUser();
  return NextResponse.json({ success: true });
}
