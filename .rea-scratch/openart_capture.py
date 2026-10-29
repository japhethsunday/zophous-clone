import asyncio, json, sys
from playwright.async_api import async_playwright

URL = "https://openart.ai/suite/home"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path="/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args=["--no-sandbox"])
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        )
        page = await ctx.new_page()
        resp = await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        print("status:", resp.status if resp else None, file=sys.stderr)
        try:
            await page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as e:
            print("networkidle skip:", e, file=sys.stderr)
        await page.wait_for_timeout(4000)
        data = await page.evaluate("""() => {
          const out = {};
          out.title = document.title;
          out.url = location.href;
          out.metaDesc = document.querySelector('meta[name=description]')?.content || null;
          // headings
          out.headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(h=>({tag:h.tagName, text:h.innerText.trim()})).filter(h=>h.text).slice(0,80);
          // nav links
          out.links = [...new Set([...document.querySelectorAll('a[href]')].map(a=>{
            return {href:a.getAttribute('href'), text:a.innerText.trim().slice(0,60)};
          }))].filter(l=>l.text).slice(0,150);
          // buttons
          out.buttons = [...new Set([...document.querySelectorAll('button,[role=button]')].map(b=>b.innerText.trim().replace(/\\s+/g,' ').slice(0,60)))].filter(Boolean).slice(0,100);
          // visible text blocks of main sections
          out.bodyText = document.body.innerText.slice(0, 12000);
          return out;
        }""")
        with open("/workspace/.rea-scratch/openart_home.json","w") as f:
            json.dump(data,f,indent=1)
        await page.screenshot(path="/workspace/.rea-scratch/openart_home.png", full_page=False)
        # scroll to load more and capture again
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(2500)
        data2 = await page.evaluate("""() => ({
          headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(h=>h.innerText.trim()).filter(Boolean).slice(0,120),
          bodyText: document.body.innerText.slice(0,20000)
        })""")
        with open("/workspace/.rea-scratch/openart_scrolled.json","w") as f:
            json.dump(data2,f,indent=1)
        await page.screenshot(path="/workspace/.rea-scratch/openart_scrolled.png", full_page=False)
        await browser.close()
        print("OK")

asyncio.run(main())
