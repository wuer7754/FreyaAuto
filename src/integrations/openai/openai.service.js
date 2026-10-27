const OpenAI = require("openai");
const { fetch, ProxyAgent } = require("undici");

/**
 * OpenAI 请求使用的可选代理地址。
 *
 * OPENAI_PROXY_URL 的优先级更高；未单独配置时，复用 Etsy 的代理地址，
 * 方便整个应用通过同一个代理访问外部 API。
 */
const proxyUrl =
    process.env.OPENAI_PROXY_URL ||
    process.env.ETSY_PROXY_URL;

// OpenAI SDK 的基础配置。API Key 由 dotenv 在应用启动时从 .env 加载。
const openaiOptions = {
    apiKey: process.env.OPENAI_API_KEY,
};

if (proxyUrl) {
    // 启动时输出代理状态，方便确认当前网络配置是否生效。
    // 注意：如果代理 URL 包含账号或密码，不应将该日志公开。
    console.log(`✅ OpenAI proxy enabled: ${proxyUrl}`);

    // 文字请求继续使用 OpenAI SDK 与同一 undici 代理实现。
    openaiOptions.fetch = fetch;
    openaiOptions.fetchOptions = {
        dispatcher: new ProxyAgent(proxyUrl),
    };
} else {
    // 未配置代理时，OpenAI SDK 使用默认网络连接。
    console.log("ℹ️ OpenAI proxy disabled");
}

// 创建可复用的 OpenAI SDK 客户端，避免每次改写商品描述时重复初始化。
const openai = new OpenAI(openaiOptions);

// Freya Furniture 的品牌语气规则。
const BRAND_VOICE = `
You are the senior copywriter for Freya Furniture, a premium home décor and furniture brand.

Freya Furniture's voice should feel:
- Elegant
- Warm
- Refined
- Contemporary
- Inviting
- Calm and confident

The writing should feel premium without sounding pretentious.

Avoid generic AI-style phrases repeated across listings, including:
- "timeless elegance"
- "quiet luxury"
- "elevate your space"
- "thoughtfully designed"
- "wherever it is placed"
- "the perfect blend of"
- "more than just a..."

You may use these ideas occasionally, but do not repeat the same wording across products.

Prioritize product-specific language over generic luxury language.
`;

// Etsy 商品描述的固定版式和可读性规则。
const FORMAT_RULES = `
Return plain text only.

Do NOT use Markdown.
Do NOT use HTML.
Do NOT output #, ##, **, __, backticks, or Markdown bullet formatting.

Use tasteful Unicode symbols and this section structure:

✨ Welcome to Freya Furniture!

<Product introduction>

🌟 Key Features

✔ <Feature 1>
✔ <Feature 2>
✔ <Feature 3>
✔ <Feature 4>
✔ <Optional Feature 5>

🏡 Perfect For

<Short lifestyle paragraph>

💛 Why You'll Love It

<Short emotional/design paragraph>

📦 Secure Packaging

<One short sentence, only if supported by the source description>

🎁 Gift Ready

<One short sentence, only when appropriate>

👉 Explore more designs from FreyaFurnitureUSA on Etsy.

Formatting rules:
- Leave one blank line between sections.
- Keep paragraphs short.
- Keep feature bullets concise.
- Do not create walls of text.
- Use emojis only in section headings.
- Do not overuse emojis.
`;

/**
 * 可轮换的 Etsy 描述模板。
 *
 * 模板只改变信息组织方式和阅读节奏，不会改变 FACT_RULES 中的事实限制。
 * publicDescription 会通过配置接口提供给前端，instructions 仅在服务端使用。
 */
