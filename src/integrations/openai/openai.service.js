const OpenAI = require("openai");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function rewriteListingDescription(listing) {
    if (!listing?.description) {
        throw new Error("Listing description is missing.");
    }

    const response = await openai.responses.create({
        model: "gpt-5.6",
        instructions: `
You are an expert Etsy copywriter.

Rewrite the product description to improve clarity, readability,
professionalism, and purchase appeal.

Rules:
- Preserve all factual product information.
- Do not invent dimensions, materials, shipping promises, warranties, or features.
- Do not make misleading claims.
- Keep the shop name and important product information.
- Use natural American English.
- Avoid keyword stuffing.
- Return only the rewritten description.
        `.trim(),

        input: `
Product title:
${listing.title}

Current description:
${listing.description}

Tags:
${listing.tags?.join(", ") || "No tags provided"}
        `.trim(),
    });

    const rewrittenDescription = response.output_text?.trim();

    if (!rewrittenDescription) {
        throw new Error("OpenAI returned an empty description.");
    }

    return rewrittenDescription;
}

module.exports = {
    rewriteListingDescription,
};
