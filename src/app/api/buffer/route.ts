import { NextRequest, NextResponse } from "next/server";
import {
  createPost,
  createPostMultiChannel,
  getAllChannels,
  getChannels,
  getAccount,
  checkConnection,
} from "@/lib/buffer";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "channels": {
        const orgId = searchParams.get("organizationId");
        if (orgId) {
          const channels = await getChannels(orgId);
          return NextResponse.json({ channels });
        }
        // Get all channels across all orgs
        const channels = await getAllChannels();
        return NextResponse.json({ channels });
      }
      case "account": {
        const account = await getAccount();
        return NextResponse.json(account);
      }
      case "health": {
        const status = await checkConnection();
        return NextResponse.json(status);
      }
      default:
        return NextResponse.json({ error: "Invalid action. Use: channels, account, health" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelIds, channelId, text, scheduledAt } = body;

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    // Single channel
    if (channelId && !channelIds) {
      const result = await createPost({ channelId, text, scheduledAt });
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, post: result }, { status: 201 });
    }

    // Multiple channels
    if (channelIds?.length) {
      const result = await createPostMultiChannel({ channelIds, text, scheduledAt });
      return NextResponse.json(
        { ok: true, posts: result.posts, errors: result.errors },
        { status: result.errors.length > 0 ? 207 : 201 }
      );
    }

    return NextResponse.json(
      { error: "channelId or channelIds[] required" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
