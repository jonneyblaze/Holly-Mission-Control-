// Buffer GraphQL API helper
// Endpoint: https://api.buffer.com
// Auth: API key from https://publish.buffer.com/settings/api
// Docs: https://developers.buffer.com/reference.html

const BUFFER_API = "https://api.buffer.com";

function getToken() {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error("Missing BUFFER_ACCESS_TOKEN");
  return token;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2_000;

async function bufferQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(BUFFER_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 60_000)
        : BASE_DELAY_MS * 2 ** attempt;
      console.log(
        `[buffer] 429 rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Buffer API error ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (json.errors && json.errors.length > 0) {
      const code = json.errors[0].extensions?.code;
      // Retry on GraphQL-level rate limits (HTTP 200 but RATE_LIMIT_EXCEEDED)
      if (code === "RATE_LIMIT_EXCEEDED" && attempt < MAX_RETRIES) {
        const waitMs = BASE_DELAY_MS * 2 ** attempt;
        console.log(
          `[buffer] GraphQL rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(`Buffer GraphQL error: ${json.errors[0].message}`);
    }

    return json.data as T;
  }

  throw new Error("Buffer API: max retries exceeded on 429");
}

// ---------- Types ----------

export interface BufferChannel {
  id: string;
  name: string;
  displayName: string;
  service: string; // linkedin, instagram, tiktok, etc.
  avatar?: string;
  isQueuePaused?: boolean;
}

export interface BufferOrganization {
  id: string;
  name: string;
}

export interface BufferPost {
  id: string;
  text: string;
}

// ---------- Queries ----------

export async function getAccount(): Promise<{
  id: string;
  email: string;
  name: string;
  organizations: BufferOrganization[];
}> {
  const data = await bufferQuery<{
    account: {
      id: string;
      email: string;
      name: string;
      organizations: BufferOrganization[];
    };
  }>(`
    query GetAccount {
      account {
        id
        email
        name
        organizations {
          id
          name
        }
      }
    }
  `);
  return data.account;
}

export async function getChannels(organizationId: string): Promise<BufferChannel[]> {
  const data = await bufferQuery<{
    channels: BufferChannel[];
  }>(
    `
    query GetChannels($input: ChannelsInput!) {
      channels(input: $input) {
        id
        name
        displayName
        service
        avatar
        isQueuePaused
      }
    }
  `,
    { input: { organizationId } }
  );
  return data.channels;
}

// Get all channels across all organizations
export async function getAllChannels(): Promise<BufferChannel[]> {
  const account = await getAccount();
  const allChannels: BufferChannel[] = [];
  for (const org of account.organizations) {
    const channels = await getChannels(org.id);
    allChannels.push(...channels);
  }
  return allChannels;
}

// ---------- Mutations ----------

export async function createPost(params: {
  channelId: string;
  text: string;
  scheduledAt?: string; // ISO datetime
}): Promise<BufferPost | { error: string }> {
  const hasSchedule = !!params.scheduledAt;

  // mode: customScheduled requires dueAt, addToQueue lets Buffer pick the time
  const input: Record<string, unknown> = {
    channelId: params.channelId,
    text: params.text,
    mode: hasSchedule ? "customScheduled" : "addToQueue",
  };

  if (hasSchedule) {
    input.dueAt = params.scheduledAt;
  }

  console.log("[buffer] createPost input:", JSON.stringify(input));

  const data = await bufferQuery<{
    createPost:
      | { __typename: "PostActionSuccess"; post: BufferPost }
      | { __typename: "MutationError"; message: string };
  }>(
    `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess {
          post {
            id
            text
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `,
    { input }
  );

  const result = data.createPost;
  console.log("[buffer] createPost result:", JSON.stringify(result));

  if (result.__typename === "MutationError" || "message" in result) {
    const errMsg = "message" in result ? String(result.message) : "Unknown mutation error";
    return { error: errMsg };
  }
  return (result as { __typename: "PostActionSuccess"; post: BufferPost }).post;
}

// Schedule to multiple channels
export async function createPostMultiChannel(params: {
  channelIds: string[];
  text: string;
  scheduledAt?: string;
}): Promise<{ posts: BufferPost[]; errors: string[] }> {
  const posts: BufferPost[] = [];
  const errors: string[] = [];

  for (let i = 0; i < params.channelIds.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1_500));

    const result = await createPost({
      channelId: params.channelIds[i],
      text: params.text,
      scheduledAt: params.scheduledAt,
    });

    if ("error" in result) {
      errors.push(`${params.channelIds[i]}: ${result.error}`);
    } else {
      posts.push(result);
    }
  }

  return { posts, errors };
}

// ---------- Health check ----------

export async function checkConnection(): Promise<{
  connected: boolean;
  channels: number;
  organizationId?: string;
  error?: string;
}> {
  try {
    const account = await getAccount();
    if (!account.organizations.length) {
      return { connected: true, channels: 0, error: "No organizations found" };
    }
    const orgId = account.organizations[0].id;
    const channels = await getChannels(orgId);
    return { connected: true, channels: channels.length, organizationId: orgId };
  } catch (err) {
    return {
      connected: false,
      channels: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