const DESCRIPTION_TEMPLATES = [
    {
        id: "signature",
        name: "Freya Signature",
        shortName: "Signature",
        publicDescription:
            "The familiar Freya layout with elegant emoji headings and concise feature points.",
        sections: ["Introduction", "Key Features", "Perfect For", "Why You'll Love It"],
        preview: `✨ Welcome to Freya Furniture!

Bring graceful architecture and a warm decorative finish to your home with this softly arched mirror. Its balanced silhouette offers an inviting focal point without overwhelming the room.

🌟 Key Features

✔ Softly arched silhouette
✔ Warm gold-tone frame finish
✔ Clean, contemporary profile
✔ Decorative design with versatile styling potential

🏡 Perfect For

Style it above an entryway console, in a calm bedroom, or as a polished living room accent. It works beautifully with modern, contemporary, and softly traditional interiors.

💛 Why You'll Love It

The curved outline introduces a gentler rhythm to the wall, while the warm finish adds a considered touch of character.

👉 Explore more designs from FreyaFurnitureUSA on Etsy.`,
        instructions: FORMAT_RULES,
    },
    {
        id: "minimal",
        name: "Refined Minimal",
        shortName: "Minimal",
        publicDescription:
            "A quieter, text-led format with short paragraphs and restrained section titles.",
        sections: ["Introduction", "Design Details", "Styling Notes", "The Freya Finish"],
        preview: `Welcome to Freya Furniture

Defined by a softly arched silhouette and warm gold-tone finish, this mirror brings a composed architectural presence to the wall.

Its clean profile feels refined without becoming overly formal, allowing the design to settle naturally into a range of interiors.

Design Details

• Soft arched outline
• Warm gold-tone frame finish
• Clean, balanced proportions
• Versatile decorative character

Styling Notes

Place it above a console, beside a bedroom dresser, or in a living room that calls for a subtle focal point.

The Freya Finish

A calm statement piece that adds warmth, shape, and visual balance to everyday spaces.

Explore more designs from FreyaFurnitureUSA on Etsy.`,
        instructions: `
Return plain text only. Do not use Markdown or HTML.

Use this exact section order:

Welcome to Freya Furniture

<A concise two-paragraph product introduction>

Design Details

• <4–6 short factual details using the • symbol>

Styling Notes

<One short paragraph with tasteful room and interior suggestions>

The Freya Finish

<One calm closing paragraph focused on atmosphere and design>

Explore more designs from FreyaFurnitureUSA on Etsy.

Leave one blank line between sections. Do not use emojis. Keep the result clean and restrained.
        `,
    },
    {
        id: "editorial",
        name: "Warm Editorial",
        shortName: "Editorial",
        publicDescription:
            "A more atmospheric opening followed by a compact edit of the product's strongest details.",
        sections: ["Opening Story", "The Design Edit", "At Home", "Closing"],
        preview: `✨ Welcome to Freya Furniture!

There is something quietly inviting about an arch. With its softened outline and warm gold-tone finish, this mirror brings an architectural note to the room while keeping the overall feeling light and composed.

Its presence is decorative yet easygoing—the kind of piece that helps a wall feel complete.

THE DESIGN EDIT

— A graceful arched silhouette
— A warm, light-catching frame finish
— A clean profile suited to considered interiors
— An adaptable shape for layered home styling

AT HOME

Let it anchor an entryway vignette, add shape above a bedroom dresser, or introduce a warm focal point to the living room.

A FREYA NOTE

Beautiful rooms often begin with one well-chosen shape.

Explore more designs from FreyaFurnitureUSA on Etsy.`,
        instructions: `
Return plain text only. Do not use Markdown or HTML.

Use this exact section order:

✨ Welcome to Freya Furniture!

<An atmospheric but truthful product introduction in two short paragraphs>

THE DESIGN EDIT

— <4–5 concise factual highlights using the — symbol>

AT HOME

<A short editorial styling paragraph grounded in the product's real design>

A FREYA NOTE

<A warm, understated closing sentence>

Explore more designs from FreyaFurnitureUSA on Etsy.

Leave one blank line between sections. Only the welcome heading may use an emoji.
        `,
    },
    {
        id: "quick-scan",
        name: "Easy to Scan",
        shortName: "Quick Scan",
        publicDescription:
            "A concise mobile-friendly format that puts the most useful product facts first.",
        sections: ["At a Glance", "Details", "Works Beautifully In", "Closing"],
        preview: `✨ Welcome to Freya Furniture!

A softly arched mirror with a warm gold-tone finish and a clean, versatile profile. Designed to bring shape and light to a thoughtfully styled room.

🌟 At a Glance

✔ Arched silhouette
✔ Warm gold-tone finish
✔ Clean contemporary profile
✔ Easy to style across multiple rooms

🏡 Works Beautifully In

Entryways, bedrooms, living rooms, and interiors with modern, contemporary, or softly traditional character.

💛 The Freya Difference

A simple way to add warmth, balance, and a graceful focal point to the wall.

👉 Explore more designs from FreyaFurnitureUSA on Etsy.`,
        instructions: `
Return plain text only. Do not use Markdown or HTML.

Keep the full description concise and easy to scan on a phone.

Use this exact section order:

✨ Welcome to Freya Furniture!

<A direct 2–3 sentence product introduction>

🌟 At a Glance

✔ <4–6 concise factual points>

🏡 Works Beautifully In

<One short styling paragraph>

💛 The Freya Difference

<One short design-focused closing paragraph>

👉 Explore more designs from FreyaFurnitureUSA on Etsy.

Leave one blank line between sections. Do not add filler simply to make the description longer.
        `,
    },
];

