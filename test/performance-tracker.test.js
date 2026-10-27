const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "freya-performance-test-")
);
process.env.PERFORMANCE_TRACKING_FILE = path.join(
    temporaryDirectory,
    "performance.json"
);

const tracker = require("../src/analytics/performance-tracker.service");

after(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("manual update creates persistent history and a view baseline", () => {
    tracker.recordUpdate({
        listingId: 123,
        title: "Arched Mirror",
        viewsBefore: 100,
        source: "manual",
        updatedBy: "admin",
        updatedAt: "2026-08-20T10:00:00.000Z",
    });

    const data = tracker.getPublicData();
    assert.equal(data.updates.length, 1);
    assert.equal(data.updates[0].updatedBy, "admin");
    assert.equal(data.records[0].baselineViews, 100);
});

test("listing refresh persists a new cumulative view snapshot", () => {
    tracker.syncListings([
        { listing_id: 123, title: "Arched Mirror", views: 106 },
    ]);

    const record = tracker.getPublicData().records[0];
    assert.equal(record.latestViews, 106);
    assert.equal(record.snapshots.at(-1).views, 106);
});

test("weekly rotation creates shared history and resets latest baseline", () => {
    tracker.recordUpdate({
        listingId: 123,
        title: "Arched Mirror",
        viewsBefore: 106,
        source: "weekly-rotation",
        updatedBy: "scheduler",
        templateId: "minimal",
        runId: "weekly-run-1",
        updatedAt: "2026-08-24T13:00:00.000Z",
    });

    const data = tracker.getPublicData();
    assert.equal(data.updates.length, 2);
    assert.equal(data.updates[0].source, "weekly-rotation");
    assert.equal(data.records.length, 1);
    assert.equal(data.records[0].baselineViews, 106);
    assert.equal(data.records[0].templateId, "minimal");
});

test("daily batch records three listings and advances to the next three tomorrow", () => {
    const ids = [201, 202, 203, 204, 205, 206];
    ids.forEach((listingId) => {
        tracker.recordUpdate({
            listingId,
            title: `Mirror ${listingId}`,
            viewsBefore: 10,
            updatedAt: "2026-09-01T00:00:00.000Z",
        });
    });
    const listings = ids.map((listingId, index) => ({
        listing_id: listingId,
        title: `Mirror ${listingId}`,
        views: 20 + index,
    }));

    const first = tracker.syncNextDailyBatch(
        listings,
        new Date("2026-09-02T19:00:00.000Z")
    );
    assert.deepEqual(first.batch.map((record) => record.listingId), [206, 205, 204]);

    const repeat = tracker.syncNextDailyBatch(
        listings,
        new Date("2026-09-02T21:00:00.000Z")
    );
    assert.equal(repeat.skipped, true);

    const second = tracker.syncNextDailyBatch(
        listings,
        new Date("2026-09-03T19:00:00.000Z")
    );
    assert.deepEqual(second.batch.map((record) => record.listingId), [203, 202, 201]);
});
