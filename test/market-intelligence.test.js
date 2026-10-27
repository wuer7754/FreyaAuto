const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    buildKeywordSignals,
    normalizeMarketResults,
} = require("../src/analytics/market-intelligence.service");

test("market research excludes the connected shop from competitor keyword counts", () => {
    const listings = [
        { rank: 1, title: "Own mirror", tags: ["arched mirror"], isOwnShop: true },
        { rank: 2, title: "A", tags: ["arched mirror", "floor mirror"], isOwnShop: false, hasDiscount: true },
        { rank: 3, title: "B", tags: ["Arched Mirror", "gold mirror"], isOwnShop: false, hasDiscount: false },
    ];

    const signals = buildKeywordSignals(listings);
    assert.equal(signals[0].keyword, "arched mirror");
    assert.equal(signals[0].listingCount, 2);
    assert.equal(signals[0].discountedCount, 1);
    assert.equal(signals[0].bestRank, 2);
});

test("market listing normalization preserves public discount evidence", () => {
    const normalized = normalizeMarketResults(
        [{ listing_id: 10, shop_id: 20, title: "Mirror", tags: ["wall mirror"] }],
        [{
            listing_id: 10,
            shop_id: 20,
            shop: { shop_name: "Mirror Shop" },
            buyer_price: {
                has_discount: true,
                discount_percentage: 15,
                original_price: { amount: 10000, divisor: 100, currency_code: "USD" },
                discounted_price: { amount: 8500, divisor: 100, currency_code: "USD" },
            },
        }],
        99
    );

    assert.equal(normalized[0].hasDiscount, true);
    assert.equal(normalized[0].discountedPrice, 85);
    assert.equal(normalized[0].shopName, "Mirror Shop");
});
