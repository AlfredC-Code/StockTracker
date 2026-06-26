const CONFIG = window.STOCK_DASHBOARD_CONFIG ?? {};
const API_BASE = "https://api.twelvedata.com";

const LOOKBACKS = {
  oneDay: { label: "24h %", days: 1, type: "percent" },
  sevenDays: { label: "7d %", days: 7, type: "percent" },
  oneMonth: { label: "1m %", days: 30, type: "percent" },
  threeMonths: { label: "3m %", days: 90, type: "percent" },
  sixMonths: { label: "6m Change", days: 182, type: "price" },
  oneYear: { label: "1y Change", days: 365, type: "price" }
};

// Add future columns here. Each metric receives the normalized stock row.
const METRICS = [
  { key: "symbol", label: "Symbol", render: row => symbolCell(row) },
  { key: "currentPrice", label: "Current Price", render: row => money(row.currentPrice) },
  { key: "oneDay", label: LOOKBACKS.oneDay.label, render: row => percentCell(row.changes.oneDay) },
  { key: "sevenDays", label: LOOKBACKS.sevenDays.label, render: row => percentCell(row.changes.sevenDays) },
  { key: "oneMonth", label: LOOKBACKS.oneMonth.label, render: row => percentCell(row.changes.oneMonth) },
  { key: "threeMonths", label: LOOKBACKS.threeMonths.label, render: row => percentCell(row.changes.threeMonths) },
  { key: "sixMonths", label: LOOKBACKS.sixMonths.label, render: row => moneyChangeCell(row.priceChanges.sixMonths, row.changes.sixMonths) },
  { key: "oneYear", label: LOOKBACKS.oneYear.label, render: row => moneyChangeCell(row.priceChanges.oneYear, row.changes.oneYear) },
  { key: "status", label: "Updated", render: row => `<span class="status">${escapeHtml(row.updatedAt || "—")}</span>` }
];

const els = {
  header: document.getElementById("tableHeader"),
  body: document.getElementById("stockTableBody"),
  refreshButton: document.getElementById("refreshButton"),
  lastUpdated: document.getElementById("lastUpdated"),
  setupMessage: document.getElementById("setupMessage")
};

document.addEventListener("DOMContentLoaded", () => {
  renderHeader();
  els.refreshButton.addEventListener("click", () => loadDashboard({ forceRefresh: true }));
  loadDashboard({ forceRefresh: false });

  const refreshMinutes = Number(CONFIG.refreshIntervalMinutes || 0);
  if (refreshMinutes > 0) {
    setInterval(() => loadDashboard({ forceRefresh: true }), refreshMinutes * 60 * 1000);
  }
});

async function loadDashboard({ forceRefresh }) {
  clearMessage();
  renderLoadingRows();

  if (!CONFIG.apiKey || CONFIG.apiKey === "YOUR_TWELVE_DATA_API_KEY") {
    showMessage(`<strong>Setup needed:</strong> add your Twelve Data API key in <code>config.js</code>. The table below is sample data so you can see the layout.`);
    const demoRows = buildDemoRows();
    renderRows(demoRows);
    els.lastUpdated.textContent = "Sample data loaded";
    return;
  }

  const stocks = normalizeSymbols(CONFIG.stocks);
  if (!stocks.length) {
    showMessage(`<strong>No symbols configured:</strong> add tickers to <code>stocks</code> in <code>config.js</code>.`);
    els.body.innerHTML = "";
    return;
  }

  setLoading(true);
  try {
    const rows = [];
    for (const symbol of stocks) {
      const row = await fetchStockRow(symbol, { forceRefresh });
      rows.push(row);
      renderRows(rows, stocks.length);
    }
    renderRows(rows);
    els.lastUpdated.textContent = `Last updated ${new Date().toLocaleString()}`;
  } catch (err) {
    console.error(err);
    showMessage(`<strong>API error:</strong> ${escapeHtml(err.message)}. Check your API key, symbol list, or free-tier quota.`);
  } finally {
    setLoading(false);
  }
}

