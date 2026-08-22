const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");

/**
 * Etsy Open API 共用客户端配置。
 *
 * service 层通过这个 Axios 实例发送请求，可以统一复用 Etsy 的基础地址、
 * 超时时间、默认请求头和可选代理设置。
 */
const config = {
  // 使用相对路径发起请求时，Axios 会自动在路径前添加这个基础地址。
  // 如果传入完整 URL（例如 https://openapi.etsy.com/...），则使用该完整 URL。
  baseURL: "https://api.etsy.com",

  // 单次请求最多等待 20 秒，超过后 Axios 会中止请求并抛出超时错误。
  timeout: 20000,

  // Etsy 的常规 JSON 接口默认使用这些请求头。
  // OAuth Token 等表单接口可以在单次请求中覆盖 Content-Type。
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
};

/**
 * 可选的 HTTPS 代理配置。
 *
 * 在 .env 中设置 ETSY_PROXY_URL 后，所有通过该客户端发送的 HTTPS 请求
 * 都会交给 HttpsProxyAgent。未设置时，请求直接连接 Etsy API。
 *
 * ETSY_PROXY_URL 示例：http://127.0.0.1:7890
 * 如果代理地址包含用户名或密码，不要提交 .env，也不要将日志公开。
 */
if (process.env.ETSY_PROXY_URL) {
  // 仅用于启动时确认代理配置已经生效。
  console.log(`✅ Etsy proxy enabled: ${process.env.ETSY_PROXY_URL}`);

  // 创建 Node.js HTTPS Agent，由它负责把请求转发给指定代理服务器。
  config.httpsAgent = new HttpsProxyAgent(process.env.ETSY_PROXY_URL);

  // 已使用自定义 Agent，关闭 Axios 内置代理，避免同一个请求被重复代理。
  config.proxy = false;
} else {
  // 未提供代理环境变量时，使用系统的默认网络直接访问 Etsy。
  console.log("ℹ️ Etsy proxy disabled");
}

// 创建并导出单例客户端。service 层可直接调用 get、post、patch 等方法。
module.exports = axios.create(config);
