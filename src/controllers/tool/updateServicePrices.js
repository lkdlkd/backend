const cron = require('node-cron');
const axios = require('axios');
const Service = require('../../models/server');
const SmmSv = require('../../models/SmmSv');

// Hàm kiểm tra và cập nhật giá dịch vụ
async function updateServicePrices() {
  try {
    // Lấy toàn bộ dịch vụ trong CSDL
    const services = await Service.find({});
    console.log(`Đang kiểm tra ${services.length} dịch vụ...`);

    // Duyệt qua từng dịch vụ
    for (const serviceItem of services) {
      try {
        // Lấy cấu hình API theo DomainSmm của dịch vụ hiện tại
        const smmSvConfig = await SmmSv.findOne({ name: serviceItem.DomainSmm });
        if (!smmSvConfig || !smmSvConfig.url_api || !smmSvConfig.api_token) {
          console.warn(`Cấu hình API chưa được thiết lập cho dịch vụ ${serviceItem.name}`);
          continue;
        }

        // Gọi API bên thứ 3 để lấy danh sách dịch vụ
        const apiResponse = await axios.post(smmSvConfig.url_api, {
          key: smmSvConfig.api_token,
          action: 'services'
        });

        if (!apiResponse.data || !Array.isArray(apiResponse.data)) {
          console.warn(`Dữ liệu API không hợp lệ cho dịch vụ ${serviceItem.name}`);
          continue;
        }

        // Tìm dịch vụ có serviceId tương ứng trong kết quả API (ép kiểu về Number nếu cần)
        const apiService = apiResponse.data.find(
          s => Number(s.service) === Number(serviceItem.serviceId)
        );
        if (!apiService) {
          console.warn(`Không tìm thấy dịch vụ ${serviceItem.serviceId} trong API cho ${serviceItem.name}`);
          continue;
        }

        // Lấy giá từ API và so sánh với giá trong CSDL (làm tròn 2 số thập phân)
        const apiRate = Math.ceil(apiService.rate * smmSvConfig.tigia * 1000) / 1000;
        const dbRate = parseFloat(serviceItem.rate.toFixed(2));

        console.log(`Dịch vụ ${serviceItem.name} - id ${serviceItem.serviceId} - Giá DB: ${dbRate}, Giá API: ${apiRate}`);

        // Nếu giá trong CSDL thấp hơn giá API thì cập nhật
        if (dbRate < apiRate) {
          const newRate = parseFloat((apiRate * 1.1).toFixed(2)); // cập nhật với 10% tăng thêm
           const giacu = serviceItem.rate 
          serviceItem.rate = newRate;
          await serviceItem.save();
          console.log(`Đã cập nhật giá của ${serviceItem.name} thành ${newRate}`);

          const taoluc = new Date();
          const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
          const telegramChatId = process.env.TELEGRAM_CHAT_ID;
          if (telegramBotToken && telegramChatId) {
            const telegramMessage = `📌 *Cập nhật giá!*\n\n` +
              `👤 *message:* Đã cập nhật giá của ${serviceItem.name} thành ${newRate} giá cũ ${giacu}.\n` +
              `👤 *Site:* ${smmSvConfig.name} .\n` +
              `🔹 *Tạo lúc:* ${taoluc.toLocaleString()}\n`;
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
        } else {
          console.log(`Giá của ${serviceItem.name} đã bằng hoặc cao hơn giá API, bỏ qua cập nhật.`);
        }
      } catch (innerError) {
        console.error(`Lỗi khi xử lý dịch vụ ${serviceItem.name}:`, innerError.message);
      }
    }
  } catch (error) {
    console.error("Lỗi khi lấy danh sách dịch vụ:", error.message);
  }
}

setInterval(() => {
  console.log("Cron job: Kiểm tra giá dịch vụ mỗi 30 giây");
  updateServicePrices();
}, 30000); // 30,000 milliseconds = 30 seconds
