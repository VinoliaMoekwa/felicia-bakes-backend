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

app.get("/", (req, res) => {
  res.send("Felicia Bakes API is running");
});

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

app