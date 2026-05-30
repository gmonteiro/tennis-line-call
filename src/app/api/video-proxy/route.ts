import { type NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

// yt-dlp path (installed via pip)
const YT_DLP_PATHS = [
  path.join(
    process.env.LOCALAPPDATA || "",
    "Python",
    "pythoncore-3.14-64",
    "Scripts",
    "yt-dlp.exe"
  ),
  "yt-dlp", // fallback to PATH
];

function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

async function getYtDlpUrl(videoUrl: string): Promise<string> {
  let lastError: Error | null = null;

  for (const ytdlpPath of YT_DLP_PATHS) {
    try {
      const { stdout } = await execFileAsync(ytdlpPath, [
        "-f",
        "best[height<=720][ext=mp4]/best[ext=mp4]/best",
        "--get-url",
        "--no-warnings",
        videoUrl,
      ], { timeout: 30000 });

      const url = stdout.trim().split("\n")[0];
      if (url) return url;
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError || new Error("yt-dlp not found");
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // YouTube/supported site → use yt-dlp to get direct URL, then redirect
  if (isYouTubeUrl(url)) {
    try {
      const directUrl = await getYtDlpUrl(url);

      // Proxy the direct URL to avoid CORS issues
      const videoResponse = await fetch(directUrl, {
        headers: {
          "Range": request.headers.get("range") || "",
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!videoResponse.ok && videoResponse.status !== 206) {
        return NextResponse.json(
          { error: `Failed to fetch video: ${videoResponse.status}` },
          { status: 502 }
        );
      }

      const headers = new Headers();
      headers.set("Content-Type", videoResponse.headers.get("content-type") || "video/mp4");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "public, max-age=3600");

      const contentLength = videoResponse.headers.get("content-length");
      if (contentLength) headers.set("Content-Length", contentLength);

      const contentRange = videoResponse.headers.get("content-range");
      if (contentRange) headers.set("Content-Range", contentRange);

      return new Response(videoResponse.body, {
        status: videoResponse.status,
        headers,
      });
    } catch (err) {
      const message = (err as Error).message;
      console.error("yt-dlp error:", message);
      return NextResponse.json(
        { error: `YouTube error: ${message}` },
        { status: 502 }
      );
    }
  }

  // Direct video URL — proxy to avoid CORS
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Range": request.headers.get("range") || "",
      },
    });

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.status}` },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", response.headers.get("content-type") || "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=3600");

    const contentLength = response.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    const contentRange = response.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Proxy error: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
