import { NextRequest, NextResponse } from "next/server";
import { schedulePost, getProfiles, getQueue, getPostAnalytics } from "@/lib/buffer";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "profiles": {
        const profiles = await getProfiles();
        return NextResponse.json(profiles);
      }
      case "queue": {
        const profileId = searchParams.get("profileId");
        if (!profileId) {
          return NextResponse.json({ error: "profileId required" }, { status: 400 });
        }
        const queue = await getQueue(profileId);
        return NextResponse.json(queue);
      }
      case "analytics": {
        const updateId = searchParams.get("updateId");
        if (!updateId) {
          return NextResponse.json({ error: "updateId required" }, { status: 400 });
        }
        const analytics = await getPostAnalytics(updateId);
        return NextResponse.json(analytics);
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profileIds, text, scheduledAt, media } = body;

    if (!profileIds || !text) {
      return NextResponse.json(
        { error: "profileIds and text are required" },
        { status: 400 }
      );
    }

    const result = await schedulePost({
      profileIds,
      text,
      scheduledAt,
      media,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
