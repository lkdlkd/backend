const axios = require('axios');
const cron = require('node-cron');
const Banking = require('../../models/Bankking');
const Transaction = require('../../models/TransactionBanking');
const User = require('../../models/User');
const Promotion = require('../../models/Promotion');
const HistoryUser = require('../../models/History');

// Hàm tạo URL API tương ứng với loại ngân hàng
function getBankApiUrl(bank) {
    const { bank_name, bank_password, account_number, token } = bank;

    switch (bank_name.toLowerCase()) {
        case 'acb':
            return `https://api.web2m.com/historyapiacbv3/${bank_password}/${account_number}/${token}`;
        case 'vietcombank':
            return `https://api.web2m.com/historyapivcbv3/${bank_password}/${account_number}/${token}`;
        case 'techcombank':
            return `https://api.web2m.com/historyapitcbv3/${bank_password}/${account_number}/${token}`;
        case 'mbbank':
            return `https://api.web2m.com/historyapimbv3/${bank_password}/${account_number}/${token}`;
        case 'bidv':
            return `https://api.web2m.com/historyapibidvv3/${bank_password}/${account_number}/${token}`;
        default:
            return null;
    }
}

// Hàm trích xuất username từ mô tả kiểu "naptien username"
function extractUsername(description) {
    const match = description.match(/naptien\s+([a-zA-Z0-9_.]+)/i);
    return match ? match[1] : null;
}

// Hàm tính tiền thưởng khuyến mãi (nếu có)
// Hàm tính tiền thưởng khuyến mãi (nếu có)
async function calculateBonus(amount) {
    const now = new Date();

    const promo = await Promotion.findOne({
        startTime: { $lte: now },
        endTime: { $gte: now },
    });
    // Kiểm tra nếu số tiền nhỏ hơn minAmount
    if (amount < promo.minAmount) {
        console.log(`⚠️ Số tiền (${amount}) nhỏ hơn số tiền tối thiểu (${promo.minAmount}) để được khuyến mãi`);
        return 0; // Không áp dụng khuyến mãi
    }
    if (!promo) {
        console.log("⚠️ Không có chương trình khuyến mãi");
        return 0; // Không có khuyến mãi, trả về 0
    }

    console.log(`🎉 Chương trình khuyến mãi: ${promo.name} - Tỷ lệ: ${promo.percentBonus}%`);
    const bonus = Math.floor((amount * promo.percentBonus) / 100);
    return bonus;
}