async function fetchStockRow(symbol, { forceRefresh }) {
  const [quote, history] = await Promise.all([
    twelveDataQuote(symbol),
    getHistoricalDaily(symbol, { forceRefresh })
  ]);

  const currentPrice = firstNumber(quote.close, quote.price, quote.last, latestClose(history));
  const previousClose = firstNumber(quote.previous_close, getLookbackPrice(history, 1));

  const changes = {};
  const priceChanges = {};
  for (const [key, lookback] of Object.entries(LOOKBACKS)) {
    const oldPrice = key === "oneDay" ? previousClose : getLookbackPrice(history, lookback.days);
    changes[key] = calculatePercentChange(currentPrice, oldPrice);
    priceChanges[key] = calculatePriceChange(currentPrice, oldPrice);
  }

  return {
    symbol,
    name: quote.name || quote.symbol || "",
    currentPrice,
    changes,
    priceChanges,
    updatedAt: quote.datetime || new Date().toLocaleString()
  };
}

async function twelveDataQuote(symbol) {
  const url = buildUrl("/quote", {
    symbol,
    apikey: CONFIG.apiKey
  });
  const data = await fetchJson(url);
  throwIfApiError(data, symbol, "quote");
  return data;
}

async function getHistoricalDaily(symbol, { forceRefresh }) {
  const cacheKey = `stock-history:${symbol}`;
  const cacheHours = Number(CONFIG.cacheHistoryHours ?? 12);

  if (!forceRefresh) {
    const cached = readCache(cacheKey, cacheHours);
    if (cached) return cached;
  }

  const url = buildUrl("/time_series", {
    symbol,
    interval: "1day",
    outputsize: CONFIG.historicalOutputSize || 390,
    order: "DESC",
    apikey: CONFIG.apiKey
  });
  const data = await fetchJson(url);
  throwIfApiError(data, symbol, "time_series");

  const values = Array.isArray(data.values) ? data.values : [];
  if (!values.length) {
    throw new Error(`No historical values returned for ${symbol}.`);
  }

  writeCache(cacheKey, values);
  return values;
}

function getLookbackPrice(history, daysBack) {
  if (!history?.length) return null;

  const target = new Date();
  target.setDate(target.getDate() - daysBack);
  target.setHours(23, 59, 59, 999);

  const sorted = [...history].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  const match = sorted.find(item => new Date(item.datetime) <= target);
  return firstNumber(match?.close, match?.adjusted_close);
}

function latestClose(history) {
  if (!history?.length) return null;
  return firstNumber(history[0].close, history[0].adjusted_close);
}

function calculatePercentChange(current, oldPrice) {
  current = Number(current);
  oldPrice = Number(oldPrice);
  if (!Number.isFinite(current) || !Number.isFinite(oldPrice) || oldPrice === 0) return null;
  return ((current - oldPrice) / oldPrice) * 100;
}

function calculatePriceChange(current, oldPrice) {
  current = Number(current);
  oldPrice = Number(oldPrice);
  if (!Number.isFinite(current) || !Number.isFinite(oldPrice)) return null;
  return current - oldPrice;
}

function renderHeader() {
  els.header.innerHTML = METRICS.map(metric => `<th scope="col">${escapeHtml(metric.label)}</th>`).join("");
}

function renderLoadingRows() {
  const stocks = normalizeSymbols(CONFIG.stocks);
  const count = stocks.length || 4;
  els.body.innerHTML = Array.from({ length: count }, (_, index) => `
    <tr>
      <td colspan="${METRICS.length}" class="status">${index === 0 ? "Loading stock data…" : ""}</td>
    </tr>
  `).join("");
}

function renderRows(rows, expectedCount = rows.length) {
  const placeholderCount = Math.max(0, expectedCount - rows.length);
  els.body.innerHTML = [
    ...rows.map(row => `
      <tr>
        ${METRICS.map(metric => `<td>${metric.render(row)}</td>`).join("")}
      </tr>
    `),
    ...Array.from({ length: placeholderCount }, () => `<tr><td colspan="${METRICS.length}" class="status">Loading…</td></tr>`)
  ].join("");
}

