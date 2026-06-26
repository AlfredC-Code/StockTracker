# Stock Price Dashboard

A simple static website for tracking a configurable list of stocks and ETFs.

## What it shows

Each configured stock is shown in a row with:

1. Current price
2. 24 hour % change
3. 7 day % change
4. 1 month % change
5. 3 month % change
6. 6 month price change, displayed as dollar change plus percent in parentheses
7. 1 year price change, displayed as dollar change plus percent in parentheses

The app is designed to be easy to expand. Table columns live in the `METRICS` array in `app.js`, and the stock symbols live in `config.js`.

## API used

This starter uses Twelve Data:

- Quote endpoint for the current/latest price and previous close.
- Time series endpoint for daily historical prices.

Create a free API key from Twelve Data and paste it into `config.js`.

```js
window.STOCK_DASHBOARD_CONFIG = {
  provider: "twelveData",
  apiKey: "YOUR_TWELVE_DATA_API_KEY",
  stocks: ["AAPL", "MSFT", "NVDA", "SCHD"]
};
```

## Run locally

Because browsers may restrict some local file behavior, serve the folder with a tiny local web server:

```powershell
cd stock-dashboard
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Host on GitHub Pages

1. Create a GitHub repo.
2. Upload `index.html`, `styles.css`, `config.js`, `app.js`, and `README.md`.
3. Go to **Settings > Pages**.
4. Select **Deploy from a branch**.
5. Choose your main branch and root folder.
6. Save.

## Important security note

A static website exposes API keys in the browser. For a private/personal dashboard using a free key, that may be acceptable. For a public site, put the API call behind a backend/proxy such as:

- Cloudflare Worker
- Netlify Function
- Vercel Function
- GitHub Action that writes a JSON file your page reads

That keeps the API key out of the browser and makes rate limiting easier.

## How the calculations work

The current price comes from the quote endpoint. For 7d, 1m, and 3m, the app compares the current price against the closest available daily close on or before the target lookback date and displays the percent change. For 6m and 1y, it displays the dollar price change plus the percent change in parentheses. For example, if the exact lookback date falls on a weekend or market holiday, it uses the previous trading day's close.