function getDescriptionTemplate(templateId = "signature") {
    const template = DESCRIPTION_TEMPLATES.find(
        (item) => item.id === templateId
    );

    if (!template) {
        throw new Error(`Unknown description template: ${templateId}`);
    }

    return template;
}

function getDescriptionTemplates() {
    return DESCRIPTION_TEMPLATES.map(
        ({ instructions, ...publicTemplate }) => publicTemplate
    );
}

// 商品事实准确性和禁止推测的规则。
const FACT_RULES = `
Accuracy is mandatory.

Preserve all factual information from the original Etsy listing.

Never invent or assume:
- dimensions
- materials
- frame construction
- hardware
- mounting orientation
- installation methods
- certifications
- warranties
- country of origin
- shipping speed
- delivery guarantees
- product durability
- waterproof or moisture resistance
- safety claims

You may make tasteful interior styling suggestions when they are clearly presented as styling ideas rather than product facts.

For example:
Allowed:
"Style it above a console or in an entryway."

Not allowed unless stated in the original listing:
"Includes mounting hardware for horizontal and vertical installation."

If a fact is uncertain, omit it.
`;

// 文案润色方式、语言节奏和销售语气规则。
const WRITING_RULES = `
Do not simply paraphrase sentence by sentence.

Upgrade the description into polished premium home décor copy while remaining completely truthful.

Create a natural rhythm:
- Mix shorter and longer sentences.
- Avoid making every feature bullet the same length.
- Avoid repeating the product name too often.
- Avoid keyword stuffing.
- Use natural American English.

The reader should be able to imagine the product in a beautiful home.

Keep the sales tone subtle.
Do not use fake urgency such as:
- Buy now
- Limited time
- Hurry
- Don't miss out

A gentle lifestyle-oriented call to action is acceptable.

Every listing should feel part of the Freya Furniture brand while still sounding unique to that specific product.
`;

/**
 * 使用 OpenAI Responses API 改写 Etsy 商品描述。
 *
 * 模型只负责改善英文描述的清晰度、可读性和购买吸引力；提示词明确要求
 * 保留原始事实，避免编造尺寸、材质、物流承诺或产品功能。
 *
 * @param {Object} listing Etsy API 返回的商品对象。
 * @param {string} listing.description 当前商品描述，不能为空。
 * @param {string} [listing.title] 商品标题，用于帮助模型理解商品上下文。
 * @param {string[]} [listing.tags] 商品标签，用于补充商品上下文。
 * @param {Object} [options] 可选的改写选项。
 * @param {string} [options.templateId="signature"] 描述版式 ID。
 * @returns {Promise<string>} 去除首尾空白后的新版英文商品描述。
 * @throws {Error} 商品描述缺失，或者 OpenAI 没有返回有效文本时抛出。
 */
async function rewriteListingDescription(listing, options = {}) {
    // 没有原始描述时无法可靠改写，因此在调用 OpenAI 前直接终止。
    if (!listing?.description) {
        throw new Error("Listing description is missing.");
    }

    // Responses API 将固定的改写规则放在 instructions 中，
    // 将当前商品的动态内容放在 input 中。
    const template = getDescriptionTemplate(
        options.templateId || "signature"
    );

    const response = await openai.responses.create({
        model: "gpt-5.6",

        instructions: [
            BRAND_VOICE,
            template.instructions,
            FACT_RULES,
            WRITING_RULES,
        ].join("\n\n"),

        input: `
Product title:
${listing.title}

Current description:
${listing.description}

Tags:
${listing.tags?.join(", ") || "No tags provided"}

Rewrite this listing according to the Freya Furniture brand system above.

Description template for this rewrite:
${template.name}

Important:
Identify the strongest real design characteristics of this specific product and make those the focus of the description.

Do not force generic features into the listing if they are not supported by the source information.
        `.trim(),
    });

    // output_text 是 SDK 汇总后的文本输出；trim() 用于清理首尾空白。
    const rewrittenDescription =
        response.output_text?.trim();

    // 防止空结果继续进入 Etsy 商品更新流程，覆盖原来的有效描述。
    if (!rewrittenDescription) {
        throw new Error(
            "OpenAI returned an empty description."
        );
    }

    return rewrittenDescription;
}

