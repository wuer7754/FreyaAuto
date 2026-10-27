function moneyValue(money) {
    const amount = Number(money?.amount);
    const divisor = Number(money?.divisor || 100);
    return Number.isFinite(amount) && Number.isFinite(divisor) && divisor > 0
        ? amount / divisor
        : 0;
}

function roundCurrency(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function buildShopDashboard({ shop = {}, listings = [], receipts = [], days = 30 }) {
    const completedReceipts = receipts.filter(
        (receipt) => receipt && receipt.was_canceled !== true
    );
    const orders = completedReceipts.length;
    const revenue = roundCurrency(completedReceipts.reduce(
        (sum, receipt) => sum + moneyValue(receipt.subtotal),
        0
    ));
    const unitsSold = completedReceipts.reduce(
        (sum, receipt) =>
            sum +
            (receipt.transactions || []).reduce(
                (quantity, transaction) =>
                    quantity + (Number(transaction.quantity) || 0),
                0
            ),
        0
    );
    const listingViews = listings.reduce(
        (sum, listing) => sum + (Number(listing.views) || 0),
        0
    );
    const listingFavorites = listings.reduce(
        (sum, listing) => sum + (Number(listing.num_favorers) || 0),
        0
    );

    return {
        generatedAt: new Date().toISOString(),
        periodDays: days,
        shop: {
            id: Number(shop.shop_id) || null,
            name: shop.shop_name || "Etsy shop",
            title: shop.title || shop.shop_name || "Etsy shop",
            currency: shop.currency_code || "USD",
            activeListings:
                Number(shop.listing_active_count) || listings.length,
            followers: Number(shop.num_favorers) || 0,
            reviewCount: Number(shop.review_count) || 0,
            reviewAverage: Number(shop.review_average) || null,
        },
        commerce: {
            orders,
            unitsSold,
            revenue,
            averageOrderValue: orders ? roundCurrency(revenue / orders) : 0,
        },
        catalog: {
            listingsRead: listings.length,
            cumulativeViews: listingViews,
            cumulativeFavorites: listingFavorites,
            lifetimeFavoriteRate:
                listingViews > 0 ? listingFavorites / listingViews : null,
        },
        availability: {
            trafficSources: false,
            searchTerms: false,
            organicImpressions: false,
            reason:
                "Etsy does not expose private Shop Stats traffic and search analytics through Open API v3.",
        },
    };
}

module.exports = { buildShopDashboard, moneyValue };
