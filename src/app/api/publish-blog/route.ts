import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// This endpoint publishes a blog post to BodyLytics Supabase
// Flow: bl-marketing writes draft → Holly reviews → this endpoint publishes

const BODYLYTICS_URL = process.env.BODYLYTICS_SUPABASE_URL || "";
const BODYLYTICS_KEY = process.env.BODYLYTICS_SERVICE_ROLE_KEY || "";

// Mission Control Supabase for logging
const MC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const MC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BODYLYTICS_URL || !BODYLYTICS_KEY) {
    return NextResponse.json({ error: "BodyLytics Supabase not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      title,
      slug,
      content,
      excerpt,
      category,
      seo_title,
      seo_description,
      seo_keywords,
      featured_image_url,
      reading_time_minutes,
      author_id,
      // If updating an existing draft
      blog_post_id,
    } = body;

    const bodylytics = createClient(BODYLYTICS_URL, BODYLYTICS_KEY);

    let result;

    if (blog_post_id && !content) {
      // Publishing an existing draft — just update status + published_at
      // Keep all existing content intact
      const updateData: Record<string, unknown> = {
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Only override fields if explicitly provided
      if (title) updateData.title = title;
      if (slug) updateData.slug = slug;
      if (excerpt) updateData.excerpt = excerpt;
      if (category) updateData.category = category;
      if (seo_title) updateData.seo_title = seo_title;
      if (seo_description) updateData.seo_description = seo_description;
      if (featured_image_url) updateData.featured_image_url = featured_image_url;

      const { data, error } = await bodylytics
        .from("blog_posts")
        .update(updateData)
        .eq("id", blog_post_id)
        .select("id, slug, title")
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Creating new post or updating with full content
      if (!title || !content) {
        return NextResponse.json(
          { error: "Missing required fields: title, content" },
          { status: 400 }
        );
      }

      // Generate slug if not provided
      const postSlug =
        slug ||
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      // Estimate reading time if not provided
      const wordCount = content.replace(/<[^>]*>/g, "").split(/\s+/).length;
      const readingTime = reading_time_minutes || Math.max(1, Math.ceil(wordCount / 200));

      const postData = {
        title,
        slug: postSlug,
        content,
        excerpt: excerpt || content.replace(/<[^>]*>/g, "").substring(0, 160) + "...",
        category: category || "body-language",
        seo_title: seo_title || title,
        seo_description: seo_description || excerpt || content.replace(/<[^>]*>/g, "").substring(0, 160),
        seo_keywords: seo_keywords || [],
        featured_image_url: featured_image_url || null,
        reading_time_minutes: readingTime,
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        author_id: author_id || null,
      };

      if (blog_post_id) {
        // Update existing post with new content
        const { data, error } = await bodylytics
          .from("blog_posts")
          .update(postData)
          .eq("id", blog_post_id)
          .select("id, slug, title")
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new published post
        const { data, error } = await bodylytics
          .from("blog_posts")
          .insert(postData)
          .select("id, slug, title")
          .single();

        if (error) throw error;
        result = data;
      }
    }

    // Log to Mission Control
    if (MC_URL && MC_KEY) {
      const mc = createClient(MC_URL, MC_KEY);
      await mc.from("agent_activity").insert({
        agent_id: "bl-marketing",
        activity_type: "content",
        title: `Blog published: ${title}`,
        summary: `Published "${title}" to BodyLytics. Slug: ${result.slug}`,
        full_content: null,
        metadata: {
          blog_post_id: result.id,
          slug: result.slug,
          url: `https://bodylytics.co/blog/${result.slug}`,
        },
        status: "new",
      });
    }

    return NextResponse.json({
      ok: true,
      blog_post_id: result.id,
      slug: result.slug,
      url: `https://bodylytics.co/blog/${result.slug}`,
    });
  } catch (err) {
    console.error("[publish-blog] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: List blog posts from BodyLytics (for the content page)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status"); // draft, published, or all

  if (!BODYLYTICS_URL || !BODYLYTICS_KEY) {
    return NextResponse.json({ error: "BodyLytics not configured" }, { status: 500 });
  }

  try {
    const bodylytics = createClient(BODYLYTICS_URL, BODYLYTICS_KEY);

    let query = bodylytics
      .from("blog_posts")
      .select("id, title, slug, excerpt, status, category, published_at, created_at, updated_at, reading_time_minutes, featured_image_url, seo_title, seo_description")
      .order("created_at", { ascending: false })
      .limit(50);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ posts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