function parseJsonObject(value) {
    const source = String(value || "").trim();
    const cleaned = source
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
        throw new Error("OpenAI returned social copy in an invalid format.");
    }
}

async function generateSocialCopy(listing, brief = "") {
    if (!listing?.title) throw new Error("Listing title is missing.");
    const response = await openai.responses.create({
        model: "gpt-5.6",
        instructions: [
            BRAND_VOICE,
            FACT_RULES,
            `You write channel-specific organic social copy for Freya Furniture.
Return one valid JSON object only, with exactly these string keys:
instagramCaption, facebookText.

Instagram: an engaging caption with a strong first line, a short lifestyle story, a gentle CTA, and 4-7 relevant hashtags. Maximum 2200 characters.
Facebook: conversational opening hook plus useful product context and a gentle CTA. Do not invent a separate headline. Maximum 5000 characters.

Never invent discounts, scarcity, materials, dimensions, installation details, or shipping claims.`,
        ].join("\n\n"),
        input: `Product title:\n${listing.title}\n\nCurrent description:\n${listing.description || "Not provided"}\n\nTags:\n${listing.tags?.join(", ") || "Not provided"}\n\nCreative direction from the seller:\n${String(brief || "Warm, inviting, design-focused organic promotion.").slice(0, 1200)}`,
    });
    const copy = parseJsonObject(response.output_text);
    const required = ["instagramCaption", "facebookText"];
    if (required.some((key) => !String(copy?.[key] || "").trim())) {
        throw new Error("OpenAI returned incomplete social copy.");
    }
    return {
        instagramCaption: String(copy.instagramCaption).trim().slice(0, 2200),
        facebookText: String(copy.facebookText).trim().slice(0, 5000),
    };
}

async function generateSocialQueueCopy(listing, items = [], brief = "") {
    if (!listing?.title) throw new Error("Listing title is missing.");
    if (!Array.isArray(items) || !items.length || items.length > 14) {
        throw new Error("Choose between 1 and 14 weekly images.");
    }
    const normalizedItems = items.map((item, index) => ({
        day: index + 1,
        label: String(item?.label || `Image ${index + 1}`).slice(0, 180),
    }));
    const response = await openai.responses.create({
        model: "gpt-5.6",
        instructions: [
            BRAND_VOICE,
            FACT_RULES,
            `Create a varied weekly organic social campaign for one Freya Furniture product.
Return one valid JSON object only with a "posts" array. Each item must contain exactly two strings: instagramCaption and facebookText.
Return exactly one item for every supplied day, in the same order.

Each day must feel genuinely different:
- use a different opening hook and sentence structure;
- rotate the editorial angle between room styling, shape, atmosphere, practical placement, design detail, and discovery;
- do not repeat the same CTA;
- vary relevant Instagram hashtags while keeping them truthful;
- never claim that the image shows something merely because its filename suggests it;
- avoid fake urgency, discounts, and unsupported product claims.

Instagram captions must be under 2200 characters and include 4-7 hashtags.
Facebook text must be under 5000 characters and should not use a separate headline field.`,
        ].join("\n\n"),
        input: `Product title:\n${listing.title}\n\nCurrent description:\n${listing.description || "Not provided"}\n\nTags:\n${listing.tags?.join(", ") || "Not provided"}\n\nSeller direction:\n${String(brief || "Warm, varied, design-focused weekly promotion.").slice(0, 1200)}\n\nWeekly images:\n${JSON.stringify(normalizedItems)}`,
    });
    const parsed = parseJsonObject(response.output_text);
    if (!Array.isArray(parsed?.posts) || parsed.posts.length !== normalizedItems.length) {
        throw new Error("OpenAI returned an incomplete weekly campaign.");
    }
    return parsed.posts.map((post) => {
        if (!String(post?.instagramCaption || "").trim() || !String(post?.facebookText || "").trim()) {
            throw new Error("OpenAI returned incomplete weekly copy.");
        }
        return {
            instagramCaption: String(post.instagramCaption).trim().slice(0, 2200),
            facebookText: String(post.facebookText).trim().slice(0, 5000),
        };
    });
}

