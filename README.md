# Holy Gains Runner — Starter

A beginner-friendly Phaser 3 endless runner starter built with TypeScript + Vite.
Includes: jump + slide, swipe controls, start screen, score, speed ramp, and Cloudflare Pages deployment-ready build.

## Play / Demo
- Cloudflare Pages URL: https://runner-starter.pages.dev/

## Controls
### Desktop
- **Jump:** Space or ↑
- **Slide:** ↓ or S

### Mobile
- **Jump:** Swipe up
- **Slide:** Swipe down

## Run locally
1. Install dependencies:
   ```bash
   npm install

## Embed in Google Sites (mobile-friendly)

Google Sites embeds can crop or add black bars unless you force a responsive iframe container.
This method works well without changing any game code.

### Steps
1. In Google Sites, open the page where you want the game.
2. Click **Insert → Embed → Embed code**.
3. Paste the code below.
4. Resize the embed box taller if needed (try 800–1000px).

### Embed code (responsive wrapper)
```html
<div style="position:relative; width:100%; padding-top:75%; overflow:hidden; border-radius:12px;">
  <iframe
    src="https://runner-starter.pages.dev/"
    style="position:absolute; inset:0; width:100%; height:100%; border:0;"
    allow="fullscreen"
  ></iframe>
</div>