// Cron job mỗi phút
cron.schedule('*/30 * * * * *', async () => {
    console.log('⏳ Đang chạy cron job...');

    try {
        const banks = await Banking.find({ status: true }); // Chỉ lấy các ngân hàng đang hoạt động

        for (const bank of banks) {
            const apiUrl = getBankApiUrl(bank);
            if (!apiUrl) {
                console.log(`❌ Không hỗ trợ ngân hàng: ${bank.bank_name}`);
                continue;
            }

            try {
                const res = await axios.get(apiUrl);
                let { transactions } = res.data;

                if (!transactions || transactions.length === 0) {
                    console.log(`⚠️ Không có giao dịch mới cho ngân hàng: ${bank.bank_name}`);
                    continue;
                }

                // Chỉ xử lý 20 giao dịch gần nhất
                transactions = transactions.slice(0, 20);

                for (const trans of transactions) {
                    if (trans.type !== 'IN') continue; // Chỉ xử lý giao dịch nạp tiền

                    const exists = await Transaction.findOne({ transactionID: trans.transactionID });
                    if (exists) {
                        console.log(`⚠️ Giao dịch đã tồn tại: ${trans.transactionID}`);
                        continue; // Bỏ qua nếu giao dịch đã được xử lý
                    }

                    const username = extractUsername(trans.description);
                    let user = null;
                    let bonus = 0;
                    let totalAmount = 0;

                    const amount = parseFloat(trans.amount); // Chuyển đổi amount từ chuỗi sang số

                    if (username) {
                        // Tìm user theo username
                        user = await User.findOne({ username });

                        // Cập nhật số dư người dùng và tổng số tiền nạp
                        if (user) {
                            const tiencu = user.balance;
                            // Tính tiền thưởng khuyến mãi (nếu có)
                            bonus = await calculateBonus(amount);
                            totalAmount = amount + bonus;

                            console.log(`Giao dịch: ${trans.transactionID}, Amount: ${amount}, Bonus: ${bonus}, Total: ${totalAmount}`);

                            // Cập nhật số dư người dùng
                            user.balance += totalAmount;

                            // Cập nhật tổng số tiền nạp
                            user.tongnap = (user.tongnap || 0) + totalAmount;

                            // Cập nhật tổng số tiền nạp trong tháng
                            const now = new Date();
                            const currentMonth = now.getMonth();
                            const currentYear = now.getFullYear();

                            // Kiểm tra nếu tháng hiện tại khác với tháng lưu trữ trước đó
                            if (!user.lastNapMonth || user.lastNapMonth !== currentMonth || user.lastNapYear !== currentYear) {
                                user.tongnapthang = 0; // Reset tổng nạp tháng nếu sang tháng mới
                                user.lastNapMonth = currentMonth;
                                user.lastNapYear = currentYear;
                            }

                            user.tongnapthang += totalAmount;

                            // Lưu lịch sử giao dịch
                            const historyData = new HistoryUser({
                                username,
                                madon: "null",
                                hanhdong: "Cộng tiền",
                                link: "",
                                tienhientai: tiencu,
                                tongtien: totalAmount,
                                tienconlai: user.balance,
                                createdAt: new Date(),
                                mota: bonus > 0
                                    ? `Hệ thống ${bank.bank_name} tự động cộng thành công số tiền ${totalAmount} và áp dụng khuyến mãi ${Math.floor((bonus / amount) * 100)}%`
                                    : `Hệ thống ${bank.bank_name} tự động cộng thành công số tiền ${totalAmount}`,
                            });
                            await historyData.save();
                            await user.save();

                        } else {
                            console.log(`⚠️ Không tìm thấy user: ${username}`);
                        }
                    } else {
                        console.log(`⚠️ Không tìm thấy username trong mô tả: ${trans.description}`);
                    }
                    datetime = new Date().toISOString(); // Lấy thời gian hiện tại
                    // Xác định trạng thái giao dịch
                    const transactionStatus = user ? 'COMPLETED' : 'FAILED';

                    // Lưu giao dịch vào bảng Transaction
                    await Transaction.create({
                        typeBank: bank.bank_name, // Lưu tên ngân hàng
                        transactionID: trans.transactionID,
                        username: username || "unknown", // Lưu "unknown" nếu không tìm thấy username
                        amount: trans.amount, // Lưu số tiền đã chuyển đổi
                        description: trans.description,
                        transactionDate: datetime,
                        type: trans.type,
                        status: transactionStatus, // Trạng thái giao dịch
                        note: user
                            ? (bonus > 0
                                ? `Hệ thống ${bank.bank_name} tự động cộng thành công số tiền ${trans.amount} và áp dụng khuyến mãi ${Math.floor((bonus / amount) * 100)}%`
                                : `Hệ thống ${bank.bank_name} tự động cộng thành công số tiền ${trans.amount}`)
                            : `Hệ thống ${bank.bank_name} không thể cộng tiền vì không tìm thấy người dùng`,
                    });

                    if (user) {
                        if (bonus > 0) {
                            console.log(`🎁 ${bank.bank_name.toUpperCase()}: +${amount} (+${bonus} KM) => ${username}`);
                        } else {
                            console.log(`✅ ${bank.bank_name.toUpperCase()}: +${amount} cho ${username}`);
                        }
                    } else {
                        console.log(`⚠️ Giao dịch được lưu nhưng không cộng tiền: ${trans.transactionID}`);
                    }
                }

            } catch (bankError) {
                console.error(`❌ Lỗi xử lý ${bank.bank_name}:`, bankError.message);
            }
        }

    } catch (error) {
        console.error('❌ Cron lỗi:', error.message);
    }
});
