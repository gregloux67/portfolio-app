#!/usr/bin/env python3
import http.server
import socketserver
import json
import urllib.request
import urllib.error
import sys
import traceback
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed


try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False

try:
    from playwright.sync_api import sync_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

import os
PORT = int(os.getenv('PORT', 8001))

# Price cache (TTL: 5 minutes)
PRICE_CACHE = {}
CACHE_TTL = 300  # seconds

import time

# Ticker mappings (Euronext codes for European exchanges)
ETF_TICKERS = {
    "pust": "PUST.PA",
    "paeem": "PAEEM.PA",
    "urnu": "URNU.MI",
    "vvmx": "VVMX.DE"
}

class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)

    def do_GET(self):
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/prices':
            self.handle_prices_endpoint()
        elif self.path == '/api/mnav':
            self.handle_mnav_endpoint()
        elif self.path == '/api/mnav-calc':
            self.handle_mnav_calc_endpoint()
        elif self.path == '/api/fx':
            self.handle_fx_endpoint()
        else:
            self.send_error(404)

    def fetch_etf_price(self, ticker):
        """Fetch ETF price from Yahoo Finance via yfinance"""
        return self.fetch_yahoo_price(ticker)

    def fetch_mnav_strategy(self):
        """Scrape mNAV from strategy.com using Playwright"""
        if not HAS_PLAYWRIGHT:
            return None
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])
                page = browser.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                page.goto("https://www.strategy.com/", timeout=15000, wait_until="networkidle")
                page.wait_for_load_state("networkidle", timeout=15000)

                # Look for mNAV text specifically
                mnav_text = page.text_content('body') or page.inner_text('body') or ""
                browser.close()

                # Search for patterns in text
                import re as regex_module

                # Find all numbers that look like mNAV (1.xx format)
                all_matches = regex_module.findall(r'\b([1-3]\.\d{2})\b', mnav_text)

                if all_matches:
                    # The mNAV is usually near the end of the data section
                    # Try last few matches in case there are historical values
                    for val_str in reversed(all_matches[-5:]):
                        val = float(val_str)
                        if 1.0 <= val <= 4.0:
                            print(f"Found mNAV candidates: {all_matches}, using: {val}", file=sys.stderr)
                            return val

                return None
        except Exception as e:
            print(f"Error fetching mNAV from Strategy: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            return None

    def fetch_yahoo_price(self, ticker):
        """Fetch price from Yahoo Finance"""
        try:
            if not HAS_YFINANCE:
                return None
            data = yf.Ticker(ticker)
            price = data.info.get('currentPrice') or data.info.get('regularMarketPrice')
            return price
        except Exception as e:
            print(f"Error fetching Yahoo price for {ticker}: {e}", file=sys.stderr)
            return None

    def calculate_mnav(self, mstr_price_usd, btc_price_usd, btc_holdings, market_cap_usd, debt_usd, pref_usd, cash_usd):
        """Calculate mNAV = (Market Cap + Debt + Pref - Cash) / (BTC Holdings × BTC Price)"""
        try:
            if not all([mstr_price_usd, btc_price_usd, btc_holdings, market_cap_usd]):
                return None

            # Convert to floats
            market_cap = float(market_cap_usd)
            debt = float(debt_usd) if debt_usd else 0
            pref = float(pref_usd) if pref_usd else 0
            cash = float(cash_usd) if cash_usd else 0
            btc_hold = float(btc_holdings)
            btc_price = float(btc_price_usd)

            # Enterprise Value = Market Cap + Debt + Pref - Cash
            ev = market_cap + debt + pref - cash

            # Bitcoin NAV = BTC Holdings × BTC Price
            btc_nav = btc_hold * btc_price

            if btc_nav <= 0:
                return None

            # mNAV = EV / BTC NAV
            mnav = ev / btc_nav

            # Validate result
            if mnav > 0.5 and mnav < 10:
                return round(mnav, 2)
            return None
        except Exception as e:
            print(f"Error calculating mNAV: {e}", file=sys.stderr)
            return None

    def handle_prices_endpoint(self):
        """Fetch prices from Yahoo Finance (with caching)"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            req_data = json.loads(body)
            tickers = req_data.get('tickers', {})

            prices = {}
            now = time.time()

            # Check cache first
            to_fetch = {}
            for asset_id in tickers:
                if asset_id in PRICE_CACHE:
                    cache_time, cached_price = PRICE_CACHE[asset_id]
                    if now - cache_time < CACHE_TTL:
                        prices[asset_id] = cached_price
                        print(f"♻ {asset_id}: {cached_price} (cached)", file=sys.stderr)
                        continue
                # Need to fetch
                if asset_id == "mstr":
                    to_fetch[asset_id] = "MIGA.F"
                elif asset_id in ETF_TICKERS:
                    to_fetch[asset_id] = ETF_TICKERS[asset_id]

            # Fetch missing prices in parallel
            if to_fetch:
                with ThreadPoolExecutor(max_workers=6) as executor:
                    tasks = {}
                    for asset_id, ticker in to_fetch.items():
                        if asset_id == "mstr":
                            tasks[executor.submit(self.fetch_yahoo_price, ticker)] = asset_id
                        else:
                            tasks[executor.submit(self.fetch_etf_price, ticker)] = asset_id

                    for future in as_completed(tasks):
                        asset_id = tasks[future]
                        try:
                            price = future.result()
                            if price:
                                prices[asset_id] = price
                                PRICE_CACHE[asset_id] = (now, price)
                                print(f"✓ {asset_id}: {price}", file=sys.stderr)
                        except Exception as e:
                            print(f"Error fetching {asset_id}: {e}", file=sys.stderr)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(json.dumps(prices).encode())

        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def handle_fx_endpoint(self):
        """Fetch EUR to USD exchange rate"""
        try:
            req = urllib.request.Request("https://api.frankfurter.app/latest?from=EUR&to=USD", headers={
                'User-Agent': 'Mozilla/5.0'
            })
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read())
                eur_usd = data.get('rates', {}).get('USD', 1.08)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'eur_usd': eur_usd}).encode())
        except Exception as e:
            print(f"Error fetching FX: {e}", file=sys.stderr)
            # Fallback to default rate
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'eur_usd': 1.08}).encode())

    def handle_mnav_calc_endpoint(self):
        """Calculate mNAV from raw data"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            req_data = json.loads(body)

            mstr_price = req_data.get('mstr_price_usd')
            btc_price = req_data.get('btc_price_usd')
            btc_holdings = req_data.get('btc_holdings')
            market_cap = req_data.get('market_cap_usd')
            debt = req_data.get('debt_usd', 0)
            pref = req_data.get('pref_usd', 0)
            cash = req_data.get('cash_usd', 0)

            mnav = self.calculate_mnav(mstr_price, btc_price, btc_holdings, market_cap, debt, pref, cash)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(json.dumps({'mnav': mnav}).encode())
            if mnav:
                print(f"✓ mnav (calc): {mnav}", file=sys.stderr)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def handle_mnav_endpoint(self):
        """Fetch mNAV from Strategy"""
        try:
            mnav = self.fetch_mnav_strategy()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(json.dumps({'mnav': mnav}).encode())
            if mnav:
                print(f"✓ mnav: {mnav}", file=sys.stderr)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[{self.client_address[0]}] {format % args}", file=sys.stderr)

if __name__ == '__main__':
    try:
        with ReuseTCPServer(("", PORT), ProxyHandler) as httpd:
            print(f"Serving on port {PORT}")
            print(f"yfinance available: {HAS_YFINANCE}")
            sys.stdout.flush()
            httpd.serve_forever()
    except Exception as e:
        print(f"Server error: {e}", file=sys.stderr)
        traceback.print_exc()
