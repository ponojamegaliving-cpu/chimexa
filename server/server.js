const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const { router: apiRoutes } = require("./routes");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/vendor/tesseract", express.static(path.join(__dirname, "../node_modules/tesseract.js/dist")));
app.use("/vendor/tesseract-core", express.static(path.join(__dirname, "../node_modules/tesseract.js-core")));
app.use("/vendor/tessdata/eng", express.static(path.join(__dirname, "../node_modules/@tesseract.js-data/eng")));
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`App running on http://${HOST}:${PORT}`);
});
