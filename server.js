const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

/* Root */
app.get("/", (req, res) => {
  res.send("Felicia Bakes API is running");
});

/* Create Order */
app.post("/orders", async (req, res) => {
  try {
    const countResult = await pool.query("SELECT COUNT(*) FROM orders");
    const nextNumber = Number(countResult.rows[0].count) + 1;
    const orderNumber = "FB" + String(nextNumber).padStart(3, "0");

    const {
      name,
      email,
      cakeSelected,
      cupcakeSelected,
      flavour,
      filling,
      cakeSize,
      designType,
      cupcakeTopping,
      cupcakeQuantity,
      colorScheme,
      message,
      dietary,
      occasion,
      eventDate,
      eventTime,
      totalPrice
    } = req.body;

    const result = await pool.query(
      `INSERT INTO orders (
        order_number, name, email, cake_selected, cupcake_selected,
        flavour, filling, cake_size, design_type, cupcake_topping,
        cupcake_quantity, color_scheme, message, dietary, occasion,
        event_date, event_time, total_price, status
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,
        $16,$17,$18,$19
      )
      RETURNING *`,
      [
        orderNumber,
        name,
        email,
        !!cakeSelected,
        !!cupcakeSelected,
        flavour || null,
        filling || null,
        cakeSize || null,
        designType || null,
        cupcakeTopping || null,
        Number(cupcakeQuantity || 0),
        colorScheme || null,
        message || null,
        dietary || null,
        occasion || null,
        eventDate || null,
        eventTime || null,
        totalPrice || 0,
        "Awaiting Payment"
      ]
    );

    const order = result.rows[0];

    res.json({
      orderNumber: order.order_number,
      name: order.name,
      email: order.email,
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
    console.error("Create order error:", error);
    res.status(500).json({ message: "Failed to create order" });
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

    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { status } = req.body;
    const allowed = ["Awaiting Payment", "In Progress", "Ready for Collection"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE LOWER(order_number) = LOWER($2)
       RETURNING *`,
      [status, req.params.orderNumber]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const order = result.rows[0];

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

/* Start Server */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});