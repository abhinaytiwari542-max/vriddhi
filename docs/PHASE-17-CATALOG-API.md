# Catalog API — for AI buyers and other external agents

Unlike every other route in this app, `/api/catalog` is deliberately
**public** — no session, no merchant auth. It exists specifically so an
external AI agent (an "AI buyer," Phase 18) can discover and query this
merchant's product catalog without any human-facing UI in the loop.

## Contract note: prices are in rupees, not paise

Internally, `Product.price` is stored in paise (Razorpay's convention —
`299900` = ₹2,999). The catalog API deliberately does **not** leak that —
every price in this API is a plain INR number (`2999`, or `2999.5` if
fractional). An external consumer of this API should never need to know
our internal storage unit. This conversion happens once, in
`src/lib/services/catalog.ts`.

## `GET /api/catalog` — list / search

### Query parameters (all optional)

| Param | Type | Meaning |
|---|---|---|
| `q` | string | Case-insensitive substring match on product name |
| `available` | `"true"` \| `"false"` | Filter by stock availability |
| `max_price` | number (rupees) | Only products at or below this price |
| `min_price` | number (rupees) | Only products at or above this price |
| `limit` | number | Max results (default 50, capped at 100) |
| `offset` | number | Pagination offset |

### Real example — verified live, not illustrative

Request:
```
GET /api/catalog?q=Running&max_price=3000
```

Response (`200 OK`):
```json
{
  "products": [
    {
      "product_id": "cmt2rdbiy000dvfx4l83uy63f",
      "name": "Lightweight Running Cap",
      "price": 599,
      "currency": "INR",
      "available": true,
      "variants": ["Free size"],
      "delivery_estimate": "2-4 days"
    },
    {
      "product_id": "cmt2rdbiy0003vfx4d6gqbk0f",
      "name": "Trailblazer Running Shoes",
      "price": 2999,
      "currency": "INR",
      "available": true,
      "variants": ["7", "8", "9", "10", "11"],
      "delivery_estimate": "2-4 days"
    }
  ],
  "total": 2
}
```

This is the exact query an AI buyer answering "find running shoes under
₹3,000" (Phase 18) would make.

### Errors

A non-numeric `max_price`/`min_price`/`limit`/`offset` returns `400`:
```json
{ "error": "max_price, min_price, limit, and offset must be numbers." }
```

## `GET /api/catalog/:product_id` — single product detail

Request:
```
GET /api/catalog/cmt2rdbiy000fvfx48maycaph
```

Response (`200 OK`):
```json
{
  "product_id": "cmt2rdbiy000fvfx48maycaph",
  "name": "All-Terrain Sandals",
  "price": 1499,
  "currency": "INR",
  "available": false,
  "variants": ["7", "8", "9", "10"],
  "delivery_estimate": "3-5 days"
}
```

Unknown `product_id` returns `404`:
```json
{ "error": "No product found with product_id \"does-not-exist\"." }
```

## CORS

Both endpoints send:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```
so a browser-based agent on another origin can call this directly, not
just a server-to-server caller. `OPTIONS` preflight is handled on both
routes.

## What this does not do (by design)

- No mutation — this is read-only. Creating an order against a catalog
  product is Phase 18/19's job, through its own guarded flow.
- No per-merchant API key — there's only one demo merchant right now
  (see Phase 0 non-goals: no multi-tenant SaaS in this MVP), so the
  catalog is scoped to "the" merchant rather than requiring a merchant
  identifier in the request. A real multi-tenant version would need one.
