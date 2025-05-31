const axios = require('axios');
const jwt = require('jsonwebtoken');
const Service = require('../../models/server');
const Order = require('../../models/Order');
const HistoryUser = require('../../models/History');
const User = require('../../models/User');
const SmmSv = require("../../models/SmmSv");

/* Hàm lấy danh sách dịch vụ */
exports.getServices = async (req, res) => {
    try {
        const { key } = req.body;
        // Kiểm tra xem token có được gửi không
        // Kiểm tra xem token có được gửi không
        if (!key) {
            return res.status(400).json({ success: false, error: "Token không được bỏ trống" });
        }
        // Lấy user từ DB dựa trên userId từ decoded token
        const user = await User.findOne({ apiKey: key });
        if (!user) {
            res.status(404).json({ error: 'Người dùng không tồn tại' });
            return null;
        }

        // So sánh token trong header với token đã lưu của user
        if (user.apiKey !== key) {
            res.status(401).json({ error: 'api Key không hợp lệ1' });
            return null;
        }
        // Kiểm tra trạng thái người dùng trong CSDL (ví dụ: 'active')
        if (!user) {
            return res.status(404).json({ success: false, error: "Không tìm thấy người dùng" });
        }
        if (user.status && user.status !== 'active') {
            return res.status(403).json({ success: false, error: "Người dùng không hoạt động" });
        }
        // Lấy danh sách dịch vụ từ CSDL
        const services = await Service.find();
        // Định dạng các trường cần hiển thị
        const formattedServices = services.map(service => ({
            service: service.Magoi,
            name: `${service.maychu} ${service.name}`, // Đảm bảo có khoảng trắng
            type: service.type,
            category: service.category,
            rate: service.rate / 25,
            min: service.min,
            max: service.max,
            cancel: service.isActive,
            currency: "USD",
        }));

        return res.status(200).json(formattedServices);
    } catch (error) {
        console.error("Lỗi khi lấy danh sách dịch vụ:", error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách dịch vụ',
            error: error.message
        });
    }
};

