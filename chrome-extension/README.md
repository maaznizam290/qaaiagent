# Chrome Extension - Test Flux Flow Recorder

## Load Extension
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select this `chrome-extension/` folder

## Usage
1. Open a website tab to record.
2. Open extension popup and click `Start`.
3. Interact with the page.
4. Click `Stop`.
5. Either:
   - `Copy JSON` and paste into Dashboard -> Flow Recorder Input
   - `Send to API` using API URL and JWT token from app localStorage (`testflux_token`)
   - `Run Self-Healing` to send real `domBefore`, `domAfter`, and `domCurrent` snapshots to `POST /api/flows/self-healing/run`

## Notes
- Recorder captures `navigate`, `click`, `input`, and `submit` events.
- Generated payload is compatible with backend `POST /api/flows`.
- Self-healing diagnostics are most useful after you click `Start`, perform interactions, and then run self-healing.
