const test = require("node:test");
const assert = require("node:assert/strict");
const { buildShopDashboard } = require("../src/analytics/shop-dashboard.service");

test("shop dashboard separates merchandise revenue from tax and shipping", () => {
    const dashboard = buildShopDashboard({
        shop: {
            shop_id: 1,
            shop_name: "Freya",
            currency_code: "USD",
            listing_active_count: 29,
            num_favorers: 32,
            review_count: 23,
            review_average: 4.96,
        },
        listings: [
            { views: 100, num_favorers: 5 },
            { views: 50, num_favorers: 2 },
        ],
        receipts: [
            {
                subtotal: { amount: 17999, divisor: 100 },
                grandtotal: { amount: 19196, divisor: 100 },
                transactions: [{ quantity: 1 }],
            },
            {
                subtotal: { amount: 27485, divisor: 100 },
                transactions: [{ quantity: 2 }],
            },
        ],
        days: 30,
    });

    assert.equal(dashboard.commerce.orders, 2);
    assert.equal(dashboard.commerce.unitsSold, 3);
    assert.equal(dashboard.commerce.revenue, 454.84);
    assert.equal(dashboard.commerce.averageOrderValue, 227.42);
    assert.equal(dashboard.catalog.cumulativeViews, 150);
    assert.equal(dashboard.catalog.cumulativeFavorites, 7);
    assert.equal(dashboard.shop.activeListings, 29);
});
