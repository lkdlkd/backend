const mongoose = require("mongoose");

// Schema cho Platform
const platformSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Tên platform
  logo: { type: String, required: true }, // Logo platform
  status: { type: Boolean, default: true }, // Trạng thái (true: hoạt động, false: không hoạt động)
  created_at: { type: Date, default: Date.now }, // Ngày tạo
});

module.exports = mongoose.model("Platform", platformSchema);