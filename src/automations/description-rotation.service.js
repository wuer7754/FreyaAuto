const fs = require("fs");
const path = require("path");
const etsyService = require("../integrations/etsy/etsy.service");
const openaiService = require("../integrations/openai/openai.service");
const performanceTracker = require(
    "../analytics/performance-tracker.service"
);

const CONFIG_PATH = path.join(
    __dirname,
    "..",
    "config",
    "description-rotation.json"
);
const CHECK_INTERVAL_MS = 60 * 1000;
const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const DEFAULT_CONFIG = {
    enabled: false,
    listingIds: [],
    templateIds: ["signature", "minimal"],
    weekday: 1,
    hour: 9,
    minute: 0,
    timezone: "America/New_York",
    nextTemplateIndex: 0,
    lastRunKey: null,
    lastRunAt: null,
    updatedAt: null,
    history: [],
};

let rotationRunning = false;

function readConfig() {
    try {
        const stored = JSON.parse(
            fs.readFileSync(CONFIG_PATH, "utf8")
        );
        return { ...DEFAULT_CONFIG, ...stored };
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error(
                "Failed to read description rotation config:",
                error.message
            );
        }
        return { ...DEFAULT_CONFIG };
    }
}

function writeConfig(config) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const temporaryPath = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(
        temporaryPath,
        `${JSON.stringify(config, null, 2)}\n`,
        "utf8"
    );
    fs.renameSync(temporaryPath, CONFIG_PATH);
}

function validateTimezone(timezone) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
        return true;
    } catch {
        return false;
    }
}

function getZonedParts(date, timezone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "long",
    });
    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        weekday: WEEKDAYS.indexOf(parts.weekday),
    };
}

function getMostRecentRunKey(config, date = new Date()) {
    const parts = getZonedParts(date, config.timezone);
    let daysBack = (parts.weekday - config.weekday + 7) % 7;
    const currentMinutes = parts.hour * 60 + parts.minute;
    const scheduledMinutes = config.hour * 60 + config.minute;

    if (daysBack === 0 && currentMinutes < scheduledMinutes) {
        daysBack = 7;
    }

    const scheduledDate = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day)
    );
    scheduledDate.setUTCDate(scheduledDate.getUTCDate() - daysBack);

    return scheduledDate.toISOString().slice(0, 10);
}

function normalizeConfigInput(input, current) {
    const templates = openaiService.getDescriptionTemplates();
    const validTemplateIds = new Set(templates.map((item) => item.id));
    const listingIds = [
        ...new Set(
            (Array.isArray(input.listingIds) ? input.listingIds : [])
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0)
        ),
    ];
    const templateIds = [
        ...new Set(
            (Array.isArray(input.templateIds) ? input.templateIds : [])
                .filter((value) => validTemplateIds.has(value))
        ),
    ];
    const weekday = Number(input.weekday);
    const hour = Number(input.hour);
    const minute = Number(input.minute);
    const timezone = String(input.timezone || "");
    const enabled = input.enabled === true;

    if (listingIds.length > 25) {
        throw new Error("A maximum of 25 listings can be rotated at once.");
    }
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new Error("Weekday must be between 0 and 6.");
    }
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new Error("Hour must be between 0 and 23.");
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        throw new Error("Minute must be between 0 and 59.");
    }
    if (!validateTimezone(timezone)) {
        throw new Error("Timezone is not valid.");
    }
    if (enabled && listingIds.length === 0) {
        throw new Error("Select at least one listing before enabling rotation.");
    }
    if (enabled && templateIds.length < 2) {
        throw new Error("Select at least two templates before enabling rotation.");
    }

    const scheduleChanged =
        current.weekday !== weekday ||
        current.hour !== hour ||
        current.minute !== minute ||
        current.timezone !== timezone;
    const justEnabled = enabled && !current.enabled;
    const next = {
        ...current,
        enabled,
        listingIds,
        templateIds,
        weekday,
        hour,
        minute,
        timezone,
        nextTemplateIndex:
            current.nextTemplateIndex % Math.max(templateIds.length, 1),
        updatedAt: new Date().toISOString(),
    };

    // 启用或修改时间时，从“下一次计划时间”开始，避免保存配置后立即误执行。
    if (justEnabled || scheduleChanged) {
        next.lastRunKey = getMostRecentRunKey(next);
    }

    return next;
}

