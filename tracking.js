const button = document.getElementById("trackBtn");

button.addEventListener("click", async () => {
  const orderNumber = document.getElementById("orderNumber").value.trim();

  if (!orderNumber) {
    alert("Please enter an order number");
    return;
  }

  try {
    const response = await fetch(`https://felicia-bakes-backend.onrender.com{orderNumber}`);
    const data = await response.json();

    const result = document.getElementById("result");

    if (!data.success) {
      result.textContent = "Order not found";
      return;
    }

    result.innerHTML = `<strong>Status:</strong> ${data.status}`;
  } catch (error) {
    console.error(error);
    alert("Error connecting to server");
  }
});