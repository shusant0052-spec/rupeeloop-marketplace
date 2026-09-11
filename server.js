import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CASHFREE_ENV = process.env.CASHFREE_ENV || "sandbox";
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
).replace(/\/$/, "");

const PLATFORM_COMMISSION_PERCENT = Number(
  process.env.PLATFORM_COMMISSION_PERCENT || 5
);

const EASY_SPLIT_ENABLED =
  String(process.env.CASHFREE_EASY_SPLIT_ENABLED).toLowerCase() === "true";

const CASHFREE_BASE_URL =
  CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const CASHFREE_API_VERSION = "2025-01-01";

// This is demo data.
// In production, store listings and seller/vendor IDs in a database.
const listings = new Map([
  [
    "iphone-13",
    {
      id: "iphone-13",
      name: "iPhone 13",
      price: 36000,
      category: "Electronics",
      location: "Pune, Maharashtra",
      vendorId: "replace_with_cashfree_vendor_id"
    }
  ],
  [
    "urban-bike",
    {
      id: "urban-bike",
      name: "Urban commuter bike",
      price: 18500,
      category: "Vehicles",
      location: "Bengaluru, Karnataka",
      vendorId: "replace_with_cashfree_vendor_id"
    }
  ],
  [
    "study-table",
    {
      id: "study-table",
      name: "Solid wood study table",
      price: 7200,
      category: "Home",
      location: "Delhi, NCR",
      vendorId: "replace_with_cashfree_vendor_id"
    }
  ]
]);

// Temporary storage for demonstration.
// Use PostgreSQL, MySQL, MongoDB, or Supabase in production.
const tradeOrders = new Map();

app.use(cors());

// The webhook must receive the raw request body.
// Do this before express.json().
app.post(
  "/api/webhooks/cashfree",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const rawBody = req.body.toString("utf8");
      const timestamp = req.headers["x-webhook-timestamp"];
      const receivedSignature = req.headers["x-webhook-signature"];

      if (!timestamp || !receivedSignature) {
        return res.status(400).json({
          message: "Missing Cashfree webhook signature"
        });
      }

      const signaturePayload = `${timestamp}${rawBody}`;

      const expectedSignature = crypto
        .createHmac("sha256", CASHFREE_CLIENT_SECRET)
        .update(signaturePayload)
        .digest("base64");

      const isValid =
        expectedSignature.length === receivedSignature.length &&
        crypto.timingSafeEqual(
          Buffer.from(expectedSignature),
          Buffer.from(receivedSignature)
        );

      if (!isValid) {
        return res.status(401).json({
          message: "Invalid Cashfree webhook signature"
        });
      }

      const event = JSON.parse(rawBody);

      const eventName = String(
        event.type || event.event || event.data?.type || ""
      ).toUpperCase();

      const orderId =
        event.data?.order?.order_id ||
        event.data?.order_id ||
        event.data?.payment?.order_id ||
        event.data?.payment?.orderId;

      const paymentStatus = String(
        event.data?.payment?.payment_status ||
          event.data?.payment?.status ||
          ""
      ).toUpperCase();

      const successfulPayment =
        eventName.includes("SUCCESS") ||
        eventName.includes("PAID") ||
        paymentStatus === "SUCCESS" ||
        paymentStatus === "PAID";

      if (orderId && tradeOrders.has(orderId)) {
        const order = tradeOrders.get(orderId);

        order.lastWebhookEvent = eventName;
        order.updatedAt = new Date().toISOString();

        if (successfulPayment) {
          order.paymentStatus = "PAID";

          try {
            await splitPaidOrder(orderId, order);
          } catch (error) {
            console.error("Seller settlement failed:", error.message);
            order.settlementStatus = "FAILED";
            order.settlementError = error.message;
          }
        }
      }

      return res.json({ received: true });
    } catch (error) {
      console.error("Cashfree webhook error:", error);
      return res.status(500).json({
        message: "Webhook processing failed"
      });
    }
  }
);

app.use(express.json());

function cashfreeHeaders(apiVersion = CASHFREE_API_VERSION) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-version": apiVersion,
    "x-client-id": CASHFREE_CLIENT_ID,
    "x-client-secret": CASHFREE_CLIENT_SECRET
  };
}

