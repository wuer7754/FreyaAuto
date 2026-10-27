const socialPublisher = require("../integrations/social/social-publisher.service");
const socialMedia = require("../integrations/social/social-media.service");
const etsyService = require("../integrations/etsy/etsy.service");
const openaiService = require("../integrations/openai/openai.service");

function errorMessage(error, fallback) {
    const code = error?.code || error?.error?.code || error?.response?.data?.error?.code;
    const rawMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        "";
    if (code === "invalid_api_key") {
        return "The OpenAI API key is invalid. Replace OPENAI_API_KEY, then restart Freya Auto.";
    }
    if (["insufficient_quota", "billing_hard_limit_reached"].includes(code)) {
        return "The OpenAI API account has no available image-generation credit. Check API billing and usage limits.";
    }
    if (code === "model_not_found") {
        return "This OpenAI API project cannot use the configured image model. Check model access or OPENAI_IMAGE_MODEL.";
    }
    if (/request timed out|timed out/i.test(rawMessage)) {
        return "OpenAI image generation timed out through the current proxy. Your API key and image-model access are valid, but the proxy or upstream image service ended the task before it completed.";
    }
    return (
        rawMessage ||
        fallback
    );
}

async function getStatus(req, res) {
    try {
        const status = await socialPublisher.getSocialStatus();
        const r2Config = socialMedia.getR2Config();

        return res.json({
            ...status,
            r2: {
                configured: socialMedia.isR2Configured(),
                bucket: r2Config.bucket || null,
            },
        });
    } catch (error) {
        return res.status(error.response?.status || 502).json({
            error: errorMessage(error, "Failed to connect to Buffer."),
        });
    }
}

function getHistory(req, res) {
    try {
        return res.json({ records: socialPublisher.getHistory(req.query?.limit) });
    } catch (error) {
        return res.status(500).json({ error: errorMessage(error, "Failed to load social publishing history.") });
    }
}

async function getPinterestBoards(req, res) {
    try {
        return res.json({ boards: await socialPublisher.getPinterestBoards() });
    } catch (error) {
        return res.status(error.response?.status || 502).json({
            error: errorMessage(error, "Failed to load Pinterest boards."),
        });
    }
}

async function publish(req, res) {
    try {
        const record = await socialPublisher.publishCampaign(req.body, {
            publishedBy: req.teamUser?.username || "unknown",
        });
        const successful = record.results.filter((item) => item.status !== "failed").length;
        if (successful === 0) {
            return res.status(502).json({
                error: record.results.map((item) => `${item.platform}: ${item.error}`).join(" | "),
                record,
            });
        }
        return res.status(record.status === "partial" ? 207 : 201).json({
            success: record.status === "published",
            record,
        });
    } catch (error) {
        return res.status(error.response?.status || 400).json({
            error: errorMessage(error, "Failed to publish the social campaign."),
        });
    }
}

async function schedule(req, res) {
    try {
        const records = await socialPublisher.scheduleCampaigns(req.body?.campaigns, {
            publishedBy: req.teamUser?.username || "unknown",
        });
        const scheduled = records.filter((record) => record.status === "scheduled").length;
        return res.status(scheduled === records.length ? 201 : 207).json({
            success: scheduled === records.length,
            scheduled,
            records,
        });
    } catch (error) {
        return res.status(error.response?.status || 400).json({
            error: errorMessage(error, "Failed to schedule the social queue."),
        });
    }
}

async function generateCopy(req, res) {
    try {
        const listingId = String(req.body?.listingId || "").trim();
        if (!listingId) return res.status(400).json({ error: "Choose a listing first." });
        const listing = await etsyService.getListing(listingId);
        const copy = await openaiService.generateSocialCopy(listing, req.body?.brief);
        return res.json({ copy });
    } catch (error) {
        return res.status(error.response?.status || 502).json({
            error: errorMessage(error, "Failed to generate social copy."),
        });
    }
}

async function generateQueueCopy(req, res) {
    try {
        const listingId = String(req.body?.listingId || "").trim();
        if (!listingId) return res.status(400).json({ error: "Choose a listing first." });
        const listing = await etsyService.getListing(listingId);
        const posts = await openaiService.generateSocialQueueCopy(
            listing,
            req.body?.items,
            req.body?.brief
        );
        return res.json({ posts });
    } catch (error) {
        return res.status(error.response?.status || 502).json({
            error: errorMessage(error, "Failed to generate weekly social copy."),
        });
    }
}

async function generateImage(req, res) {
    try {
        const listingId = String(req.body?.listingId || "").trim();
        if (!listingId) return res.status(400).json({ error: "Choose a listing first." });
        const imageData = await etsyService.getListingImages(listingId);
        const availableImages = Array.isArray(imageData) ? imageData : imageData?.results || [];
        const requestedIds = new Set(
            (Array.isArray(req.body?.listingImageIds) ? req.body.listingImageIds : [])
                .map(String)
        );
        const selectedImages = availableImages.filter((image, index) =>
            requestedIds.has(String(image.listing_image_id ?? index))
        ).slice(0, 4);
        if (!selectedImages.length) {
            return res.status(400).json({ error: "Select at least one Etsy product image." });
        }
        const productImageUrls = selectedImages.map((image) =>
            image.url_fullxfull || image.url_570xN || image.url_170x135
        ).filter(Boolean);
        if (!productImageUrls.length) {
            return res.status(400).json({ error: "The selected Etsy images do not have downloadable files." });
        }
        const backgroundImage = req.body?.backgroundFilename
            ? socialMedia.readUploadedImage(req.body.backgroundFilename)
            : null;
        const generated = await openaiService.generateSocialImage({
            productImageUrls,
            backgroundImage,
            prompt: req.body?.prompt,
            size: req.body?.size,
        });
        const image = socialMedia.saveImage(generated.buffer, generated.mimeType, { request: req });
        await socialMedia.uploadToR2(image);
        delete image.buffer;
        return res.status(201).json({ image, sourceImageCount: productImageUrls.length });
    } catch (error) {
        console.error("Generate social image error:", {
            status: error.status || error.response?.status,
            code: error.code || error.response?.data?.error?.code,
            param: error.param || error.response?.data?.error?.param,
            message: error.message,
        });
        return res.status(error.status || error.response?.status || 502).json({
            error: errorMessage(error, "Failed to create the social image."),
        });
    }
}

async function uploadImage(req, res) {
    try {
        const image = socialMedia.saveImage(
            req.body,
            req.get("x-freya-file-type") || req.get("content-type"),
            { request: req }
        );
        await socialMedia.uploadToR2(image);
        delete image.buffer;
        return res.status(201).json({ image });
    } catch (error) {
        return res.status(400).json({
            error: errorMessage(error, "Failed to upload the image."),
        });
    }
}

module.exports = { generateCopy, generateImage, generateQueueCopy, getHistory, getPinterestBoards, getStatus, publish, schedule, uploadImage };
