//  把 .env 文件中的环境变量加载到 process.env 中
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const path = require("path");
const etsyRoutes = require("./src/routes/etsy.routes");
const socialRoutes = require("./src/routes/social.routes");
const socialMedia = require("./src/integrations/social/social-media.service");
const authRoutes = require("./src/routes/auth.routes");
const teamAuth = require("./src/auth/team-auth");
const etsyController = require("./src/controllers/etsy.controller");
const descriptionRotationService = require(
    "./src/automations/description-rotation.service"
);

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudflare / reverse proxy provides the original HTTPS protocol in this header.
app.set("trust proxy", 1);

// 设置 JSON 返回格式，每层缩进 2 个空格
app.set("json spaces", 2);

// 读取 application/json 格式的请求内容
app.use(express.json());

// 读取表单格式的请求内容
app.use(express.urlencoded({ extended: true }));

// 生产环境中，将 Vite 构建后的电脑端界面挂载到 /app/。
const clientDist = path.join(__dirname, "dist", "client");
app.use("/app", express.static(clientDist));
app.get("/app", (req, res) => res.redirect("/app/"));

// Buffer must be able to retrieve uploaded media without a team session.
// Files use unguessable names and only validated raster image formats are accepted.
app.use(
    "/social/media/files",
    express.static(socialMedia.getUploadDirectory(), {
        immutable: true,
        maxAge: "30d",
        setHeaders(response) {
            response.setHeader("X-Content-Type-Options", "nosniff");
        },
    })
);

app.get("/", (req, res) => {
    res.send('Freya Auto API is running. Open <a href="/app/">Freya Auto</a>.');
});

// 登录接口和 Etsy OAuth 回调必须在团队权限中间件之前注册。
app.use("/", authRoutes);
app.get("/oauth/etsy/callback", etsyController.handleCallback);

// 所有读取和修改 Etsy 的接口都需要团队身份。写请求还必须携带 CSRF token。
app.use("/", teamAuth.requireAuth, teamAuth.requireCsrf, teamAuth.auditChanges, etsyRoutes);
app.use("/", teamAuth.requireAuth, teamAuth.requireCsrf, teamAuth.auditChanges, socialRoutes);

// 最后启动服务器。导出 startServer 便于做不连接 Etsy 的权限测试。
function startServer(port = PORT, host) {
    const onListening = () => {
        const address = port === 0 ? "an available test port" : port;
        console.log(`Server is running on http://localhost:${address}`);
        if (teamAuth.readUsers().length === 0) {
            console.warn(
                "No team users exist. Create the first admin with: npm run team:user -- admin admin \"Your name\""
            );
        }
        descriptionRotationService.startDescriptionRotationScheduler();
    };
    return host
        ? app.listen(port, host, onListening)
        : app.listen(port, onListening);
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
