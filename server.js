//  把 .env 文件中的环境变量加载到 process.env 中
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const etsyRoutes = require("./src/routes/etsy.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// 设置 JSON 返回格式，每层缩进 2 个空格
app.set("json spaces", 2);

// 读取 application/json 格式的请求内容
app.use(express.json());

// 读取表单格式的请求内容
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("Freya Auto API is running");
});

// 注册 Etsy 路由
app.use("/", etsyRoutes);

// 最后启动服务器
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});