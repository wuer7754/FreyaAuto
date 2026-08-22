import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    base: "/app/",
    plugins: [react()],
    build: {
        outDir: "dist/client",
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            "/etsy": "http://localhost:3000",
            "/auth": "http://localhost:3000",
            "/oauth": "http://localhost:3000",
        },
    },
});
