const cron = require('node-cron');
const Order = require('../../models/Order');
const Service = require('../../models/server'); // Đảm bảo đúng tên file model
const SmmSv = require('../../models/SmmSv');
const SmmApiService = require('../Smm/smmServices');

function mapStatus(apiStatus) {
  switch (apiStatus) {
    case "Processing":
      return "Processing";
    case "Completed":
      return "Completed";
    case "In progress":
      return "In progress";
    case "Canceled":
      return "Canceled";
    default:
      return null;
  }
}

async function checkOrderStatus() {
  try {
    const runningOrders = await Order.find({
      status: { $in: ["Pending", "In progress", "Processing"] }
    });
    if (runningOrders.length === 0) {
      console.log("Không có đơn hàng đang chạy.");
      return;
    }
    console.log(`Đang kiểm tra trạng thái của ${runningOrders.length} đơn hàng...`);

    // Cache cho Service và SmmSv để tránh truy vấn lặp lại
    const serviceCache = {};
    const smmConfigCache = {};
    const groups = {};

    for (const order of runningOrders) {
      // Cache Service
      let service = serviceCache[order.SvID];
      if (!service) {
        service = await Service.findOne({ serviceId: order.SvID });
        if (!service) {
          console.warn(`Không tìm thấy dịch vụ cho đơn ${order.Madon} (namesv: ${order.namesv})`);
          continue;
        }
        serviceCache[order.SvID] = service;
      }

      // Cache SmmSv
      let smmConfig = smmConfigCache[service.DomainSmm];
      if (!smmConfig) {
        smmConfig = await SmmSv.findOne({ name: service.DomainSmm });
        if (!smmConfig || !smmConfig.url_api || !smmConfig.api_token) {
          console.warn(`Cấu hình SMM không hợp lệ cho dịch vụ ${service.name}`);
          continue;
        }
        smmConfigCache[service.DomainSmm] = smmConfig;
      }

      const groupKey = smmConfig._id.toString();
      if (!groups[groupKey]) {
        groups[groupKey] = {
          smmService: new SmmApiService(smmConfig.url_api, smmConfig.api_token),
          orders: [],
        };
      }
      groups[groupKey].orders.push(order);
    }

    // Duyệt qua từng nhóm và gọi API kiểm tra trạng thái
    for (const groupKey in groups) {
      const { smmService, orders } = groups[groupKey];

      if (orders.length === 1) {
        const order = orders[0];
        try {
          const statusObj = await smmService.status(order.orderId);
          console.log(`API trả về cho đơn ${order.orderId}:`, statusObj);

          const mappedStatus = mapStatus(statusObj.status);
          if (mappedStatus !== null) order.status = mappedStatus;
          if (statusObj.start_count !== undefined) order.start = statusObj.start_count;
          if (statusObj.remains !== undefined) order.dachay = order.quantity - statusObj.remains;

          await order.save();
          console.log(`Đã cập nhật đơn ${order.Madon}: status = ${order.status}, dachay = ${order.dachay}`);
        } catch (apiError) {
          console.error(`Lỗi API trạng thái cho đơn ${order.orderId}:`, apiError.message);
        }
      } else {
        // Multi status
        const orderIds = orders.map(order => order.orderId);
        try {
          const data = await smmService.multiStatus(orderIds);
          console.log(`API trả về cho các đơn:`, data);

          for (const orderId in data) {
            if (data.hasOwnProperty(orderId)) {
              const statusObj = data[orderId];
              const order = orders.find(o => o.orderId.toString() === orderId);
              if (order) {
                const mappedStatus = mapStatus(statusObj.status);
                if (mappedStatus !== null) order.status = mappedStatus;
                if (statusObj.start_count !== undefined) order.start = statusObj.start_count;
                if (statusObj.remains !== undefined) order.dachay = order.quantity - statusObj.remains;
                await order.save();
                console.log(`Đã cập nhật đơn ${order.Madon}: status = ${order.status}, dachay = ${order.dachay}`);
              } else {
                console.warn(`Không tìm thấy đơn nào tương ứng với orderId ${orderId}`);
              }
            }
          }
        } catch (apiError) {
          console.error(`Lỗi API trạng thái cho nhóm đơn:`, apiError.message);
        }
      }
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái đơn hàng:", error.message);
  }
}

// Đặt lịch chạy cron job, ví dụ: chạy mỗi 1 phút
cron.schedule('*/3 * * * *', () => {
  console.log("Cron job: Bắt đầu kiểm tra trạng thái đơn hàng");
  checkOrderStatus();
});

