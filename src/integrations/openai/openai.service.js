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

    // undici 的 ProxyAgent 必须与 undici.fetch 配套传给 OpenAI SDK，
    // dispatcher 才能将 SDK 发出的 HTTPS 请求转发到指定代理。
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

// 只公开业务层需要调用的方法，隐藏 SDK 客户端和代理配置细节。
module.exports = {
    rewriteListingDescription,
    getDescriptionTemplates,
    getDescriptionTemplate,
};
