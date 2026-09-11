let items = [];
let selectedTradeItem = null;
let platformCommissionPercent = 5;

const defaultItems = [
  {
    id: "iphone-13",
    name: "iPhone 13",
    category: "Electronics",
    price: 36000,
    location: "Pune, Maharashtra",
    emoji: "📱"
  },
  {
    id: "urban-bike",
    name: "Urban commuter bike",
    category: "Vehicles",
    price: 18500,
    location: "Bengaluru, Karnataka",
    emoji: "🚲"
  },
  {
    id: "study-table",
    name: "Solid wood study table",
    category: "Home",
    price: 7200,
    location: "Delhi, NCR",
    emoji: "🪑"
  }
];

fetch("/api/config")
  .then(response => response.json())
  .then(config => {
    platformCommissionPercent = Number(config.commissionPercent || 5);
  })
  .catch(() => {
    platformCommissionPercent = 5;
  });

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRupees(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function renderItems() {
  const container = document.getElementById("itemsContainer");
  container.innerHTML = items.map(item => `
    <div class="item-card">
      <div class="item-emoji">${item.emoji}</div>
      <div class="item-content">
        <div class="item-category">${escapeHtml(item.category)}</div>
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-location">📍 ${escapeHtml(item.location)}</div>
        <div class="item-price">${formatRupees(item.price)}</div>
        <button class="offer-button" onclick="startTrade('${escapeHtml(item.id)}')">Pay & trade</button>
      </div>
    </div>
  `).join('');
}

function startTrade(itemId) {
  selectedTradeItem = items.find(item => item.id === itemId);

  if (!selectedTradeItem) {
    showPaymentStatus("This item is not available for online payment yet.");
    return;
  }

  document.getElementById("tradeItemName").textContent = selectedTradeItem.name;
  updateTradeSummary();
  document.getElementById("tradeModal").classList.add("open");
}

function updateTradeSummary() {
  if (!selectedTradeItem) return;

  const itemPrice = Number(selectedTradeItem.price);
  const commission = Math.round((itemPrice * platformCommissionPercent) / 100);
  const total = itemPrice + commission;

  document.getElementById("tradeSummary").innerHTML = `
    <div class="summary-row">
      <span>Item value</span>
      <strong>${formatRupees(itemPrice)}</strong>
    </div>
    <div class="summary-row">
      <span>RupeeLoop platform fee (${platformCommissionPercent}%)</span>
      <strong>${formatRupees(commission)}</strong>
    </div>
    <div class="summary-row total">
      <span>Total payable online</span>
      <strong>${formatRupees(total)}</strong>
    </div>
  `;
}

function closeTradeModal() {
  document.getElementById("tradeModal").classList.remove("open");
}

function showPaymentStatus(message) {
  const box = document.getElementById("paymentStatus");
  box.textContent = message;
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 6000);
}

document.getElementById("tradeForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!selectedTradeItem) {
    showPaymentStatus("Please select an item first.");
    return;
  }

  const button = document.getElementById("payTradeButton");

  const customer = {
    name: document.getElementById("buyerName").value.trim(),
    email: document.getElementById("buyerEmail").value.trim(),
    phone: document.getElementById("buyerPhone").value.trim()
  };

  button.disabled = true;
  button.textContent = "Preparing secure checkout...";

  try {
    const response = await fetch("/api/payments/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        itemId: selectedTradeItem.id,
        customer
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to create payment order.");
    }

    closeTradeModal();

    const cashfree = Cashfree({
      mode: window.location.hostname === "localhost" ? "sandbox" : "production"
    });

    await cashfree.checkout({
      paymentSessionId: result.paymentSessionId,
      redirectTarget: "_self"
    });
  } catch (error) {
    showPaymentStatus(error.message);
    button.disabled = false;
    button.textContent = "Continue to secure payment";
  }
});

async function checkPaymentResult() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("payment") !== "done") {
    return;
  }

  const orderId = params.get("order_id");

  if (!orderId) {
    showPaymentStatus("Payment returned without an order number.");
    return;
  }

  try {
    const response = await fetch(`/api/payments/status/${encodeURIComponent(orderId)}`);
    const result = await response.json();

    if (result.orderStatus === "PAID") {
      showPaymentStatus(
        `Payment successful. Your trade for ${result.itemName || "this item"} is confirmed.`
      );
    } else {
      showPaymentStatus(
        "Payment is still being confirmed. Please check your email shortly."
      );
    }
  } catch {
    showPaymentStatus(
      "We received your payment return. Please refresh after a few seconds."
    );
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

function initialize() {
  items = defaultItems;
  renderItems();
  checkPaymentResult();
}

window.addEventListener("load", initialize);