function getPublicConfig() {
    const config = readConfig();
    return {
        ...config,
        templates: openaiService.getDescriptionTemplates(),
        scheduleLabel: `Every ${WEEKDAYS[config.weekday]} at ${String(
            config.hour
        ).padStart(2, "0")}:${String(config.minute).padStart(2, "0")} (${config.timezone})`,
    };
}

function updateConfig(input) {
    const current = readConfig();
    const next = normalizeConfigInput(input, current);
    writeConfig(next);
    return getPublicConfig();
}

async function executeRotation(config, runKey) {
    const templateId =
        config.templateIds[
            config.nextTemplateIndex % config.templateIds.length
        ];
    const template = openaiService.getDescriptionTemplate(templateId);
    const run = {
        id: `${runKey}-${Date.now()}`,
        runKey,
        templateId,
        templateName: template.name,
        startedAt: new Date().toISOString(),
        completedAt: null,
        status: "running",
        results: [],
    };

    // 先占用本周执行键，防止进程中途退出后重复修改同一批 Listing。
    const claimedConfig = {
        ...config,
        lastRunKey: runKey,
        lastRunAt: run.startedAt,
        history: [run, ...(config.history || [])].slice(0, 52),
    };
    writeConfig(claimedConfig);

    for (const listingId of config.listingIds) {
        try {
            const listing = await etsyService.getListing(listingId);
            const description =
                await openaiService.rewriteListingDescription(listing, {
                    templateId,
                });
            await etsyService.updateListingDescription(
                listingId,
                description
            );
            performanceTracker.recordUpdate({
                listingId,
                title: listing.title,
                viewsBefore: listing.views,
                source: "weekly-rotation",
                updatedBy: "scheduler",
                templateId,
                runId: run.id,
            });
            run.results.push({
                listingId,
                title: listing.title,
                success: true,
                viewsBefore: listing.views ?? null,
            });
        } catch (error) {
            console.error(
                `Weekly description rotation failed for ${listingId}:`,
                error.response?.data || error.message
            );
            run.results.push({
                listingId,
                title: null,
                success: false,
                error:
                    error.response?.data?.message ||
                    error.response?.data?.error ||
                    error.message ||
                    "Unknown rotation error",
            });
        }
    }

    const successes = run.results.filter((item) => item.success).length;
    run.completedAt = new Date().toISOString();
    run.status =
        successes === run.results.length
            ? "success"
            : successes === 0
              ? "failed"
              : "partial";

    const latest = readConfig();
    const completedConfig = {
        ...latest,
        nextTemplateIndex:
            (config.nextTemplateIndex + 1) % config.templateIds.length,
        history: (latest.history || []).map((item) =>
            item.id === run.id ? run : item
        ),
    };
    writeConfig(completedConfig);

    return run;
}

async function checkForDueRotation() {
    if (rotationRunning) return null;

    const config = readConfig();
    if (
        !config.enabled ||
        config.listingIds.length === 0 ||
        config.templateIds.length < 2
    ) {
        return null;
    }

    const runKey = getMostRecentRunKey(config);
    if (config.lastRunKey === runKey) return null;

    rotationRunning = true;
    try {
        return await executeRotation(config, runKey);
    } finally {
        rotationRunning = false;
    }
}

function startDescriptionRotationScheduler() {
    const check = () => {
        checkForDueRotation().catch((error) => {
            console.error(
                "Weekly description rotation scheduler error:",
                error.message
            );
        });
    };

    const initialCheck = setTimeout(check, 5000);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    initialCheck.unref();
    interval.unref();

    return interval;
}

module.exports = {
    getPublicConfig,
    updateConfig,
    checkForDueRotation,
    startDescriptionRotationScheduler,
    getMostRecentRunKey,
};
