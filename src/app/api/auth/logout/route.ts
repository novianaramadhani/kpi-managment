import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getRedirectUrl(request: Request): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";

  if (forwardedHost) {
    return new URL("/", `${forwardedProto}://${forwardedHost}`);
  }

  const host = request.headers.get("host");
  if (host && !host.includes("localhost")) {
    return new URL("/", `https://${host}`);
  }

  return new URL("/", request.url);
}

export async function GET(request: Request) {
  const targetUrl = getRedirectUrl(request);
  const response = NextResponse.redirect(targetUrl, 303);

  // Clear cookie across all possible paths and attributes
  response.cookies.set("kpi_user_session", "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function POST(request: Request) {
  const response = NextResponse.json({ success: true });

  response.cookies.set("kpi_user_session", "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
