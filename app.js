require('dotenv').config();
const express = require('express');
const connectDB = require('./database/connection');
require('./controllers/tool/updateServicePrices');
require('./controllers/tool/checkOrderStatus');
require('./controllers/tool/RechargeCardController');
require('./controllers/tool/RestThang');
require('./controllers/tool/laytrangthaicard');
const cors = require('cors');
const api = require('./routes/api');
const app = express();
const noti = require('./routes/website/notificationsRouter');
app.use(express.json());
app.use(cors());

// Kết nối MongoDB
connectDB();
app.get('/', (req, res) => {
    res.send('API is running...');
});
// Sử dụng routes cho API
app.use('/api', api);
app.use('/api/noti', noti);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));