async function downloadEtsyImage(url, index) {
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("etsystatic.com")) {
        throw new Error("Only official Etsy listing images can be used as product references.");
    }
    const response = await fetch(parsed, {
        dispatcher: openaiOptions.fetchOptions?.dispatcher,
        headers: { "User-Agent": "FreyaAuto/1.0" },
    });
    if (!response.ok) throw new Error(`Etsy image ${index + 1} could not be downloaded.`);
    const mimeType = String(response.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        throw new Error(`Etsy image ${index + 1} has an unsupported format.`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
        throw new Error(`Etsy image ${index + 1} is missing or too large.`);
    }
    return { buffer, mimeType, filename: `etsy-product-${index + 1}.${mimeType.split("/")[1].replace("jpeg", "jpg")}` };
}

async function generateSocialImage({ productImageUrls, backgroundImage, prompt, size = "1024x1024" }) {
    const urls = Array.isArray(productImageUrls) ? productImageUrls.slice(0, 4) : [];
    if (!urls.length) throw new Error("Select at least one Etsy product image.");
    const scenePrompt = String(prompt || "").trim();
    if (scenePrompt.length < 8) throw new Error("Describe the social image you want to create.");
    const allowedSizes = new Set(["1024x1024", "1024x1536", "1536x1024"]);
    if (!allowedSizes.has(size)) throw new Error("Choose a supported social image format.");

    // Download official Etsy assets ourselves and send them as data URLs.
    // OpenAI's remote image fetch can time out on etsystatic.com even when the
    // Freya Auto server can retrieve the same file immediately.
    const productSources = await Promise.all(urls.map(downloadEtsyImage));
    const backgroundIndex = backgroundImage ? urls.length + 1 : null;
    const content = [
        {
            type: "input_text",
            text: `Use case: ads-marketing
Asset type: organic Instagram and Facebook product image
Primary request: ${scenePrompt}
Input images: Images 1-${urls.length} are authoritative product references for the same mirror.${backgroundIndex ? ` Image ${backgroundIndex} is a background/scene reference.` : ""}
Subject: reproduce the exact Freya Furniture mirror shown in the Etsy product references.
Composition: create one polished social-media-ready lifestyle photograph with a clear focal point and natural interior scale.
Product invariants: preserve the mirror silhouette, frame geometry, frame color, visible material character, proportions, and edge details. Do not redesign, duplicate, stretch, crop through, or add ornament to the mirror.
Scene rule: ${backgroundImage ? "Use the background reference for the room language and composition, but integrate the exact mirror naturally with matched perspective, shadows, reflections, and lighting." : "Create a believable interior scene matching the seller's direction."}
Constraints: photorealistic interior photography; truthful product representation; no people; no logos; no watermark; no invented promotional badge; no text unless the seller explicitly requested exact text in the primary request.`,
        },
        ...productSources.map((source) => ({
            type: "input_image",
            image_url: `data:${source.mimeType};base64,${source.buffer.toString("base64")}`,
        })),
    ];
    if (backgroundImage) {
        content.push({
            type: "input_image",
            image_url: `data:${backgroundImage.mimeType};base64,${backgroundImage.buffer.toString("base64")}`,
        });
    }

    let response = await openai.responses.create({
        model: process.env.OPENAI_SOCIAL_IMAGE_MODEL || "gpt-5.6",
        input: [{ role: "user", content }],
        tools: [{
            type: "image_generation",
            size,
            quality: "medium",
            output_format: "jpeg",
            output_compression: 92,
            background: "opaque",
        }],
        tool_choice: { type: "image_generation" },
        background: true,
    });
    const deadline = Date.now() + 10 * 60 * 1000;
    while (["queued", "in_progress"].includes(response.status)) {
        if (Date.now() >= deadline) {
            throw new Error("OpenAI image generation is still running after 10 minutes. Try again later.");
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        response = await openai.responses.retrieve(response.id);
    }
    if (response.status !== "completed") {
        const detail = response.error?.message || response.incomplete_details?.reason;
        throw new Error(detail || `OpenAI image generation ended with status: ${response.status}.`);
    }
    const imageCall = response.output?.find((item) => item.type === "image_generation_call");
    const encoded = imageCall?.result;
    if (!encoded) throw new Error("OpenAI did not return a generated image.");
    return { buffer: Buffer.from(encoded, "base64"), mimeType: "image/jpeg" };
}

// 只公开业务层需要调用的方法，隐藏 SDK 客户端和代理配置细节。
module.exports = {
    generateSocialCopy,
    generateSocialQueueCopy,
    generateSocialImage,
    rewriteListingDescription,
    getDescriptionTemplates,
    getDescriptionTemplate,
};
