import { type NextRequest, NextResponse } from "next/server";
import ytdl from "@distube/ytdl-core";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Direct video URL (not YouTube) — proxy it to avoid CORS
  if (!ytdl.validateURL(url)) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch: ${response.status}` },
          { status: 502 }
        );
      }

      const contentType = response.headers.get("content-type") || "video/mp4";
      const body = response.body;

      return new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Proxy error: ${(err as Error).message}` },
        { status: 502 }
      );
    }
  }

  // YouTube URL — stream via ytdl
  try {
    const info = await ytdl.getInfo(url);

    // Pick best format: prefer mp4, 720p or lower for performance
    const format = ytdl.chooseFormat(info.formats, {
      quality: "highest",
      filter: (f) =>
        f.container === "mp4" &&
        f.hasVideo === true &&
        f.hasAudio === true &&
        (f.height ?? 0) <= 720,
    });

    // If no combined format found, try any mp4 with video
    const finalFormat =
      format ||
      ytdl.chooseFormat(info.formats, {
        quality: "highest",
        filter: (f) => f.container === "mp4" && f.hasVideo === true,
      });

    if (!finalFormat) {
      return NextResponse.json(
        { error: "No suitable video format found" },
        { status: 404 }
      );
    }

    const stream = ytdl.downloadFromInfo(info, { format: finalFormat });

    // Convert Node.js Readable to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        stream.on("end", () => {
          controller.close();
        });
        stream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": finalFormat.mimeType || "video/mp4",
        "Content-Length": String(finalFormat.contentLength || ""),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("YouTube proxy error:", message);
    return NextResponse.json(
      { error: `YouTube error: ${message}` },
      { status: 502 }
    );
  }
}
