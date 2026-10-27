const fs = require("fs");
const path = require("path");

const DATA_PATH = process.env.PERFORMANCE_TRACKING_FILE
    ? path.resolve(process.env.PERFORMANCE_TRACKING_FILE)
    : path.join(__dirname, "..", "config", "performance-tracking.json");

const DEFAULT_DATA = {
    version: 2,
    updates: [],
    tracking: [],
    // 只保存调度游标，不保存 Etsy 商品本身。这样服务器重启也不会把轮换
    // 从第一件商品重新开始。
    snapshotSchedule: {
        mode: "daily-batch",
        batchSize: 3,
        timezone: "America/Los_Angeles",
        nextListingIndex: 0,
        lastRunKey: null,
        lastRunAt: null,
        lastBatchListingIds: [],
    },
};

function readData() {
    try {
        const stored = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
        return {
            ...DEFAULT_DATA,
            ...stored,
            updates: Array.isArray(stored?.updates) ? stored.updates : [],
            tracking: Array.isArray(stored?.tracking) ? stored.tracking : [],
            snapshotSchedule: {
                ...DEFAULT_DATA.snapshotSchedule,
                ...(stored?.snapshotSchedule || {}),
                // This is a product decision, not user input: always keep the
                // batch small enough that analytics does not refresh all listings.
                mode: "daily-batch",
                batchSize: 3,
            },
        };
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Failed to read performance tracking data:", error.message);
        }
        return { ...DEFAULT_DATA, updates: [], tracking: [] };
    }
}

function writeData(data) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    const temporaryPath = `${DATA_PATH}.tmp`;
    fs.writeFileSync(
        temporaryPath,
        `${JSON.stringify(data, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 }
    );
    fs.renameSync(temporaryPath, DATA_PATH);
}

function normalizedViews(value) {
    const views = Number(value);
    return Number.isFinite(views) && views >= 0 ? views : null;
}

function normalizedCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : null;
}

function recordUpdate({
    listingId,
    title,
    viewsBefore,
    favoritesBefore,
    source = "manual",
    updatedBy = "unknown",
    templateId = null,
    runId = null,
    experiment = null,
    updatedAt = new Date().toISOString(),
}) {
    const data = readData();
    const id = `${listingId}-${Date.parse(updatedAt) || Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    const baselineViews = normalizedViews(viewsBefore);
    const baselineFavorites = normalizedCount(favoritesBefore);
    const update = {
        id,
        listingId: Number(listingId),
        title: title || `Listing #${listingId}`,
        updatedAt,
        source,
        updatedBy,
        templateId,
        runId,
        baselineViews,
        baselineFavorites,
        experiment,
    };

    const trackingRecord = {
        listingId: Number(listingId),
        title: update.title,
        updatedAt,
        source,
        updatedBy,
        templateId,
        baselineViews,
        latestViews: baselineViews,
        baselineFavorites,
        latestFavorites: baselineFavorites,
        experiment,
        lastCheckedAt: updatedAt,
        snapshots:
            baselineViews === null
                ? []
                : [{ at: updatedAt, views: baselineViews }],
    };

    const next = {
        ...data,
        updates: [update, ...data.updates].slice(0, 250),
        tracking: [
            trackingRecord,
            ...data.tracking.filter(
                (item) => String(item.listingId) !== String(listingId)
            ),
        ].slice(0, 100),
    };
    writeData(next);
    return { update, trackingRecord };
}

function syncListings(listings) {
    if (!Array.isArray(listings) || listings.length === 0) return readData();

    const data = readData();
    const now = new Date().toISOString();
    let changed = false;
    const tracking = data.tracking.map((record) => {
        const listing = listings.find(
            (item) => String(item.listing_id) === String(record.listingId)
        );
        const views = normalizedViews(listing?.views);
        const favorites = normalizedCount(listing?.num_favorers);
        if (!listing || views === null) return record;

        const snapshots = Array.isArray(record.snapshots)
            ? [...record.snapshots]
            : [];
        const lastSnapshot = snapshots.at(-1);
        const isNewDay = lastSnapshot
            ? lastSnapshot.at.slice(0, 10) !== now.slice(0, 10)
            : true;
        if (!lastSnapshot || lastSnapshot.views !== views || isNewDay) {
            snapshots.push({ at: now, views });
            changed = true;
        }

        if (
            record.latestViews !== views ||
            (favorites !== null && record.latestFavorites !== favorites) ||
            record.title !== (listing.title || record.title)
        ) {
            changed = true;
        }

        return {
            ...record,
            title: listing.title || record.title,
            latestViews: views,
            latestFavorites: favorites ?? record.latestFavorites ?? null,
            lastCheckedAt: now,
            snapshots: snapshots.slice(-90),
        };
    });

    const next = { ...data, tracking };
    if (changed) writeData(next);
    return next;
}

function getZonedDayKey(date, timezone) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => part.value)
        .join("-");
}