exports.AddOrder = async (req, res) => {
    // Lấy token từ req.body
    const { key, link, quantity, service, comments } = req.body;
    const magoi = service;

    // Kiểm tra xem token có được gửi không
    if (!key) {
        return res.status(400).json({  error: "Token không được bỏ trống" });
    }
    // Lấy user từ DB dựa trên userId từ decoded token
    const user = await User.findOne({ apiKey: key });
    if (!user) {
        res.status(404).json({ error: 'Người dùng không tồn tại' });
        return null;
    }

    // So sánh token trong header với token đã lưu của user
    if (user.apiKey !== key) {
        res.status(401).json({ error: 'api Key không hợp lệ1' });
        return null;
    }
    // Kiểm tra trạng thái người dùng trong CSDL (ví dụ: 'active')
    if (!user) {
        return res.status(404).json({ success: false, error: "Không tìm thấy người dùng" });
    }
    if (user.status && user.status !== 'active') {
        return res.status(403).json({ success: false, error: "Người dùng không hoạt động" });
    }
    const username = user.username
    const qty = Number(quantity);
    const formattedComments = comments ? comments.replace(/\r?\n/g, "\r\n") : "";

    try {
        // --- Bước 1: Lấy thông tin dịch vụ từ CSDL ---
        const serviceFromDb = await Service.findOne({ Magoi: magoi });
        if (!serviceFromDb) {
            return res.status(400).json({ error: 'Dịch vụ không tồn tại' });
        }
        // console.log("Service from DB:", serviceFromDb);

        // --- Lấy cấu hình API từ CSDL ---
        const smmSvConfig = await SmmSv.findOne({ name: serviceFromDb.DomainSmm });
        if (!smmSvConfig || !smmSvConfig.url_api || !smmSvConfig.api_token) {
            return res.status(500).json({ error: 'Lỗi khi mua dịch vụ, vui lòng ib admin' });
        }
        // console.log("SMM Config:", smmSvConfig);

        // --- Bước 2: Gửi yêu cầu lấy thông tin dịch vụ từ API bên thứ 3 ---
        const serviceResponse = await axios.post(smmSvConfig.url_api, {
            key: smmSvConfig.api_token,
            action: 'services',
        });

        if (!serviceResponse.data || !Array.isArray(serviceResponse.data)) {
            return res.status(400).json({ error: 'Không thể lấy dữ liệu dịch vụ' });
        }
        const serviceFromApi = serviceResponse.data.find(
            service => service.service === Number(serviceFromDb.serviceId)
        );
        if (!serviceFromApi) {
            return res.status(400).json({ error: 'Dịch vụ không tồn tại' });
        }

        // Tính tổng chi phí và làm tròn 2 số thập phân
        const totalCost = parseFloat((serviceFromDb.rate * qty).toFixed(2));

        const apiRate = serviceFromApi.rate * smmSvConfig.tigia;
        if (apiRate > serviceFromDb.rate) {
            return res.status(400).json({ error: 'Lỗi khi mua dịch vụ, vui lòng ib admin' });
        }

        if (!serviceFromDb.isActive) {
            return res.status(400).json({ error: "Dịch vụ bảo trì, vui lòng mua sv khác" });
        }
        // --- Bước 3: Kiểm tra số dư tài khoản của người dùng ---
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: 'Người dùng không tồn tại' });
        }
        if (qty < serviceFromDb.min) {
            return res.status(400).json({ error: 'Vui lòng nhập số lượng lớn hơn' });
        }
        if (qty > serviceFromDb.max) {
            return res.status(400).json({ error: 'Số lượng vượt quá giới hạn' });
        }
        const currentBalance = parseFloat(user.balance.toFixed(2));
        if (currentBalance < totalCost) {
            return res.status(400).json({ error: 'Số dư không đủ để thực hiện giao dịch' });
        }

        // --- Bước 4: Gửi yêu cầu mua dịch vụ qua API bên thứ 3 ---
        const purchasePayload = {
            key: smmSvConfig.api_token,
            action: 'add',
            link,
            quantity: qty,
            service: serviceFromDb.serviceId,
            comments: formattedComments,
        };

        const purchaseResponse = await axios.post(smmSvConfig.url_api, purchasePayload);
        if (!purchaseResponse.data || purchaseResponse.data.error) {
            return res.status(400).json({
                error: 'Lỗi khi mua dịch vụ, vui lòng ib admin',
            });
        }
        const tiencu = user.balance;

        // --- Bước 5: Trừ số tiền vào tài khoản người dùng ---
        const newBalance = parseFloat((currentBalance - totalCost).toFixed(2));
        user.balance = newBalance;
        await user.save();

        // --- Bước 6: Tạo mã đơn (Madon) ---
        const lastOrder = await Order.findOne({}).sort({ Madon: -1 });
        const newMadon = lastOrder && lastOrder.Madon ? Number(lastOrder.Madon) + 1 : 10000;

        // --- Bước 7: Tạo đối tượng đơn hàng và lưu vào CSDL ---
        const createdAt = new Date();
        const orderData = new Order({
            Madon: newMadon,
            username,
            SvID: serviceFromDb.serviceId,

            orderId: purchaseResponse.data.order,
            namesv: serviceFromDb.maychu + " " + serviceFromDb.name,
            category: serviceFromDb.category,
            link,
            start: purchaseResponse.data.start_count || 0,
            quantity: qty,
            rate: parseFloat(serviceFromDb.rate.toFixed(2)),
            totalCost,
            createdAt,
            status: purchaseResponse.data.status || 'Pending',
            note: "",  // Gán mặc định là chuỗi rỗng khi không có note
            comments: formattedComments,
        });

        const HistoryData = new HistoryUser({
            username,
            madon: newMadon,
            hanhdong: 'Tạo đơn hàng',
            link,
            tienhientai: tiencu,
            tongtien: totalCost,
            tienconlai: newBalance,
            createdAt,
            mota: ' Tăng ' + serviceFromDb.maychu + " " + serviceFromDb.name + ' thành công cho uid ' + link,
        });

        console.log('Order:', orderData);
        console.log('History:', HistoryData);

        await orderData.save();
        await HistoryData.save();

        console.log('Order saved successfully!');

        // --- Bước 8: Gửi thông báo về Telegram ---
        const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatId = process.env.TELEGRAM_CHAT_ID;
        if (telegramBotToken && telegramChatId) {
            const telegramMessage = `📌 *Đơn hàng mới đã được tạo!*\n\n` +
                `👤 *Khách hàng:* ${username}\n` +
                `🔹 *Dịch vụ:* ${serviceFromDb.name}\n` +
                `🔗 *Link:* ${link}\n` +
                `📌 *Số lượng:* ${qty}\n` +
                `💰 *TIền cũ:* ${tiencu.toLocaleString()} VNĐ\n` +
                `💰 *Tổng tiền:* ${totalCost.toLocaleString()} VNĐ\n` +
                `💰 *TIền còn lại:* ${newBalance.toLocaleString()} VNĐ\n` +
                `🆔 *Mã đơn:* ${newMadon}\n` +
                `📆 *Ngày tạo:* ${createdAt.toLocaleString()}\n` +
                `📝 *Ghi chú:* ${'Không có'}`;

            try {
                await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
                    chat_id: telegramChatId,
                    text: telegramMessage,
                });
                console.log('Thông báo Telegram đã được gửi.');
            } catch (telegramError) {
                console.error('Lỗi gửi thông báo Telegram:', telegramError.message);
            }
        } else {
            console.log('Thiếu thông tin cấu hình Telegram.');
        }

        res.status(200).json({ order: newMadon });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Không thể thêm đơn hàng', error: error.message });
    }
};
/* Hàm lấy danh sách dịch vụ */
exports.getOrderStatus = async (req, res) => {
    try {
        const { key, order, orders } = req.body;

        // Kiểm tra xem API key có được gửi không
        if (!key) {
            return res.status(400).json({error: "Token không được bỏ trống" });
        }

        // Tìm user dựa trên apiKey
        const user = await User.findOne({ apiKey: key });
        if (!user) {
            return res.status(404).json({ error: "Người dùng không tồn tại" });
        }

        // Kiểm tra trạng thái người dùng
        if (user.status && user.status !== 'active') {
            return res.status(403).json({  error: "Người dùng không hoạt động" });
        }

        // Xử lý trường hợp có `orders` hoặc `order`
        let orderNumbers = [];

        if (orders) {
            // `orders` là danh sách đơn hàng, cần format thành object
            orderNumbers = Array.isArray(orders)
                ? orders.map(num => Number(num))
                : orders.split(',').map(num => Number(num.trim()));
        } else if (order) {
            // `order` là danh sách hoặc một đơn duy nhất
            orderNumbers = [Number(order)];

        } else {
            return res.status(400).json({  error: "Danh sách đơn hàng không được bỏ trống" });
        }

        // Lấy các đơn hàng từ DB
        const orderDocs = await Order.find({
            Madon: { $in: orderNumbers },
            // username: user.username // Kiểm tra đơn hàng có thuộc về user không
        });
        if (orders) {
            // Nếu có `orders`, trả về object với `Madon` làm key
            const formattedOrders = {};
            orderDocs.forEach(order => {
                if (order.username === user.username) {
                    formattedOrders[order.Madon] = {
                        charge: order.totalCost,
                        start_count: order.start,
                        status: order.status,
                        remains: order.quantity - order.dachay,
                        note: order.note || "",
                        currency: "VND"
                    };
                }
                else {
                    formattedOrders[order.Madon] = {
                        error: "Incorrect order ID"
                    };
                }
            });
            return res.status(200).json(formattedOrders);
        }
        // Giả sử orderDocs là mảng các đơn hàng từ DB
        if (orderDocs.length > 0) {
            const firstOrder = orderDocs[0];
            let formattedOrder;
            if (firstOrder.username === user.username) {
                formattedOrder = {
                    charge: firstOrder.totalCost,
                    start_count: firstOrder.start,
                    status: firstOrder.status,
                    remains: firstOrder.quantity - firstOrder.dachay,
                    note: firstOrder.note || "",
                    currency: "VND"
                };
            } else {
                formattedOrder = { order: firstOrder.Madon, error: "Incorrect order ID" };
            }
            return res.status(200).json(formattedOrder);
        } else {
            return res.status(200).json({ error: "Order not found" });
        }


        return res.status(200).json(formattedList);


        // Nếu có `order`, trả về danh sách

    } catch (error) {
        console.error("Lỗi khi lấy trạng thái đơn:", error);
        return res.status(500).json({
            error: "Lỗi khi lấy trạng thái đơn",
        });
    }
};

