const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is working");
});

const orders = [
  { orderNumber: "FB001", status: "Awaiting Payment" },
  { orderNumber: "FB002", status: "In Progress" },
  { orderNumber: "FB003", status: "Ready for Collection" }
];

app.get("/track/:orderNumber", (req, res) => {
  const order = orders.find(
    o => o.orderNumber.toLowerCase() === req.params.orderNumber.toLowerCase()
  );

  if (!order) {
    return res.send("Order not found");
  }

  res.json(order);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});