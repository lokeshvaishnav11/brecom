
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = Number(process.env.PORT || 4099);

const GATEWAY_URL = "https://www.lg-pay.com/api/order/create";

const APP_ID = process.env.LG_APP_ID;
const SECRET_KEY = process.env.LG_SECRET_KEY;

const USER_PHONE = "09876543211";
const USER_EMAIL = "member@gmail.com";
const USERNAME = "member";

const MINIMUM_MONEY = Number(
  process.env.MINIMUM_MONEY || 10
);

// Generate unique order ID
function getRechargeOrderId() {
  const date = new Date();

  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");

  const randomPart = crypto.randomInt(
    1000000000,
    10000000000
  );

  return datePart + randomPart;
}

// LG Pay MD5 signing
// Confirm exact signing format against your gateway documentation.
function md5_sign(params, secretKey) {
  const sortedKeys = Object.keys(params)
    .filter(
      (key) =>
        params[key] !== undefined &&
        params[key] !== null &&
        params[key] !== "" &&
        key !== "sign"
    )
    .sort();

  const signString = sortedKeys
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const finalString = `${signString}&key=${secretKey}`;

  return crypto
    .createHash("md5")
    .update(finalString)
    .digest("hex")
    .toUpperCase();
}

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Generate PIX payment URL
app.post("/api/payment", async (req, res) => {
  try {
    const money = Number(req.body.money);

    if (
      !Number.isFinite(money) ||
      money < MINIMUM_MONEY ||
      Math.round(money * 100) !== money * 100
    ) {
      return res.status(400).json({
        status: false,
        message: `Minimum payment is R$${MINIMUM_MONEY}`
      });
    }

    if (!APP_ID || !SECRET_KEY) {
      return res.status(500).json({
        status: false,
        message: "Gateway configuration missing"
      });
    }

    const orderId = getRechargeOrderId();

    const addon1 = [
      USERNAME,
      USER_PHONE,
      USER_EMAIL,
      0
    ].join("#");

    const params = {
      app_id: APP_ID,
      trade_type: "BRLPIX",
      order_sn: orderId,
      money: Math.round(money * 100),
      notify_url: process.env.PAYMENT_NOTIFY_URL,
      return_url: process.env.PAYMENT_RETURN_URL,
      subject: "PIX Payment"
    };

    const sign = md5_sign(params, SECRET_KEY);

    const payload = {
      ...params,
      sign
    };

    console.log("Creating PIX payment:", {
      orderId,
      money,
      phone: USER_PHONE,
      email: USER_EMAIL,
      addon1
    });

    const response = await axios.post(
      GATEWAY_URL,
      payload,
      {
        headers: {
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    const gatewayData = response.data;

    console.log("Gateway response:", gatewayData);

    if (
      Number(gatewayData?.status) === 1 &&
      gatewayData?.data?.pay_url
    ) {
      return res.status(200).json({
        status: true,
        message: "Payment URL generated successfully",
        orderId,
        money,
        currency: "BRL",
        payment_url: gatewayData.data.pay_url
      });
    }

    return res.status(502).json({
      status: false,
      message: "Gateway could not generate payment URL",
      gateway_message: gatewayData?.message || null
    });

  } catch (error) {
    console.error(
      "Payment error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      status: false,
      message: "Payment gateway error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
