const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const DEFAULT_UPLOAD_DIR = path.join(__dirname, "../../../output/social-uploads");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};

function getUploadDirectory(env = process.env) {
    return env.SOCIAL_MEDIA_UPLOAD_DIR
        ? path.resolve(env.SOCIAL_MEDIA_UPLOAD_DIR)
        : DEFAULT_UPLOAD_DIR;
}

function getPublicOrigin(env = process.env, request) {
    const candidates = [
        env.SOCIAL_MEDIA_PUBLIC_BASE_URL,
        request ? `${request.protocol}://${request.get("host")}` : "",
    ];
    for (const candidate of candidates) {
        try {
            const parsed = new URL(String(candidate || "").trim());
            if (parsed.protocol !== "https:") continue;
            if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) continue;
            return parsed.origin;
        } catch {
            // Try the next configured source.
        }
    }
    throw new Error(
        "Set SOCIAL_MEDIA_PUBLIC_BASE_URL to the public HTTPS address of Freya Auto before uploading images."
    );
}

function getR2Config(env = process.env) {
    return {
        accountId: String(env.R2_ACCOUNT_ID || "").trim(),
        accessKeyId: String(env.R2_ACCESS_KEY_ID || "").trim(),
        secretAccessKey: String(env.R2_SECRET_ACCESS_KEY || "").trim(),
        bucket: String(env.R2_BUCKET || "").trim(),
    };
}

function isR2Configured(env = process.env) {
    const config = getR2Config(env);
    return Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucket);
}

async function uploadToR2(image, { env = process.env } = {}) {
    if (!isR2Configured(env)) return;
    const config = getR2Config(env);
    const client = new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
    await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: image.filename,
        Body: image.buffer,
        ContentType: image.mimeType,
        CacheControl: "public, max-age=2592000, immutable",
    }));
}

function saveImage(buffer, mimeType, { env = process.env, request } = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new Error("Choose an image to upload.");
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error("The image must be 10 MB or smaller.");
    }
    const normalizedType = String(mimeType || "").split(";")[0].trim().toLowerCase();
    const extension = MIME_EXTENSIONS[normalizedType];
    if (!extension) {
        throw new Error("Use a JPG, PNG, or WebP image.");
    }
    const hasExpectedSignature =
        (normalizedType === "image/jpeg" && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
        (normalizedType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
        (normalizedType === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP");
    if (!hasExpectedSignature) {
        throw new Error("The uploaded file does not match its image type.");
    }

    const publicOrigin = getPublicOrigin(env, request);
    const uploadDirectory = getUploadDirectory(env);
    fs.mkdirSync(uploadDirectory, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${extension}`;
    const target = path.join(uploadDirectory, filename);
    fs.writeFileSync(target, buffer, { mode: 0o600, flag: "wx" });

    return {
        filename,
        mimeType: normalizedType,
        bytes: buffer.length,
        url: isR2Configured(env)
            ? `${publicOrigin}/${filename}`
            : `${publicOrigin}/social/media/files/${filename}`,
        buffer,
    };
}

function readUploadedImage(filename, { env = process.env } = {}) {
    const safeName = path.basename(String(filename || ""));
    if (!/^\d+-[a-f0-9]{24}\.(?:jpg|png|webp)$/i.test(safeName)) {
        throw new Error("Background image reference is invalid.");
    }
    const extension = path.extname(safeName).toLowerCase();
    const mimeType = extension === ".jpg" ? "image/jpeg" : `image/${extension.slice(1)}`;
    const buffer = fs.readFileSync(path.join(getUploadDirectory(env), safeName));
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
        throw new Error("Background image is missing or too large.");
    }
    return { buffer, filename: safeName, mimeType };
}

module.exports = {
    MAX_IMAGE_BYTES,
    getPublicOrigin,
    getR2Config,
    getUploadDirectory,
    isR2Configured,
    readUploadedImage,
    saveImage,
    uploadToR2,
};
