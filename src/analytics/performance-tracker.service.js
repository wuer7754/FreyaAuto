const fs = require("fs");
const path = require("path");

const DATA_PATH = process.env.PERFORMANCE_TRACKING_FILE
    ? path.resolve(process.env.PERFORMANCE_TRACKING_FILE)
    : path.join(__dirname, "..", "config", "performance-tracking.json");

const DEFAULT_DATA = {
    version: 1,
    updates: [],
    tracking: [],
};

function readData() {
    try {
        const stored = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
        return {
            ...DEFAULT_DATA,
            ...stored,
            updates: Array.isArray(stored?.updates) ? stored.updates : [],
            tracking: Array.isArray(stored?.tracking) ? stored.tracking : [],
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

function recordUpdate({
    listingId,
    title,
    viewsBefore,
    source = "manual",
    updatedBy = "unknown",
    templateId = null,
    runId = null,
    updatedAt = new Date().toISOString(),
}) {
    const data = readData();
    const id = `${listingId}-${Date.parse(updatedAt) || Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    const baselineViews = normalizedViews(viewsBefore);
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
            record.title !== (listing.title || record.title)
        ) {
            changed = true;
        }

        return {
            ...record,
            title: listing.title || record.title,
            latestViews: views,
            lastCheckedAt: now,
            snapshots: snapshots.slice(-90),
        };
    });

    const next = { ...data, tracking };
    if (changed) writeData(next);
    return next;
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
        nextTracking.push({
            listingId,
            title: String(item.title || `Listing #${listingId}`),
            updatedAt: item.updatedAt || new Date().toISOString(),
            source: "legacy-browser",
            updatedBy: importedBy,
            templateId: null,
            baselineViews,
            latestViews: latestViews ?? baselineViews,
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
    };
}

module.exports = {
    getPublicData,
    importLegacy,
    recordUpdate,
    syncListings,
};
