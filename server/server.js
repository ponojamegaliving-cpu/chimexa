const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const routes = require("./routes");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api", routes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`App running on http://${HOST}:${PORT}`);
});
