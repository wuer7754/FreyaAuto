const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");

const usersFile = path.join(__dirname, "../src/config/team-users.json");
const allowedRoles = new Set(["admin", "editor", "viewer"]);

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
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

function askHidden(prompt) {
    return new Promise((resolve) => {
        const input = process.stdin;
        const output = process.stdout;
        output.write(prompt);
        input.setRawMode(true);
        input.resume();
        input.setEncoding("utf8");
        let value = "";

        function onData(character) {
            if (character === "\u0003") process.exit(130);
            if (character === "\r" || character === "\n") {
                input.setRawMode(false);
                input.pause();
                input.removeListener("data", onData);
                output.write("\n");
                resolve(value);
                return;
            }
            if (character === "\u007f") {
                value = value.slice(0, -1);
                return;
            }
            value += character;
        }

        input.on("data", onData);
    });
}

async function main() {
    const username = String(process.argv[2] || "").trim().toLowerCase();
    const role = String(process.argv[3] || "").trim().toLowerCase();
    const displayName = String(process.argv[4] || username).trim();

    if (!/^[a-z0-9._-]{3,40}$/.test(username) || !allowedRoles.has(role)) {
        console.error(
            "Usage: npm run team:user -- <username> <admin|editor|viewer> [display name]"
        );
        process.exit(1);
    }
    if (!process.stdin.isTTY) {
        console.error("Run this command in an interactive terminal.");
        process.exit(1);
    }

    const password = await askHidden("Password (at least 12 characters): ");
    if (password.length < 12) {
        console.error("Password must be at least 12 characters.");
        process.exit(1);
    }

    const users = readUsers();
    const nextUser = {
        username,
        displayName,
        role,
        active: true,
        passwordHash: hashPassword(password),
    };
    const existingIndex = users.findIndex((user) => user.username === username);
    if (existingIndex === -1) users.push(nextUser);
    else users[existingIndex] = nextUser;

    fs.mkdirSync(path.dirname(usersFile), { recursive: true });
    fs.writeFileSync(usersFile, `${JSON.stringify(users, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    console.log(`Team user '${username}' saved with role '${role}'.`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
