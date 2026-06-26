/*
  Stock Dashboard Configuration
  --------------------------------
  1. Create a free Twelve Data API key: https://twelvedata.com/pricing
  2. Replace YOUR_TWELVE_DATA_API_KEY with your key.
  3. Add/remove tickers in the stocks array.

  Important: A static website exposes this key in the browser. That is acceptable for a
  small personal/free-tier project, but for a public site you should later move API calls
  behind a tiny backend/proxy such as Cloudflare Workers, Netlify Functions, or GitHub Actions.
*/
window.STOCK_DASHBOARD_CONFIG = {
  provider: "twelveData",
  apiKey: "7d3bbcb15ca14721ab851e524156c665",

  // Start small on the free tier. The free plan has credit limits.
  stocks: ["TSLA", "SOFI", "NVDA", "SCHD", "QQQ", "SPY"],

  // How often the dashboard may auto-refresh quote data.
  refreshIntervalMinutes: 15,

  // Historical daily candles are cached in the browser to reduce free API usage.
  cacheHistoryHours: 12,

  // Output size of daily candles. 390 trading days gives enough room for a 1-year lookback.
  historicalOutputSize: 390,

  currency: "USD"
};
