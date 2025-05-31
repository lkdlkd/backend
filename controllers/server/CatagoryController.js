const Category = require("../../models/Category");
const Platform = require("../../models/platform");

// Thêm category mới (chỉ admin)
exports.addCategory = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Chỉ admin mới có quyền thực hiện thao tác này" });
    }

    const { platforms_id, name, path, notes, modal_show, status } = req.body;

    // Kiểm tra xem Platform có tồn tại không
    const platform = await Platform.findById(platforms_id);
    if (!platform) {
      return res.status(404).json({ success: false, message: "Platform không tồn tại" });
    }

    // Tạo category mới
    const newCategory = new Category({
      platforms_id,
      name,
      path,
      notes,
      modal_show,
      status,
    });

    await newCategory.save();
    res.status(201).json({ success: true, message: "Category được thêm thành công", data: newCategory });
  } catch (error) {
    res.status(400).json({ success: false, message: "Lỗi khi thêm Category", error: error.message });
  }
};

// Sửa category (chỉ admin)
exports.updateCategory = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Chỉ admin mới có quyền thực hiện thao tác này" });
    }

    const { id } = req.params;
    const { platforms_id, name, path, notes, modal_show, status } = req.body;

    // Kiểm tra xem Category có tồn tại không
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category không tồn tại" });
    }

    // Cập nhật category
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { platforms_id, name, path, notes, modal_show, status },
      { new: true }
    );

    res.status(200).json({ success: true, message: "Category được cập nhật thành công", data: updatedCategory });
  } catch (error) {
    res.status(400).json({ success: false, message: "Lỗi khi cập nhật Category", error: error.message });
  }
};

// Xóa category (chỉ admin)
exports.deleteCategory = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Chỉ admin mới có quyền thực hiện thao tác này" });
    }

    const { id } = req.params;

    // Kiểm tra xem Category có tồn tại không
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category không tồn tại" });
    }

    await Category.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Category được xóa thành công" });
  } catch (error) {
    res.status(400).json({ success: false, message: "Lỗi khi xóa Category", error: error.message });
  }
};

// Lấy danh sách category (không cần admin)
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .populate("platforms_id", "name logo") // Lấy thông tin Platform liên kết
      .sort({ created_at: -1 }); // Sắp xếp theo ngày tạo (mới nhất trước)

    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server", error: error.message });
  }
};