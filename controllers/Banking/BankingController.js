const Bank = require('../../models/Bankking');

// Tạo bank (chỉ admin)
exports.createBank = async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.role !== "admin") {
            return res.status(403).json({ error: 'Chỉ admin mới có quyền sử dụng chức năng này' });
        }
        const bank = new Bank(req.body);
        await bank.save();
        res.status(201).json(bank);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Cập nhật bank (chỉ admin)
exports.updateBank = async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.role !== "admin") {
            return res.status(403).json({ error: 'Chỉ admin mới có quyền sử dụng chức năng này' });
        }
        const bank = await Bank.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!bank) return res.status(404).json({ message: 'Bank not found' });
        res.json(bank);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Xóa bank (chỉ admin)
exports.deleteBank = async (req, res) => {
    try {
        const user = req.user;
        if (!user || user.role !== "admin") {
            return res.status(403).json({ error: 'Chỉ admin mới có quyền sử dụng chức năng này' });
        }
        const bank = await Bank.findByIdAndDelete(req.params.id);
        if (!bank) return res.status(404).json({ message: 'Bank not found' });
        res.json({ message: 'Bank deleted successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Lấy danh sách bank
exports.getBank = async (req, res) => {
    try {
        const user = req.user;
        let banks;
        // Nếu là admin, hiển thị tất cả các trường
        if (user && user.role === "admin") {
            banks = await Bank.find();
        } else {
            // User thường: ẩn các trường nhạy cảm
            banks = await Bank.find().select("-bank_account -bank_password -token");
        }
        if (!banks || banks.length === 0) {
            return res.status(404).json({ message: 'Bank not found' });
        }
        res.json(banks);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

