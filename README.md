# RupeeLoop Marketplace

A peer-to-peer marketplace with secure online payments powered by Cashfree Payment Gateway and Easy Split vendor settlements.

## Features

- ✅ Secure online payment processing with Cashfree
- ✅ Automatic seller commission calculation
- ✅ Easy Split integration for vendor payouts
- ✅ Real-time payment status tracking
- ✅ Webhook-based order updates
- ✅ Mobile-responsive design

## Prerequisites

- Node.js 16+ and npm
- Cashfree merchant account with API credentials
- Sandbox API keys for testing

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file with your Cashfree credentials:

```env
PORT=3000
CASHFREE_ENV=sandbox
CASHFREE_CLIENT_ID=your_cashfree_app_id
CASHFREE_CLIENT_SECRET=your_cashfree_secret_key
PLATFORM_COMMISSION_PERCENT=5
CASHFREE_EASY_SPLIT_ENABLED=false
PUBLIC_BASE_URL=http://localhost:3000
```

### 3. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server runs on `http://localhost:3000` by default.

## API Endpoints

### GET /api/config
Returns platform configuration including commission percentage and currency.

### POST /api/payments/create-order
Creates a new payment order.

**Request body:**
```json
{
  "itemId": "iphone-13",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210"
  }
}
```

**Response:**
```json
{
  "orderId": "rl_1234567890_abc123",
  "paymentSessionId": "cashfree_session_id",
  "itemAmount": 36000,
  "commissionAmount": 1800,
  "totalAmount": 37800,
  "currency": "INR",
  "commissionPercent": 5
}
```

### GET /api/payments/status/:orderId
Retrieve payment and settlement status for an order.

### POST /api/webhooks/cashfree
Webhook endpoint for Cashfree payment notifications.

## Enabling Easy Split

1. Activate Easy Split in your Cashfree merchant dashboard
2. Register sellers as Cashfree vendors and get their vendor IDs
3. Update the `vendorId` field for each listing in `server.js`
4. Set `CASHFREE_EASY_SPLIT_ENABLED=true` in `.env`

## Project Structure

```
rupeeloop-marketplace/
├── server.js              # Express backend
├── package.json           # Dependencies
├── .env                   # Configuration (add your credentials)
├── .gitignore             # Git ignore rules
└── public/
    ├── index.html         # Frontend UI
    └── app.js             # Frontend JavaScript
```

## Security Considerations

- All payment data is handled by Cashfree's secure infrastructure
- Webhook signatures are verified using HMAC-SHA256
- Use HTTPS in production
- Protect your API credentials in the `.env` file
- Never commit `.env` to version control

## Database

Currently uses in-memory storage for demo purposes. For production:

- Replace `Map()` with PostgreSQL, MySQL, MongoDB, or Supabase
- Persist orders, customers, and settlements
- Implement proper transaction handling

## Deployment

### Render, Vercel, or similar platforms:

1. Set environment variables in your platform's dashboard
2. Deploy the repository
3. Update `PUBLIC_BASE_URL` to your deployment URL
4. Configure Cashfree webhook URL to `https://your-domain.com/api/webhooks/cashfree`

## Support

For Cashfree API issues, refer to:
- [Cashfree Payment Gateway Docs](https://telr-docs.cashfree.com)
- [Cashfree Easy Split Docs](https://telr-docs.cashfree.com/api-reference/payments/latest/easy-split)

## License

MIT
