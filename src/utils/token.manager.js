const fs = require("fs");
const path = require("path");

const tokenFile = path.join(__dirname, "../config/token.json");

function saveToken(tokenData) {
    fs.writeFileSync(
        tokenFile,
        JSON.stringify(tokenData, null, 4),
        "utf-8"
    );
}

function readToken(){
    const text = fs.readFileSync(tokenFile, "utf8");
    if (!text) {
        return null;
    }

    return JSON.parse(text);
}

function clearToken() {
    fs.writeFileSync(tokenFile, "{}", "utf8");
}

function getToken(){
    const data = fs.readFileSync(tokenFile);

    return JSON.parse(data);// js type object
}

function updateToken(newData){
    const currentToken = getToken();

    const updatedToken = {
        ...currentToken,
        ...newData,
    }

    fs.writeFileSync(
        tokenFile,
        JSON.stringify(updatedToken, null, 4)
    )

    return updatedToken;
}

module.exports = {
    saveToken,
    readToken,
    clearToken,
    getToken,
    updateToken,
};