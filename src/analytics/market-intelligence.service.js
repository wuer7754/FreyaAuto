const etsyService = require("../integrations/etsy/etsy.service");

function moneyValue(money) {
    if (!money || !Number(money.divisor)) return null;
    return Number(money.amount) / Number(money.divisor);
}

function normalizeMarketResults(searchResults, enrichedResults, ownShopId) {
    const enrichedById = new Map(
        (enrichedResults || []).map((listing) => [String(listing.listing_id), listing])
    );

    return (searchResults || []).map((listing, index) => {
        const enriched = enrichedById.get(String(listing.listing_id)) || {};
        const merged = { ...listing, ...enriched };
        const buyerPrice = merged.buyer_price || {};
        return {
            listingId: Number(merged.listing_id),
            shopId: Number(merged.shop_id),
            shopName: merged.shop?.shop_name || `Shop #${merged.shop_id}`,
            title: merged.title || `Listing #${merged.listing_id}`,
            url: merged.url || "",
            image:
                merged.images?.[0]?.url_570xN ||
                merged.images?.[0]?.url_170x135 ||
                "",
            tags: Array.isArray(merged.tags) ? merged.tags.filter(Boolean) : [],
            rank: index + 1,
            isOwnShop: String(merged.shop_id) === String(ownShopId),
            price: moneyValue(buyerPrice.base_price || merged.price),
            originalPrice: moneyValue(buyerPrice.original_price),
            discountedPrice: moneyValue(buyerPrice.discounted_price),
            currency:
                buyerPrice.discounted_price?.currency_code ||
                buyerPrice.base_price?.currency_code ||
                merged.price?.currency_code ||
                "USD",
            hasDiscount: buyerPrice.has_discount === true,
            discountPercentage: Number(buyerPrice.discount_percentage) || 0,
            discountStart: buyerPrice.discount_start_epoch || null,
            discountEnd: buyerPrice.discount_end_epoch || null,
        };
    });
}

function buildKeywordSignals(listings) {
    const signals = new Map();
    for (const listing of listings.filter((item) => !item.isOwnShop)) {
        for (const rawTag of listing.tags) {
            const tag = String(rawTag).trim().toLowerCase();
            if (!tag) continue;
            const current = signals.get(tag) || {
                keyword: tag,
                listingCount: 0,
                discountedCount: 0,
                bestRank: listing.rank,
                sampleTitles: [],
            };
            current.listingCount += 1;
            current.discountedCount += listing.hasDiscount ? 1 : 0;
            current.bestRank = Math.min(current.bestRank, listing.rank);
            if (current.sampleTitles.length < 2) current.sampleTitles.push(listing.title);
            signals.set(tag, current);
        }
    }

    return [...signals.values()]
        .sort(
            (a, b) =>
                b.listingCount - a.listingCount ||
                a.bestRank - b.bestRank ||
                a.keyword.localeCompare(b.keyword)
        )
        .slice(0, 40);
}

async function researchMarket(keywords, ownShopId, limit = 24) {
    const searchPayload = await etsyService.searchActiveListings(keywords, limit);
    const searchResults = Array.isArray(searchPayload)
        ? searchPayload
        : searchPayload?.results || [];
    let enrichedResults = [];

    try {
        const enriched = await etsyService.getListingsByIds(
            searchResults.map((listing) => listing.listing_id)
        );
        enrichedResults = Array.isArray(enriched) ? enriched : enriched?.results || [];
    } catch (error) {
        // Keyword research remains useful if Etsy temporarily withholds buyer-price data.
        console.warn("Market price enrichment failed:", error.response?.data || error.message);
    }

    const listings = normalizeMarketResults(searchResults, enrichedResults, ownShopId);
    const competitorListings = listings.filter((listing) => !listing.isOwnShop);
    const discountedListings = competitorListings.filter((listing) => listing.hasDiscount);

    return {
        query: String(keywords).trim(),
        sampledAt: new Date().toISOString(),
        sampleSize: competitorListings.length,
        listings,
        keywordSignals: buildKeywordSignals(listings),
        promotionSummary: {
            discountedCount: discountedListings.length,
            discountedShare: competitorListings.length
                ? Math.round((discountedListings.length / competitorListings.length) * 100)
                : 0,
            averageDiscount: discountedListings.length
                ? Math.round(
                      discountedListings.reduce(
                          (sum, listing) => sum + listing.discountPercentage,
                          0
                      ) / discountedListings.length
                  )
                : 0,
        },
    };
}

module.exports = {
    buildKeywordSignals,
    normalizeMarketResults,
    researchMarket,
};
