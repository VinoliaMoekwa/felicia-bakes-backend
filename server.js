const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const FILE = "./orders.json";

function getOrders() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function saveOrders(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

app.get("/", (req, res) => {
  res.send("Felicia Bakes API is running");
});

/* create order */
app.post("/orders", (req, res) => {
  const orders = getOrders();
  const newOrderNumber = "FB" + String(orders.length + 1).padStart(3, "0");

  const newOrder = {
    orderNumber: newOrderNumber,
    ...req.body,
    status: "Awaiting Payment"
  };

  orders.push(newOrder);
  saveOrders(orders);

  res.json(newOrder);
});

/* track order */
app.get("/track/:orderNumber", (req, res) => {
  const orders = getOrders();

  const order = orders.find(
    (o) => o.orderNumber.toLowerCase() === req.params.orderNumber.toLowerCase()
  );

  if (!order) {
    return res.status(404).send("Order not found");
  }

  res.json(order);
});

/* update order status */
app.patch("/orders/:orderNumber/status", (req, res) => {
  const { orderNumber } = req.params;
  const { status } = req.body;

  const allowedStatuses = [
    "Awaiting Payment",
    "In Progress",
    "Ready for Collection"
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const orders = getOrders();

  const orderIndex = orders.findIndex(
    (o) => o.orderNumber.toLowerCase() === orderNumber.toLowerCase()
  );

  if (orderIndex === -1) {
    return res.status(404).json({ message: "Order not found" });
  }

  orders[orderIndex].status = status;
  saveOrders(orders);

  res.json({
    message: "Order status updated",
    order: orders[orderIndex]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});