async function cashfreeRequest(
  endpoint,
  {
    method = "GET",
    body,
    apiVersion = CASHFREE_API_VERSION,
    useIdempotencyKey = false
  } = {}
) {
  const headers = cashfreeHeaders(apiVersion);

  if (useIdempotencyKey) {
    headers["x-idempotency-key"] = crypto.randomUUID();
    headers["x-request-id"] = crypto.randomUUID();
  }

  const response = await fetch(`${CASHFREE_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.message ||
        `Cashfree request failed with status ${response.status}`
    );
  }

  return data;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function validPhone(phone) {
  return /^[6-9]\d{9}$/.test(String(phone));
}

function createOrderId() {
  return `rl_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

async function getCashfreeOrder(orderId) {
  return cashfreeRequest(`/orders/${encodeURIComponent(orderId)}`, {
    method: "GET"
  });
}

async function splitPaidOrder(orderId, order) {
  if (!EASY_SPLIT_ENABLED) {
    order.settlementStatus = "DISABLED";
    return;
  }

  if (order.splitSubmitted) {
    return;
  }

  if (
    !order.vendorId ||
    order.vendorId === "replace_with_cashfree_vendor_id"
  ) {
    throw new Error(
      "Replace the demo vendorId with a real Cashfree Easy Split vendor ID."
    );
  }

  const cashfreeOrder = await getCashfreeOrder(orderId);

  if (cashfreeOrder.order_status !== "PAID") {
    return;
  }

  await cashfreeRequest(
    `/easy-split/orders/${encodeURIComponent(orderId)}/split`,
    {
      method: "POST",
      apiVersion: "2022-09-01",
      body: {
        split: [
          {
            vendor_id: order.vendorId,
            amount: order.itemAmount,
            tags: {
              marketplace: "RupeeLoop",
              item_id: order.itemId,
              item_name: order.itemName
            }
          }
        ],
        disable_split: false
      }
    }
  );

  order.splitSubmitted = true;
  order.settlementStatus = "SUBMITTED";
  order.updatedAt = new Date().toISOString();
}

app.get("/api/config", (req, res) => {
  res.json({
    commissionPercent: PLATFORM_COMMISSION_PERCENT,
    currency: "INR",
    onlinePaymentsOnly: true
  });
});

app.post("/api/payments/create-order", async (req, res) => {
  try {
    if (!CASHFREE_CLIENT_ID || !CASHFREE_CLIENT_SECRET) {
      return res.status(500).json({
        message: "Cashfree credentials are missing in the .env file."
      });
    }

    const { itemId, customer } = req.body;

    if (!itemId || !customer) {
      return res.status(400).json({
        message: "Item and customer details are required."
      });
    }

    const item = listings.get(itemId);

    if (!item) {
      return res.status(404).json({
        message: "This listing was not found on the server."
      });
    }

    const customerName = String(customer.name || "").trim();
    const customerEmail = String(customer.email || "").trim();
    const customerPhone = String(customer.phone || "").trim();

    if (customerName.length < 2) {
      return res.status(400).json({
        message: "Please enter your full name."
      });
    }

    if (!customerEmail.includes("@")) {
      return res.status(400).json({
        message: "Please enter a valid email address."
      });
    }

    if (!validPhone(customerPhone)) {
      return res.status(400).json({
        message: "Please enter a valid 10-digit Indian mobile number."
      });
    }

    if (
      EASY_SPLIT_ENABLED &&
      (!item.vendorId ||
        item.vendorId === "replace_with_cashfree_vendor_id")
    ) {
      return res.status(400).json({
        message:
          "This seller is not ready to receive settlements. Add the seller as a Cashfree Easy Split vendor first."
      });
    }

    const itemAmount = roundMoney(Number(item.price));
    const commissionAmount = roundMoney(
      (itemAmount * PLATFORM_COMMISSION_PERCENT) / 100
    );
    const totalAmount = roundMoney(itemAmount + commissionAmount);
    const orderId = createOrderId();

    const orderRecord = {
      orderId,
      itemId: item.id,
      itemName: item.name,
      itemAmount,
      commissionAmount,
      totalAmount,
      vendorId: item.vendorId,
      customerName,
      customerEmail,
      customerPhone,
      paymentStatus: "CREATED",
      settlementStatus: EASY_SPLIT_ENABLED ? "PENDING" : "DISABLED",
      splitSubmitted: false,
      createdAt: new Date().toISOString()
    };

    const cashfreeOrder = await cashfreeRequest("/orders", {
      method: "POST",
      useIdempotencyKey: true,
      body: {
        order_id: orderId,
        order_amount: totalAmount,
        order_currency: "INR",

        customer_details: {
          customer_id: `customer_${crypto
            .randomBytes(6)
            .toString("hex")}`,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone
        },

        order_meta: {
          return_url: `${PUBLIC_BASE_URL}/?payment=done&order_id={order_id}`
        },

        order_note: `RupeeLoop trade for ${item.name}`,

        order_tags: {
          marketplace: "RupeeLoop",
          item_id: item.id,
          commission_percent: String(PLATFORM_COMMISSION_PERCENT)
        }
      }
    });

    tradeOrders.set(orderId, orderRecord);

    return res.json({
      orderId,
      paymentSessionId: cashfreeOrder.payment_session_id,
      itemAmount,
      commissionAmount,
      totalAmount,
      currency: "INR",
      commissionPercent: PLATFORM_COMMISSION_PERCENT
    });
  } catch (error) {
    console.error("Create payment order error:", error);

    return res.status(500).json({
      message: error.message || "Unable to create payment order."
    });
  }
});

app.get("/api/payments/status/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const cashfreeOrder = await getCashfreeOrder(orderId);
    const localOrder = tradeOrders.get(orderId);

    if (localOrder && cashfreeOrder.order_status === "PAID") {
      localOrder.paymentStatus = "PAID";

      try {
        await splitPaidOrder(orderId, localOrder);
      } catch (error) {
        localOrder.settlementStatus = "FAILED";
        localOrder.settlementError = error.message;
      }
    }

    return res.json({
      orderId,
      orderStatus: cashfreeOrder.order_status,
      paymentStatus: localOrder?.paymentStatus || "UNKNOWN",
      settlementStatus: localOrder?.settlementStatus || "UNKNOWN",
      itemName: localOrder?.itemName || null,
      itemAmount: localOrder?.itemAmount || null,
      commissionAmount: localOrder?.commissionAmount || null,
      totalAmount: localOrder?.totalAmount || cashfreeOrder.order_amount
    });
  } catch (error) {
    console.error("Payment status error:", error);

    return res.status(500).json({
      message: error.message || "Unable to check payment status."
    });
  }
});

// Serve the website from /public.
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`RupeeLoop running at ${PUBLIC_BASE_URL}`);
  console.log(`Easy Split enabled: ${EASY_SPLIT_ENABLED}`);
});