function symbolCell(row) {
  return `<span class="symbol">${escapeHtml(row.symbol)}</span>${row.name ? `<span class="company">${escapeHtml(row.name)}</span>` : ""}`;
}

function money(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: CONFIG.currency || "USD",
    maximumFractionDigits: num >= 100 ? 2 : 4
  }).format(num);
}

function percentCell(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return `<span class="neutral">—</span>`;
  }
  const num = Number(value);
  const css = num > 0 ? "positive" : num < 0 ? "negative" : "neutral";
  const sign = num > 0 ? "+" : "";
  return `<span class="${css}">${sign}${num.toFixed(2)}%</span>`;
}

function moneyChangeCell(priceChange, percentChange) {
  if (priceChange === null || priceChange === undefined || !Number.isFinite(Number(priceChange))) {
    return `<span class="neutral">—</span>`;
  }
  const num = Number(priceChange);
  const pct = Number(percentChange);
  const css = num > 0 ? "positive" : num < 0 ? "negative" : "neutral";
  const sign = num > 0 ? "+" : "";
  const moneyText = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: CONFIG.currency || "USD",
    maximumFractionDigits: Math.abs(num) >= 100 ? 2 : 4
  }).format(Math.abs(num));
  const pctText = Number.isFinite(pct) ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%)` : "";
  return `<span class="${css}">${sign}${moneyText}${pctText}</span>`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from market data API.`);
  }
  return response.json();
}

function throwIfApiError(data, symbol, endpoint) {
  if (!data) throw new Error(`Empty ${endpoint} response for ${symbol}.`);
  if (data.status === "error") throw new Error(`${symbol} ${endpoint}: ${data.message || "unknown API error"}`);
  if (data.code && data.message) throw new Error(`${symbol} ${endpoint}: ${data.message}`);
}

function buildUrl(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

function normalizeSymbols(stocks) {
  return [...new Set((stocks || [])
    .map(symbol => String(symbol).trim().toUpperCase())
    .filter(Boolean))];
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readCache(key, maxAgeHours) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ageMs = Date.now() - parsed.savedAt;
    if (ageMs > maxAgeHours * 60 * 60 * 1000) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Ignore cache errors, usually private browsing or localStorage quota.
  }
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.textContent = isLoading ? "Refreshing…" : "Refresh";
}

function showMessage(html) {
  els.setupMessage.innerHTML = html;
  els.setupMessage.classList.remove("hidden");
}

function clearMessage() {
  els.setupMessage.innerHTML = "";
  els.setupMessage.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildDemoRows() {
  return [
    { symbol: "AAPL", name: "Apple Inc.", currentPrice: 199.45, changes: { oneDay: 0.42, sevenDays: 1.81, oneMonth: -2.14, threeMonths: 7.92, sixMonths: 12.33, oneYear: 18.67 }, priceChanges: { sixMonths: 21.92, oneYear: 31.36 }, updatedAt: "Demo" },
    { symbol: "MSFT", name: "Microsoft Corporation", currentPrice: 482.12, changes: { oneDay: -0.22, sevenDays: 2.43, oneMonth: 4.1, threeMonths: 9.01, sixMonths: 15.76, oneYear: 21.45 }, priceChanges: { sixMonths: 65.71, oneYear: 85.16 }, updatedAt: "Demo" },
    { symbol: "NVDA", name: "NVIDIA Corporation", currentPrice: 147.88, changes: { oneDay: 1.19, sevenDays: -3.62, oneMonth: 8.44, threeMonths: 18.22, sixMonths: 25.9, oneYear: 64.31 }, priceChanges: { sixMonths: 30.36, oneYear: 57.88 }, updatedAt: "Demo" },
    { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", currentPrice: 79.36, changes: { oneDay: 0.11, sevenDays: 0.71, oneMonth: 1.8, threeMonths: 4.2, sixMonths: 6.32, oneYear: 9.77 }, priceChanges: { sixMonths: 4.72, oneYear: 7.05 }, updatedAt: "Demo" }
  ];
}
