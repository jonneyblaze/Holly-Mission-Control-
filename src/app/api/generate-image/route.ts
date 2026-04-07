import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// AI Image generation via Pollinations.ai → persisted to BodyLytics Supabase Storage

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

function getBodylyticsStorage() {
  const url = process.env.BODYLYTICS_SUPABASE_URL;
  const key = process.env.BODYLYTICS_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing BODYLYTICS_SUPABASE_URL or BODYLYTICS_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, style, width, height } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const w = width || 1200;
    const h = height || 630;

    const stylePrefix = style || "professional, modern, clean";
    const enhancedPrompt = `${stylePrefix}, ${prompt}, high quality, editorial style, no text overlay`;

    // Generate via Pollinations
    const pollinationsUrl = `${POLLINATIONS_BASE}/${encodeURIComponent(enhancedPrompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;

    // Fetch the actual image bytes
    const imageRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(60_000) });
    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Pollinations returned ${imageRes.status}` },
        { status: 502 }
      );
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    // Upload to BodyLytics Supabase Storage (media bucket, public)
    const filename = `social/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const supabase = getBodylyticsStorage();

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filename, imageBuffer, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate-image] Upload error:", uploadError);
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Get permanent public URL
    const { data: urlData } = supabase.storage.from("media").getPublicUrl(filename);
    const permanentUrl = urlData.publicUrl;

    return NextResponse.json({
      url: permanentUrl,
      source: "pollinations+supabase",
      prompt: enhancedPrompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-image] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: Quick image URL generation
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const prompt = searchParams.get("prompt");
  const w = searchParams.get("width") || "1200";
  const h = searchParams.get("height") || "630";

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  const enhancedPrompt = `professional, modern, ${prompt}, high quality, editorial, no text`;

  // For GET requests, generate and persist too
  try {
    const pollinationsUrl = `${POLLINATIONS_BASE}/${encodeURIComponent(enhancedPrompt)}?width=${parseInt(w)}&height=${parseInt(h)}&nologo=true&seed=${Date.now()}`;

    const imageRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(60_000) });
    if (!imageRes.ok) {
      return NextResponse.json({ error: `Generation failed: ${imageRes.status}` }, { status: 502 });
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";

    const filename = `social/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const supabase = getBodylyticsStorage();

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filename, imageBuffer, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("media").getPublicUrl(filename);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
