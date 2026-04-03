// Buffer API helper
// Docs: https://publish.buffer.com/docs/api

const BUFFER_API = "https://api.bufferapp.com/1";

function getToken() {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error("Missing BUFFER_ACCESS_TOKEN");
  return token;
}

export async function getProfiles() {
  const res = await fetch(`${BUFFER_API}/profiles.json?access_token=${getToken()}`);
  if (!res.ok) throw new Error(`Buffer API error: ${res.status}`);
  return res.json();
}

export async function getQueue(profileId: string) {
  const res = await fetch(
    `${BUFFER_API}/profiles/${profileId}/updates/pending.json?access_token=${getToken()}`
  );
  if (!res.ok) throw new Error(`Buffer API error: ${res.status}`);
  return res.json();
}

export async function schedulePost(params: {
  profileIds: string[];
  text: string;
  scheduledAt?: string; // ISO date
  media?: { link?: string; photo?: string; thumbnail?: string };
}) {
  const body: Record<string, unknown> = {
    text: params.text,
    profile_ids: params.profileIds,
    access_token: getToken(),
  };

  if (params.scheduledAt) {
    body.scheduled_at = params.scheduledAt;
  } else {
    body.now = true;
  }

  if (params.media) {
    body.media = params.media;
  }

  const res = await fetch(`${BUFFER_API}/updates/create.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body as Record<string, string>),
  });

  if (!res.ok) throw new Error(`Buffer API error: ${res.status}`);
  return res.json();
}

export async function getPostAnalytics(updateId: string) {
  const res = await fetch(
    `${BUFFER_API}/updates/${updateId}/interactions.json?access_token=${getToken()}`
  );
  if (!res.ok) throw new Error(`Buffer API error: ${res.status}`);
  return res.json();
}