function isNextDailyBatchDue(date = new Date()) {
    const schedule = readData().snapshotSchedule;
    return schedule.lastRunKey !== getZonedDayKey(date, schedule.timezone);
}

/**
 * Records exactly the next three tracked listings, then advances a persisted
 * cursor. A repeat call on the same shop day is intentionally a no-op, so a
 * page reload can never accidentally consume another batch.
 */
function syncNextDailyBatch(listings, date = new Date()) {
    const data = readData();
    const schedule = data.snapshotSchedule;
    const runKey = getZonedDayKey(date, schedule.timezone);

    if (schedule.lastRunKey === runKey) {
        return { ...data, skipped: true, batch: [] };
    }

    const liveById = new Map(
        (Array.isArray(listings) ? listings : []).map((listing) => [
            String(listing.listing_id),
            listing,
        ])
    );
    const eligible = data.tracking.filter((record) => {
        const listing = liveById.get(String(record.listingId));
        return listing && normalizedViews(listing.views) !== null;
    });

    if (!eligible.length) {
        return { ...data, skipped: true, batch: [] };
    }

    const start = Number(schedule.nextListingIndex || 0) % eligible.length;
    const count = Math.min(Number(schedule.batchSize) || 3, eligible.length);
    const batchRecords = Array.from(
        { length: count },
        (_, offset) => eligible[(start + offset) % eligible.length]
    );
    const batchListings = batchRecords.map((record) =>
        liveById.get(String(record.listingId))
    );

    // Reuse the normal snapshot merge, but only give it today's chosen three.
    const synced = syncListings(batchListings);
    const nextSchedule = {
        ...synced.snapshotSchedule,
        nextListingIndex: (start + count) % eligible.length,
        lastRunKey: runKey,
        lastRunAt: date.toISOString(),
        lastBatchListingIds: batchRecords.map((record) => record.listingId),
    };
    const next = { ...synced, snapshotSchedule: nextSchedule };
    writeData(next);
    return { ...next, skipped: false, batch: batchRecords };
}

function importLegacy({ updates = [], tracking = [], importedBy = "unknown" }) {
    const data = readData();
    const knownUpdateIds = new Set(data.updates.map((item) => item.id));
    const nextUpdates = [...data.updates];

    for (const item of updates.slice(0, 100)) {
        if (!item?.id || knownUpdateIds.has(String(item.id))) continue;
        nextUpdates.push({
            id: String(item.id),
            listingId: Number(item.listingId),
            title: String(item.title || `Listing #${item.listingId}`),
            updatedAt: item.updatedAt || new Date().toISOString(),
            source: "legacy-browser",
            updatedBy: importedBy,
            templateId: null,
            runId: null,
            baselineViews: normalizedViews(item.baselineViews),
            baselineFavorites: normalizedCount(item.baselineFavorites),
            experiment: item.experiment || null,
        });
        knownUpdateIds.add(String(item.id));
    }

    const nextTracking = [...data.tracking];
    for (const item of tracking.slice(0, 100)) {
        const listingId = Number(item?.listingId);
        if (!Number.isInteger(listingId) || listingId <= 0) continue;
        if (nextTracking.some((record) => Number(record.listingId) === listingId)) {
            continue;
        }
        const baselineViews = normalizedViews(item.baselineViews);
        const latestViews = normalizedViews(item.latestViews);
        const baselineFavorites = normalizedCount(item.baselineFavorites);
        const latestFavorites = normalizedCount(item.latestFavorites);
        nextTracking.push({
            listingId,
            title: String(item.title || `Listing #${listingId}`),
            updatedAt: item.updatedAt || new Date().toISOString(),
            source: "legacy-browser",
            updatedBy: importedBy,
            templateId: null,
            baselineViews,
            latestViews: latestViews ?? baselineViews,
            baselineFavorites,
            latestFavorites: latestFavorites ?? baselineFavorites,
            experiment: item.experiment || null,
            lastCheckedAt: item.lastCheckedAt || item.updatedAt || new Date().toISOString(),
            snapshots: Array.isArray(item.snapshots)
                ? item.snapshots
                      .map((snapshot) => ({
                          at: snapshot.at,
                          views: normalizedViews(snapshot.views),
                      }))
                      .filter((snapshot) => snapshot.at && snapshot.views !== null)
                      .slice(-90)
                : [],
        });
    }

    const next = {
        ...data,
        updates: nextUpdates
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .slice(0, 250),
        tracking: nextTracking.slice(0, 100),
    };
    writeData(next);
    return next;
}

function getPublicData() {
    const data = readData();
    return {
        updates: data.updates,
        records: data.tracking,
        snapshotSchedule: data.snapshotSchedule,
    };
}

module.exports = {
    getPublicData,
    importLegacy,
    recordUpdate,
    syncListings,
    syncNextDailyBatch,
    isNextDailyBatchDue,
};