exports.getme = async (req, res) => {
    try {
        const { key } = req.body;

        // Kiểm tra xem token có được gửi không
        if (!key) {
            return res.status(400).json({  error: "Token không được bỏ trống" });
        }
        // Lấy user từ DB dựa trên userId từ decoded token
        const user = await User.findOne({ apiKey: key });
        if (!user) {
            res.status(404).json({ error: 'Người dùng không tồn tại' });
            return null;
        }

        // So sánh token trong header với token đã lưu của user
        if (user.apiKey !== key) {
            res.status(401).json({ error: 'api Key không hợp lệ1' });
            return null;
        }
        // Kiểm tra trạng thái người dùng trong CSDL (ví dụ: 'active')
        if (!user) {
            return res.status(404).json({  error: "Không tìm thấy người dùng" });
        }
        if (user.status && user.status !== 'active') {
            return res.status(403).json({  error: "Người dùng không hoạt động" });
        }
        // Định dạng các trường cần hiển thị (có thể điều chỉnh theo yêu cầu)
        const userForm = {
            balance: user.balance / 25,
            currency: "USD",
            // Các trường khác nếu cần
        };
        return res.status(200).json(userForm);
    } catch (error) {
        console.error("Lỗi khi lấy thông tin:", error);
        return res.status(500).json({
            error: "Lỗi khi lấy thông tin",
        });
    }
};
/* Hàm điều phối dựa trên giá trị của action trong body */
exports.routeRequest = async (req, res) => {
    const { action } = req.body;

    if (action === 'services') {
        // Gọi hàm lấy danh sách dịch vụ
        return exports.getServices(req, res);
    } else if (action === 'add') {
        // Gọi hàm tạo đơn hàng
        return exports.AddOrder(req, res);
    } else if (action === 'status') {
        // Gọi hàm tạo get trạng thái
        return exports.getOrderStatus(req, res);
    } else if (action === 'balance') {
        // Gọi hàm tạo get trạng thái
        return exports.getme(req, res);
    }
    else {
        return res.status(400).json({ error: "Action không hợp lệ" });
    }
};
