const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { once } = require("node:events");

process.env.TEAM_SESSION_SECRET = "test-session-secret-that-is-never-used-in-production";
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "freya-auth-test-"));
process.env.TEAM_USERS_FILE = path.join(temporaryDirectory, "team-users.json");
process.env.TEAM_AUDIT_FILE = path.join(temporaryDirectory, "team-audit.jsonl");

const { hashPassword } = require("../src/auth/team-auth");
fs.writeFileSync(
    process.env.TEAM_USERS_FILE,
    JSON.stringify([
        {
            username: "test-viewer",
            displayName: "Test Viewer",
            role: "viewer",
            active: true,
            passwordHash: hashPassword("TestPassword123!"),
        },
    ])
);
const { startServer } = require("../server");

let server;
let baseUrl;

before(async () => {
    server = startServer(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("session endpoint is public and reports signed-out state", async () => {
    const response = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        authenticated: false,
        user: null,
    });
});

test("Etsy data is unavailable without a team session", async () => {
    const response = await fetch(`${baseUrl}/etsy/listings`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
        error: "Please sign in to Freya Auto.",
    });
});

test("unknown team account cannot sign in", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "account-that-does-not-exist",
            password: "not-a-real-password",
        }),
    });
    assert.equal(response.status, 401);
});

test("valid team member receives a signed session and CSRF token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "test-viewer",
            password: "TestPassword123!",
        }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.user.role, "viewer");
    assert.ok(payload.user.csrfToken);
    assert.match(response.headers.get("set-cookie"), /freya_team_session=/);
});

test("viewer cannot call an administrator-only endpoint", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "test-viewer",
            password: "TestPassword123!",
        }),
    });
    const loginPayload = await loginResponse.json();
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
    const response = await fetch(`${baseUrl}/etsy/refresh-token`, {
        method: "POST",
        headers: {
            Cookie: cookie,
            "X-Freya-CSRF": loginPayload.user.csrfToken,
        },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
        error: "This action requires the admin role.",
    });
});

test("state-changing request is rejected without its CSRF token", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: "test-viewer",
            password: "TestPassword123!",
        }),
    });
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookie },
    });
    assert.equal(response.status, 403);
});
