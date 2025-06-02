const mongoose = require("mongoose");

const configwebSchema = new mongoose.Schema({
  tieude: { type: String, default: "" },
  logo: { type: String, default: "" },
  favicon: { type: String, default: "" },
  lienhe: [
    {
      type: { type: String, default: "" },
      value: { type: String, default: "" },
      logolienhe: { type: String, default: "" },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Configweb", configwebSchema);