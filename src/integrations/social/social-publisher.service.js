const fs = require("fs");
const path = require("path");
const axios = require("axios");

const BUFFER_API_URL = "https://api.buffer.com";
const HISTORY_PATH = process.env.SOCIAL_PUBLISHING_FILE
    ? path.resolve(process.env.SOCIAL_PUBLISHING_FILE)
    : path.join(__dirname, "../../config/social-publishing.json");

function getConfig(env = process.env) {
    return {
        apiKey: String(env.BUFFER_API_KEY || "").trim(),
        organizationId: String(env.BUFFER_ORGANIZATION_ID || "").trim(),
        instagramChannelId: String(env.BUFFER_INSTAGRAM_CHANNEL_ID || "").trim(),
        facebookChannelId: String(env.BUFFER_FACEBOOK_CHANNEL_ID || "").trim(),
        pinterestChannelId: String(env.BUFFER_PINTEREST_CHANNEL_ID || "").trim(),
        pinterestBoardId: String(env.BUFFER_PINTEREST_BOARD_ID || "").trim(),
    };
}

function isPrivateHostname(hostname) {
    const value = String(hostname || "").toLowerCase();
    if (!value || value === "localhost" || value.endsWith(".local")) return true;
    if (value === "127.0.0.1" || value === "0.0.0.0" || value === "::1") return true;
    if (/^10\./.test(value) || /^192\.168\./.test(value)) return true;
    const match = value.match(/^172\.(\d+)\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function publicHttpsUrl(value, fieldName) {
    let parsed;
    try {
        parsed = new URL(String(value || "").trim());
    } catch {
        throw new Error(`${fieldName} must be a valid public HTTPS URL.`);
    }
    if (parsed.protocol !== "https:" || isPrivateHostname(parsed.hostname)) {
        throw new Error(`${fieldName} must be a valid public HTTPS URL.`);
    }
    return parsed.toString();
}

function cleanText(value, maximum, fieldName, { required = false } = {}) {
    const text = String(value || "").trim();
    if (required && !text) throw new Error(`${fieldName} is required.`);
    if (text.length > maximum) {
        throw new Error(`${fieldName} must be ${maximum} characters or fewer.`);
    }
    return text;
}

function normalizeCampaign(input = {}) {
    const platforms = [...new Set(
        (Array.isArray(input.platforms) ? input.platforms : [])
            .map((value) => String(value).toLowerCase())
            .filter((value) => ["instagram", "facebook", "pinterest"].includes(value))
    )];
    if (!platforms.length) throw new Error("Choose Instagram, Facebook, or Pinterest.");

    const rawImageUrls = Array.isArray(input.imageUrls) && input.imageUrls.length
        ? input.imageUrls
        : [input.imageUrl];
    if (rawImageUrls.length > 10) {
        throw new Error("A social post can contain no more than 10 images.");
    }
    const imageUrls = rawImageUrls.map((url, index) =>
        publicHttpsUrl(url, `Image URL ${index + 1}`)
    );
    let scheduledAt = null;
    if (input.scheduledAt) {
        const scheduledDate = new Date(input.scheduledAt);
        if (Number.isNaN(scheduledDate.getTime())) {
            throw new Error("Scheduled time is invalid.");
        }
        if (scheduledDate.getTime() <= Date.now() + 60 * 1000) {
            throw new Error("Scheduled time must be at least one minute in the future.");
        }
        scheduledAt = scheduledDate.toISOString();
    }

    return {
        platforms,
        listingId: input.listingId ? String(input.listingId) : null,
        listingTitle: cleanText(input.listingTitle, 300, "Listing title"),
        imageUrl: imageUrls[0],
        imageUrls,
        scheduledAt,
        destinationUrl: input.destinationUrl
            ? publicHttpsUrl(input.destinationUrl, "Destination URL")
            : "",
        altText: cleanText(input.altText, 500, "Alt text"),
        instagramCaption: cleanText(
            input.instagramCaption,
            2200,
            "Instagram caption",
            { required: platforms.includes("instagram") }
        ),
        facebookText: cleanText(
            input.facebookText,
            5000,
            "Facebook post text",
            { required: platforms.includes("facebook") }
        ),
        pinterestTitle: cleanText(
            input.pinterestTitle,
            100,
            "Pinterest title",
            { required: platforms.includes("pinterest") }
        ),
        pinterestDescription: cleanText(input.pinterestDescription, 500, "Pinterest description"),
        pinterestBoardId: cleanText(input.pinterestBoardId, 100, "Pinterest board ID"),
        instagramChannelId: cleanText(input.instagramChannelId, 100, "Instagram channel ID"),
        facebookChannelId: cleanText(input.facebookChannelId, 100, "Facebook channel ID"),
        pinterestChannelId: cleanText(input.pinterestChannelId, 100, "Pinterest channel ID"),
    };
}

function graphErrorMessage(payload) {
    const topLevel = payload?.errors?.[0]?.message;
    if (topLevel) return topLevel;
    const result = payload?.data?.createPost;
    if (result?.__typename && result.__typename !== "PostActionSuccess") {
        return result.message || `Buffer returned ${result.__typename}.`;
    }
    return "";
}

async function bufferGraphql(query, variables, config, httpClient = axios) {
    if (!config.apiKey) throw new Error("Buffer is not configured in Freya Auto.");
    const response = await httpClient.post(
        BUFFER_API_URL,
        { query, variables },
        {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
            },
        }
    );
    const error = graphErrorMessage(response.data);
    if (error) throw new Error(error);
    return response.data?.data || {};
}

async function getBufferWorkspace({ env = process.env, httpClient = axios } = {}) {
    const config = getConfig(env);
    if (!config.apiKey) {
        return { configured: false, organization: null, channels: [], boards: [] };
    }

    const accountData = await bufferGraphql(
        `query FreyaBufferAccount {
            account { id organizations { id name } }
        }`,
        {},
        config,
        httpClient
    );
    const organizations = accountData.account?.organizations || [];
    const organization = organizations.find(
        (item) => String(item.id) === config.organizationId
    ) || organizations[0] || null;
    if (!organization) {
        return { configured: true, organization: null, channels: [], boards: [] };
    }

    const channelData = await bufferGraphql(
        `query FreyaBufferChannels($organizationId: OrganizationId!) {
            channels(input: { organizationId: $organizationId }) {
                id name displayName service avatar isQueuePaused
            }
        }`,
        { organizationId: organization.id },
        config,
        httpClient
    );
    const channels = (channelData.channels || []).map((channel) => ({
        id: String(channel.id),
        name: channel.displayName || channel.name || String(channel.id),
        service: String(channel.service || "").toLowerCase(),
        avatar: channel.avatar || null,
        isQueuePaused: Boolean(channel.isQueuePaused),
    }));
    const pinterest = channels.find((channel) =>
        channel.id === config.pinterestChannelId
    ) || channels.find((channel) => channel.service === "pinterest");

    let boards = [];
    if (pinterest) {
        const detailData = await bufferGraphql(
            `query FreyaPinterestBoards($channelId: ChannelId!) {
                channel(input: { id: $channelId }) {
                    metadata {
                        ... on PinterestMetadata {
                            boards { id serviceId name url }
                        }
                    }
                }
            }`,
            { channelId: pinterest.id },
            config,
            httpClient
        );
        boards = (detailData.channel?.metadata?.boards || []).map((board) => ({
            id: String(board.serviceId || board.id),
            name: board.name || `Board ${board.serviceId || board.id}`,
            url: board.url || null,
        }));
    }

    return { configured: true, organization, channels, boards };
}

async function getSocialStatus(options = {}) {
    const workspace = await getBufferWorkspace(options);
    const config = getConfig(options.env || process.env);
    const instagram = workspace.channels.find((channel) =>
        channel.id === config.instagramChannelId
    ) || workspace.channels.find((channel) => channel.service === "instagram");
    const facebook = workspace.channels.find((channel) =>
        channel.id === config.facebookChannelId
    ) || workspace.channels.find((channel) => channel.service === "facebook");
    const pinterest = workspace.channels.find((channel) =>
        channel.id === config.pinterestChannelId
    ) || workspace.channels.find((channel) => channel.service === "pinterest");

    return {
        provider: "buffer",
        buffer: {
            configured: workspace.configured,
            organization: workspace.organization,
        },
        instagram: {
            configured: Boolean(instagram),
            channelId: instagram?.id || null,
            name: instagram?.name || null,
        },
        facebook: {
            configured: Boolean(facebook),
            channelId: facebook?.id || null,
            name: facebook?.name || null,
        },
        pinterest: {
            configured: Boolean(pinterest),
            channelId: pinterest?.id || null,
            name: pinterest?.name || null,
            defaultBoardId: config.pinterestBoardId || null,
        },
        channels: workspace.channels,
        boards: workspace.boards,
    };
}

async function createBufferPost(platform, campaign, config, httpClient = axios) {
    const channelId = platform === "instagram"
        ? campaign.instagramChannelId || config.instagramChannelId
        : platform === "facebook"
          ? campaign.facebookChannelId || config.facebookChannelId
          : campaign.pinterestChannelId || config.pinterestChannelId;
    if (!channelId) throw new Error(`Choose a Buffer ${platform} channel before publishing.`);
    if (platform === "pinterest" && !campaign.pinterestBoardId && !config.pinterestBoardId) {
        throw new Error("Choose a Pinterest board before publishing.");
    }

    const campaignImages = Array.isArray(campaign.imageUrls) && campaign.imageUrls.length
        ? campaign.imageUrls
        : [campaign.imageUrl];
    const imageUrls = platform === "pinterest"
        ? campaignImages.slice(0, 1)
        : campaignImages;
    const input = {
        text: platform === "instagram"
            ? campaign.instagramCaption
            : platform === "facebook"
              ? campaign.facebookText
              : campaign.pinterestDescription,
        channelId,
        schedulingType: "automatic",
        mode: campaign.scheduledAt ? "customScheduled" : "shareNow",
        dueAt: campaign.scheduledAt || undefined,
        assets: imageUrls.map((url) => ({
            image: {
                url,
                metadata: { altText: campaign.altText || campaign.listingTitle || "Product image" },
            },
        })),
        metadata: platform === "instagram"
            ? { instagram: { type: "post", shouldShareToFeed: true } }
            : platform === "facebook"
              ? { facebook: { type: "post" } }
              : {
                pinterest: {
                    boardServiceId: campaign.pinterestBoardId || config.pinterestBoardId,
                    title: campaign.pinterestTitle,
                    url: campaign.destinationUrl || undefined,
                },
            },
    };
    const data = await bufferGraphql(
        `mutation FreyaCreateSocialPost($input: CreatePostInput!) {
            createPost(input: $input) {
                __typename
                ... on PostActionSuccess {
                    post { id text dueAt status assets { id mimeType } }
                }
                ... on NotFoundError { message }
                ... on UnauthorizedError { message }
                ... on UnexpectedError { message }
                ... on RestProxyError { message }
                ... on LimitReachedError { message }
                ... on InvalidInputError { message }
            }
        }`,
        { input },
        config,
        httpClient
    );
    const post = data.createPost?.post;
    if (!post?.id) throw new Error("Buffer did not return a post ID.");
    return {
        id: String(post.id),
        channelId,
        bufferStatus: post.status || null,
        imageCount: imageUrls.length,
    };
}

function readHistory() {
    try {
        const data = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

function writeHistory(records) {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    const temporaryPath = `${HISTORY_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    fs.renameSync(temporaryPath, HISTORY_PATH);
}

function getHistory(limit = 20) {
    return readHistory().slice(0, Math.min(Math.max(Number(limit) || 20, 1), 100));
}

function safeError(error) {
    const platformMessage =
        error.response?.data?.errors?.[0]?.message ||
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
    return String(platformMessage || "Publishing failed.").slice(0, 500);
}

async function getPinterestBoards(options = {}) {
    return (await getBufferWorkspace(options)).boards;
}

async function publishCampaign(
    input,
    { env = process.env, httpClient = axios, publishedBy = "unknown" } = {}
) {
    const campaign = normalizeCampaign(input);
    const config = getConfig(env);
    const attempts = campaign.platforms.map(async (platform) => {
        try {
            const response = await createBufferPost(platform, campaign, config, httpClient);
            return {
                platform,
                status: campaign.scheduledAt ? "scheduled" : "published",
                provider: "buffer",
                ...response,
            };
        } catch (error) {
            return { platform, status: "failed", provider: "buffer", error: safeError(error) };
        }
    });
    const results = await Promise.all(attempts);
    const successfulCount = results.filter((item) => item.status !== "failed").length;
    const successfulStatus = campaign.scheduledAt ? "scheduled" : "published";
    const record = {
        id: `social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        publishedBy,
        provider: "buffer",
        listingId: campaign.listingId,
        listingTitle: campaign.listingTitle,
        imageUrl: campaign.imageUrl,
        imageUrls: campaign.imageUrls,
        destinationUrl: campaign.destinationUrl,
        scheduledAt: campaign.scheduledAt,
        status:
            successfulCount === results.length
                ? successfulStatus
                : successfulCount > 0
                  ? "partial"
                  : "failed",
        results,
    };
    writeHistory([record, ...readHistory()].slice(0, 250));
    return record;
}

async function scheduleCampaigns(
    inputs,
    { env = process.env, httpClient = axios, publishedBy = "unknown" } = {}
) {
    if (!Array.isArray(inputs) || !inputs.length) {
        throw new Error("Add at least one post to the weekly queue.");
    }
    if (inputs.length > 14) {
        throw new Error("A weekly queue can contain no more than 14 posts.");
    }
    const records = [];
    for (const input of inputs) {
        records.push(await publishCampaign(input, { env, httpClient, publishedBy }));
    }
    return records;
}

module.exports = {
    bufferGraphql,
    createBufferPost,
    getBufferWorkspace,
    getConfig,
    getHistory,
    getPinterestBoards,
    getSocialStatus,
    normalizeCampaign,
    publishCampaign,
    scheduleCampaigns,
};
