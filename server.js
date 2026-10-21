const fs = require("node:fs");
// Render secret file is provisioned privately, never committed to Git.
if (process.env.RENDER && fs.existsSync("/etc/secrets/felicia-dashboard.env")) {
  process.loadEnvFile("/etc/secrets/felicia-dashboard.env");
}
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { sendOrderEmail } = require("./order-email");

function createApp({ pool: suppliedPool, env = process.env, mail = null, notifyOrder = sendOrderEmail } = {}) {
const app = express();
if(env.RENDER)app.set("trust proxy",1);
const PORT = env.PORT || 3000;

app.use(cors());
const jsonBody=express.json();app.use((req,res,next)=>req.path==='/admin/api/mail/send'?next():jsonBody(req,res,next));

const pool = suppliedPool || new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

const { updateOrderStatus } = require("./order-status");
const admin = require("./admin").installAdmin(app, pool, { env, mail, updateOrder: (number, status) => updateOrderStatus(pool, number, status) });

/* Root */
app.get("/", (req, res) => {
  res.send("Felicia Bakes API is running");
});

/* Create Order */
app.post("/orders", async (req, res) => {
  try {
    const {order,created} = await require('./create-quote').createQuote(pool,req.body);
    let notification = {status:'not-resent'};
    if (created) {
      // The quote is already committed. Delivery failure must not turn a saved
      // request into an apparent creation failure that invites another order.
      try { notification = await notifyOrder(order,{env}); }
      catch { notification = {status:'failed'}; }
      if (notification.status !== 'sent') {
        console.warn('Order email notification:',notification.status,notification.code||'');
      }
    }

    res.json({
      emailNotification: notification.status,
      duplicate: !created,
      orderNumber: order.order_number,
      name: order.name,
      email: order.email,
      phoneNumber: order.phone_number,
      cakeSelected: order.cake_selected,
      cupcakeSelected: order.cupcake_selected,
      flavour: order.flavour,
      filling: order.filling,
      cakeSize: order.cake_size,
      designType: order.design_type,
      cupcakeTopping: order.cupcake_topping,
      cupcakeQuantity: order.cupcake_quantity,
      colorScheme: order.color_scheme,
      message: order.message,
      dietary: order.dietary,
      occasion: order.occasion,
      eventDate: order.event_date,
      eventTime: order.event_time,
      totalPrice: order.total_price,
      status: order.status
    });

  } catch (error) {
    console.error("Create order error:", error.code || "request-failed");
    res.status(500).json({
      message: "Failed to create order"
    });
  }
});

/* Track Order */
app.get("/track/:orderNumber", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE LOWER(order_number) = LOWER($1)",
      [req.params.orderNumber]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Order not found");
    }

    const order = result.rows[0];

    res.json({
      orderNumber: order.order_number,
      status: order.status
    });
  } catch (error) {
    console.error("Track order error:", error);
    res.status(500).send("Server error");
  }
});

/* 🔐 Update Order Status (Protected) */
app.patch("/orders/:orderNumber/status", async (req, res) => {
  try {
    const adminToken = req.headers["x-admin-token"];

    if (!adminToken || adminToken !== env.ADMIN_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { status } = req.body;
    const allowed = [
      "Quote Requested",
      "Deposit Paid",
      "Design Confirmed",
      "Baking",
      "Decorating",
      "Ready for Collection",
      "Collected"
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await updateOrderStatus(pool, req.params.orderNumber, status);
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.json({
      message: "Order status updated",
      order: {
        orderNumber: order.order_number,
        status: order.status
      }
    });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
});

return { app, close: admin.close, pool };
}
if (require.main === module) {
 const { app } = createApp({ mail: require("./mailbox").createMailbox() });
 const PORT = process.env.PORT || 3000;
 app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports={createApp};
