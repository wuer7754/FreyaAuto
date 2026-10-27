const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
    createBufferPost,
    getSocialStatus,
    normalizeCampaign,
} = require("../src/integrations/social/social-publisher.service");
const { saveImage } = require("../src/integrations/social/social-media.service");

function bufferWorkspaceClient() {
    return {
        async post(url, payload) {
            assert.equal(url, "https://api.buffer.com");
            if (payload.query.includes("FreyaBufferAccount")) {
                return { data: { data: { account: { id: "account-1", organizations: [{ id: "org-1", name: "Freya" }] } } } };
            }
            if (payload.query.includes("FreyaBufferChannels")) {
                return { data: { data: { channels: [
                    { id: "ig-1", displayName: "@freyafurniture", service: "instagram" },
                    { id: "fb-1", displayName: "Freya Furniture", service: "facebook" },
                    { id: "pin-1", displayName: "Freya Furniture", service: "pinterest" },
                ] } } };
            }
            return { data: { data: { channel: { metadata: { boards: [
                { id: "internal-board", serviceId: "board-1", name: "Gold Mirrors" },
            ] } } } } };
        },
    };
}

test("Buffer connection status discovers channels without exposing the API key", async () => {
    const status = await getSocialStatus({
        env: { BUFFER_API_KEY: "buffer-secret" },
        httpClient: bufferWorkspaceClient(),
    });
    assert.equal(status.buffer.configured, true);
    assert.equal(status.instagram.channelId, "ig-1");
    assert.equal(status.facebook.channelId, "fb-1");
    assert.equal(status.pinterest.channelId, "pin-1");
    assert.equal(status.boards[0].id, "board-1");
    assert.equal(JSON.stringify(status).includes("buffer-secret"), false);
});

test("campaign validation rejects private image URLs", () => {
    assert.throws(
        () => normalizeCampaign({
            platforms: ["instagram"],
            imageUrl: "http://localhost:3000/image.png",
            instagramCaption: "Mirror",
        }),
        /public HTTPS URL/
    );
});

test("campaign validation keeps an ordered multi-image carousel", () => {
    const campaign = normalizeCampaign({
        platforms: ["instagram"],
        imageUrls: [
            "https://example.com/one.jpg",
            "https://example.com/two.jpg",
        ],
        instagramCaption: "Two mirror views",
    });
    assert.deepEqual(campaign.imageUrls, [
        "https://example.com/one.jpg",
        "https://example.com/two.jpg",
    ]);
});

test("computer image uploads produce an unguessable public Buffer URL", () => {
    const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "freya-social-upload-"));
    try {
        const png = Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.from("test-image"),
        ]);
        const image = saveImage(png, "image/png", {
            env: {
                SOCIAL_MEDIA_UPLOAD_DIR: uploadDirectory,
                SOCIAL_MEDIA_PUBLIC_BASE_URL: "https://api.freya-auto.com",
            },
        });
        assert.match(image.url, /^https:\/\/api\.freya-auto\.com\/social\/media\/files\/.+\.png$/);
        assert.equal(fs.existsSync(path.join(uploadDirectory, image.filename)), true);
    } finally {
        fs.rmSync(uploadDirectory, { recursive: true, force: true });
    }
});

test("Instagram publishing creates an image post through Buffer", async () => {
    let captured;
    const httpClient = {
        async post(url, payload, options) {
            captured = { url, payload, options };
            return { data: { data: { createPost: {
                __typename: "PostActionSuccess",
                post: { id: "buffer-post-1", status: "sent" },
            } } } };
        },
    };
    const result = await createBufferPost(
        "instagram",
        {
            imageUrl: "https://example.com/mirror.jpg",
            altText: "Gold mirror",
            instagramCaption: "Gold mirror",
            instagramChannelId: "ig-1",
        },
        { apiKey: "key", instagramChannelId: "" },
        httpClient
    );
    assert.equal(captured.url, "https://api.buffer.com");
    assert.equal(captured.payload.variables.input.channelId, "ig-1");
    assert.equal(captured.payload.variables.input.mode, "shareNow");
    assert.equal(captured.payload.variables.input.metadata.instagram.type, "post");
    assert.equal(captured.options.headers.Authorization, "Bearer key");
    assert.equal(result.id, "buffer-post-1");
});

test("scheduled Buffer posts use a custom date and keep all Instagram images", async () => {
    let input;
    const httpClient = {
        async post(url, payload) {
            input = payload.variables.input;
            return { data: { data: { createPost: {
                __typename: "PostActionSuccess",
                post: { id: "scheduled-1", status: "scheduled" },
            } } } };
        },
    };
    await createBufferPost(
        "instagram",
        {
            imageUrls: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
            altText: "Gold mirror",
            instagramCaption: "Carousel",
            instagramChannelId: "ig-1",
            scheduledAt: "2030-01-02T17:00:00.000Z",
        },
        { apiKey: "key", instagramChannelId: "" },
        httpClient
    );
    assert.equal(input.mode, "customScheduled");
    assert.equal(input.dueAt, "2030-01-02T17:00:00.000Z");
    assert.equal(input.assets.length, 2);
});

test("Facebook publishing creates a Page image post through Buffer", async () => {
    let input;
    const httpClient = {
        async post(url, payload) {
            input = payload.variables.input;
            return { data: { data: { createPost: {
                __typename: "PostActionSuccess",
                post: { id: "buffer-facebook-1", status: "sent" },
            } } } };
        },
    };
    const result = await createBufferPost(
        "facebook",
        {
            imageUrls: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
            altText: "Gold arched mirror",
            facebookText: "A warm welcome starts in the entryway.",
            facebookChannelId: "fb-1",
        },
        { apiKey: "key", facebookChannelId: "" },
        httpClient
    );
    assert.equal(input.channelId, "fb-1");
    assert.equal(input.text, "A warm welcome starts in the entryway.");
    assert.equal(input.metadata.facebook.type, "post");
    assert.equal(input.assets.length, 2);
    assert.equal(result.id, "buffer-facebook-1");
});

test("Pinterest publishing sends its Buffer board service ID", async () => {
    let input;
    const httpClient = {
        async post(url, payload) {
            input = payload.variables.input;
            return { data: { data: { createPost: {
                __typename: "PostActionSuccess",
                post: { id: "buffer-pin-1", status: "sent" },
            } } } };
        },
    };
    const result = await createBufferPost(
        "pinterest",
        {
            imageUrl: "https://example.com/mirror.jpg",
            destinationUrl: "https://www.etsy.com/listing/123",
            altText: "Gold arched mirror",
            pinterestTitle: "Gold arched wall mirror",
            pinterestDescription: "Entryway mirror",
            pinterestBoardId: "board-1",
            pinterestChannelId: "pin-1",
        },
        { apiKey: "key", pinterestChannelId: "", pinterestBoardId: "" },
        httpClient
    );
    assert.equal(input.channelId, "pin-1");
    assert.equal(input.metadata.pinterest.boardServiceId, "board-1");
    assert.equal(input.metadata.pinterest.url, "https://www.etsy.com/listing/123");
    assert.equal(result.id, "buffer-pin-1");
});
