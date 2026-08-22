const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const configDir = path.join(__dirname, "../config");
const usersFile = process.env.TEAM_USERS_FILE
    ? path.resolve(process.env.TEAM_USERS_FILE)
    : path.join(configDir, "team-users.json");
const auditFile = process.env.TEAM_AUDIT_FILE
    ? path.resolve(process.env.TEAM_AUDIT_FILE)
    : path.join(configDir, "team-audit.jsonl");
const sessionCookie = "freya_team_session";
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const loginAttempts = new Map();

const roleRank = {
    viewer: 1,
    editor: 2,
    admin: 3,
};

function ensureConfigDir() {
    fs.mkdirSync(path.dirname(auditFile), { recursive: true });
}

function readUsers() {
    try {
        const users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
        return Array.isArray(users) ? users : [];
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
    const [algorithm, salt, expectedHex] = String(storedHash || "").split("$");
    if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function getSessionSecret() {
    if (process.env.TEAM_SESSION_SECRET) {
        return process.env.TEAM_SESSION_SECRET;
    }

    if (!getSessionSecret.temporarySecret) {
        getSessionSecret.temporarySecret = crypto.randomBytes(48).toString("hex");
        console.warn(
            "TEAM_SESSION_SECRET is not set. Sessions will be invalidated whenever the server restarts."
        );
    }

    return getSessionSecret.temporarySecret;
}

function encode(value) {
    return Buffer.from(value).toString("base64url");
}

function sign(value) {
    return crypto
        .createHmac("sha256", getSessionSecret())
        .update(value)
        .digest("base64url");
}

function createSession(user) {
    const payload = encode(
        JSON.stringify({
            username: user.username,
            credentialVersion: crypto
                .createHash("sha256")
                .update(user.passwordHash)
                .digest("base64url")
                .slice(0, 20),
            csrfToken: crypto.randomBytes(24).toString("base64url"),
            expiresAt: Date.now() + sessionLifetimeMs,
        })
    );
    return `${payload}.${sign(payload)}`;
}

function parseCookies(header = "") {
    return Object.fromEntries(
        header
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => {
                const index = item.indexOf("=");
                return index === -1
                    ? [item, ""]
                    : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
            })
    );
}

function readSession(req) {
    try {
        const token = parseCookies(req.headers.cookie)[sessionCookie];
        if (!token) return null;

        const [payload, signature] = token.split(".");
        if (!payload || !signature) return null;

        const expected = sign(payload);
        const actualBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (
            actualBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
        ) {
            return null;
        }

        const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!session.expiresAt || session.expiresAt <= Date.now()) return null;

        const user = readUsers().find(
            (candidate) => candidate.username === session.username && candidate.active !== false
        );
        if (!user || !roleRank[user.role]) return null;
        const credentialVersion = crypto
            .createHash("sha256")
            .update(user.passwordHash)
            .digest("base64url")
            .slice(0, 20);
        if (session.credentialVersion !== credentialVersion) return null;

        return {
            user: {
                username: user.username,
                displayName: user.displayName || user.username,
                role: user.role,
            },
            csrfToken: session.csrfToken,
            expiresAt: session.expiresAt,
        };
    } catch {
        return null;
    }
}

function isSecureRequest(req) {
    return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function sessionCookieHeader(req, token, maxAgeSeconds) {
    const secure = isSecureRequest(req) ? "; Secure" : "";
    return `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clientIp(req) {
    return String(req.headers["cf-connecting-ip"] || req.ip || "unknown");
}

function appendAudit(entry) {
    try {
        ensureConfigDir();
        fs.appendFileSync(
            auditFile,
            `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
            "utf8"
        );
    } catch (error) {
        console.error("Team audit log error:", error.message);
    }
}

function publicUser(session) {
    return session
        ? {
              ...session.user,
              csrfToken: session.csrfToken,
              expiresAt: session.expiresAt,
          }
        : null;
}

function getSession(req, res) {
    const session = readSession(req);
    return res.json({ authenticated: Boolean(session), user: publicUser(session) });
}

function login(req, res) {
    const ip = clientIp(req);
    const attempt = loginAttempts.get(ip);
    if (attempt?.blockedUntil > Date.now()) {
        return res.status(429).json({
            error: "Too many login attempts. Please wait a few minutes and try again.",
        });
    }

    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = readUsers().find(
        (candidate) =>
            candidate.username.toLowerCase() === username && candidate.active !== false
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
        const failures = (attempt?.failures || 0) + 1;
        loginAttempts.set(ip, {
            failures,
            blockedUntil: failures >= 5 ? Date.now() + 10 * 60 * 1000 : 0,
        });
        appendAudit({ action: "login_failed", username, ip });
        return res.status(401).json({ error: "Username or password is incorrect." });
    }

    loginAttempts.delete(ip);
    const token = createSession(user);
    res.setHeader(
        "Set-Cookie",
        sessionCookieHeader(req, token, Math.floor(sessionLifetimeMs / 1000))
    );
    const session = readSession({ headers: { cookie: `${sessionCookie}=${token}` } });
    appendAudit({ action: "login", username: user.username, role: user.role, ip });
    return res.json({ authenticated: true, user: publicUser(session) });
}

function logout(req, res) {
    const session = readSession(req);
    res.setHeader("Set-Cookie", sessionCookieHeader(req, "", 0));
    appendAudit({
        action: "logout",
        username: session?.user.username || "unknown",
        ip: clientIp(req),
    });
    return res.json({ success: true });
}

function requireAuth(req, res, next) {
    const session = readSession(req);
    if (!session) {
        return res.status(401).json({ error: "Please sign in to Freya Auto." });
    }
    req.teamSession = session;
    req.teamUser = session.user;
    return next();
}

function requireRole(minimumRole) {
    return (req, res, next) => {
        if ((roleRank[req.teamUser?.role] || 0) < roleRank[minimumRole]) {
            return res.status(403).json({
                error: `This action requires the ${minimumRole} role.`,
            });
        }
        return next();
    };
}

function requireCsrf(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const supplied = String(req.headers["x-freya-csrf"] || "");
    const expected = String(req.teamSession?.csrfToken || "");
    if (!supplied || supplied !== expected) {
        return res.status(403).json({ error: "The security token is missing or invalid." });
    }
    return next();
}

function auditChanges(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    res.on("finish", () => {
        appendAudit({
            action: "api_change",
            username: req.teamUser?.username || "unknown",
            role: req.teamUser?.role || "unknown",
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            ip: clientIp(req),
        });
    });
    return next();
}

module.exports = {
    auditChanges,
    getSession,
    hashPassword,
    login,
    logout,
    readUsers,
    requireAuth,
    requireCsrf,
    requireRole,
    usersFile,
};
