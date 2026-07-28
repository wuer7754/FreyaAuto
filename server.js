const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const etsyRoutes = require("./src/routes/etsy.routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Freya Auto API is running");
});

app.use("/", etsyRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});