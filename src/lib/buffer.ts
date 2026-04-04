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

async function bufferQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(BUFFER_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Buffer API error ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Buffer GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
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
  // Use customScheduled mode with dueAt if a date is provided, otherwise automatic
  const hasSchedule = !!params.scheduledAt;

  const data = await bufferQuery<{
    createPost:
      | { __typename: "PostActionSuccess"; post: BufferPost }
      | { __typename: "MutationError"; message: string };
  }>(
    `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
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
    {
      input: {
        channelId: params.channelId,
        text: params.text,
        schedulingType: "automatic",
        mode: hasSchedule ? "customScheduled" : "customScheduled",
        ...(params.scheduledAt && { dueAt: params.scheduledAt }),
      },
    }
  );

  const result = data.createPost;
  if ("message" in result) {
    return { error: result.message };
  }
  return result.post;
}

// Schedule to multiple channels
export async function createPostMultiChannel(params: {
  channelIds: string[];
  text: string;
  scheduledAt?: string;
}): Promise<{ posts: BufferPost[]; errors: string[] }> {
  const posts: BufferPost[] = [];
  const errors: string[] = [];

  for (const channelId of params.channelIds) {
    const result = await createPost({
      channelId,
      text: params.text,
      scheduledAt: params.scheduledAt,
    });

    if ("error" in result) {
      errors.push(`${channelId}: ${result.error}`);
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
