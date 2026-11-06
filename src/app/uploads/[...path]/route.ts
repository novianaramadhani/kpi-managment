import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse("File Not Found", { status: 404 });
    }

    // Sanitasi segmen path untuk mencegah Directory Traversal
    const safeSegments = pathSegments
      .map((s) => decodeURIComponent(s))
      .filter((s) => s && s !== ".." && s !== "." && !s.includes("\\") && !s.includes("/"));

    const uploadsBaseDir = path.resolve(process.cwd(), "public", "uploads");
    const targetFilePath = path.resolve(uploadsBaseDir, ...safeSegments);

    // Pastikan target path berada di dalam direktori uploads
    if (!targetFilePath.startsWith(uploadsBaseDir)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    if (!existsSync(targetFilePath)) {
      return new NextResponse("File Not Found", { status: 404 });
    }

    const stat = await fs.stat(targetFilePath);
    if (!stat.isFile()) {
      return new NextResponse("File Not Found", { status: 404 });
    }

    const ext = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const fileBuffer = await fs.readFile(targetFilePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err: unknown) {
    console.error("Error serving uploaded file:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse(null, { status: 404 });
    }

    const safeSegments = pathSegments
      .map((s) => decodeURIComponent(s))
      .filter((s) => s && s !== ".." && s !== "." && !s.includes("\\") && !s.includes("/"));

    const uploadsBaseDir = path.resolve(process.cwd(), "public", "uploads");
    const targetFilePath = path.resolve(uploadsBaseDir, ...safeSegments);

    if (!targetFilePath.startsWith(uploadsBaseDir) || !existsSync(targetFilePath)) {
      return new NextResponse(null, { status: 404 });
    }

    const stat = await fs.stat(targetFilePath);
    if (!stat.isFile()) {
      return new NextResponse(null, { status: 404 });
    }

    const ext = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err: unknown) {
    console.error("Error in HEAD uploaded file:", err);
    return new NextResponse(null, { status: 500 });
  }
}

