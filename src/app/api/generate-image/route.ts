import { NextRequest, NextResponse } from "next/server";

// AI Image generation via Pollinations.ai (free, no API key needed)

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, style, width, height } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const w = width || 1200;
    const h = height || 630;

    // Build a better prompt for blog/social images
    const stylePrefix = style || "professional, modern, clean";
    const enhancedPrompt = `${stylePrefix}, ${prompt}, high quality, editorial style, no text overlay`;

    // Pollinations.ai generates on-demand — the URL itself IS the image
    // No need to pre-check with HEAD (it's slow and causes timeouts on serverless)
    const imageUrl = `${POLLINATIONS_BASE}/${encodeURIComponent(enhancedPrompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;

    return NextResponse.json({
      url: imageUrl,
      source: "pollinations",
      prompt: enhancedPrompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: Quick image URL generation (for simple use cases)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const prompt = searchParams.get("prompt");
  const w = searchParams.get("width") || "1200";
  const h = searchParams.get("height") || "630";

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  const enhancedPrompt = `professional, modern, ${prompt}, high quality, editorial, no text`;
  const imageUrl = `${POLLINATIONS_BASE}/${encodeURIComponent(enhancedPrompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;

  return NextResponse.json({ url: imageUrl });
}
