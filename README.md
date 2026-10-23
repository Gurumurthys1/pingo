# Pingo

<img src="build/icon.png" width="96" align="right" alt="Pingo icon" />

A pixel desktop buddy for Windows. Pingo lives on top of your taskbar, reminds you to drink water,
and delivers your WhatsApp messages with a show. A privacy camera can hide the message text when
you're not alone.

## Install (Windows 10 / 11)

1. Download **`Pingo-Setup-x.y.z.exe`** from the
   [latest release](https://github.com/Gurumurthys1/pingo/releases/latest).
2. Run it. The installer isn't code-signed, so if Windows SmartScreen warns you, click
   **More info → Run anyway**.
3. Choose the install folder and finish. Pingo starts and opens its control panel.

The installer adds **Pingo** and **Stop Pingo** shortcuts to the Start menu and desktop. To
uninstall, use Settings → Apps → Pingo.

To get real WhatsApp messages, follow [Real WhatsApp messages](#real-whatsapp-messages-whatsapp-desktop)
below.

## What it does

- **Water reminders.** Every N minutes Pingo walks out to 1/5 of the screen. Water drops rain into a
  pixel glass, and a bubble shows today's progress (e.g. glass 3 of 8) with **I drank it** and
  **Snooze 10m** buttons. Drinking plays a gulp animation with hearts. Hitting the daily goal sets off confetti.
- **Message notifications.** Pingo walks to 1/5 of the screen and gets an "!". A ball in the app's
  colour (green for WhatsApp, blue for Telegram) bounces in from the other edge. Pingo catches it
  overhead, it wobbles and then bursts into a glowing card. The card shows the sender's avatar, their
  name popping in letter by letter, and the message typed out. It closes itself after 11 s (hovering
  pauses the timer), or you can click **Got it**.
- **Pick your buddy.** There are three characters, all drawn in code:
  - **Pingo**: beanie kid in a hoodie.
  - **Mira**: long hair, hair clip, embroidered kurta.
  - **Dev**: glasses, side-parted hair, shirt and tie.

  Give your buddy any name. Add **your name** too, and the buddy greets you with it ("Hi Guru!",
  "GURU, SIP TIME!"). Switching characters plays a "ta-da" poof. Hover over the buddy to see a name tag.
- **Photo, voice and other media messages.** Windows passes only the notification's text, never
  the attached picture. So Pingo recognises WhatsApp's media labels (📷 Photo, 🎥 Video,
  🎤 Voice message, 📄 Document, Sticker, GIF, 📍 Location, 👤 Contact). The card then shows a
  matching pixel tile: a polaroid that "develops" for photos, a film strip for videos, bouncing
  equaliser bars for voice notes, and so on. Any caption appears under the tile. Photos and videos
  also fire a camera flash.
- **Privacy camera ("only show it when it's just me").** Set up your face once in the control
  panel: about 15 snapshots while you slowly turn your head. From then on, when a message arrives,
  Pingo briefly opens the webcam while the ball rolls in, takes 3 frames and decides before the
  ball bursts:

  | Camera sees | Card shows |
  |---|---|
  | only you | the full message |
  | you + someone else | "Priya" + 🔒 "Someone else is with you, so I kept it private." |
  | someone who isn't you | sender only, text hidden |
  | nobody / camera unavailable | sender only, text hidden |

  A hidden card has a **Check again** button that re-runs the camera check and reveals the text
  if it's just you. The models are **YuNet** (face detection, MIT) and **SFace** (face recognition,
  Apache-2.0) from the OpenCV Model Zoo. Both run offline with onnxruntime-node, about 0.5 s for
  3 frames on a laptop CPU. Only 128-number face embeddings are stored, never photos, encrypted
  with Windows DPAPI in `%APPDATA%\Pingo\face-profile.bin`. **Delete** removes them. Windows must
  allow desktop apps to use the camera (Settings → Privacy & security → Camera).
- **Desktop pet.** Between events the buddy wanders, hops and blinks. Click it for a random line.
  The overlay lets clicks pass through to your desktop except where Pingo or a card is.
- **Control panel.** It opens when you launch Pingo. It's a three-column landscape screen with no
  scrolling, and it zooms itself to fit any laptop display:
  - **Left:** Start / Stop, today's water count, Drink now, Test message, Quit.
  - **Middle:** your buddy, names, privacy camera.
  - **Right:** WhatsApp link and settings.

  Closing the window keeps Pingo running in the tray.
- **Tray menu.** Click the tray icon to open the control panel. Right-click it for Start/Stop and
  the same quick settings. The app icon is the beanie buddy peeking over a purple chat bubble, with a
  green "new message" badge ([src/icon-art.js](src/icon-art.js)). It turns grey while Pingo is stopped.

## Start and stop

| How | Start | Stop |
|---|---|---|
| Control panel | **▶ START PINGO** | **■ STOP PINGO** (pauses; the app stays in the tray) |
| Tray icon (right-click) | Start Pingo | Stop Pingo / Quit Pingo |
| Start menu / desktop | **Pingo** shortcut | **Stop Pingo** shortcut (closes the app) |
| Command line | `Pingo.exe` | `Pingo.exe --stop` (pause) or `Pingo.exe --quit` (close) |

While Pingo is stopped, the buddy is hidden and there are no water reminders. Incoming messages are
dropped (the API answers `"delivered": false`).

## Build from source

You need Windows 10/11, [Node.js](https://nodejs.org) 20 or newer, and Git. The face models are
already in the repo (`src/models/`, about 39 MB), so nothing else needs downloading.

```bash
git clone https://github.com/Gurumurthys1/pingo.git
```

```bash
cd pingo
```

```bash
npm install
```

Run it in development mode:

```bash
npm start
```

Build the Windows installer:

```bash
npm run dist
```

This produces `dist/Pingo-Setup-<version>.exe`. The installer lets you choose the install folder.
It adds **Pingo** and **Stop Pingo** shortcuts to the Start menu and desktop, and launches Pingo
when it finishes. Run `node scripts/make-icon.js` again if you change the icon art.

### Build troubleshooting

- **`Cannot create symbolic link : A required privilege is not held by the client`.**
  electron-builder's signing tools contain macOS symlinks. Turn on **Developer Mode**
  (Settings → System → For developers) or run the terminal as administrator once, then build again.
- **NSIS `!include: could not open file`.** The project folder path is too long; NSIS has a
  260-character limit. Clone into a short path such as `C:\pingo` and build there.
- **The installer is about 125 MB.** That's mostly Electron itself, ONNX Runtime and the 39 MB
  SFace face model.

## Sending notifications to Pingo

Pingo listens on `http://127.0.0.1:47321/notify`, on this PC only.

```bash
curl -X POST http://127.0.0.1:47321/notify -H "Content-Type: application/json" -d "{\"from\":\"Priya\",\"message\":\"Lunch at 1?\",\"source\":\"WhatsApp\"}"
```

or `GET /notify?from=Priya&message=Hi&source=WhatsApp`. `source` sets the colours:
`WhatsApp`, `Telegram`, `SMS`, `Email`, or anything else (purple). The optional `media` field shows
a media tile: `photo`, `video`, `voice`, `audio`, `document`, `location`, `contact`, `sticker` or `gif`.

### Real WhatsApp messages (WhatsApp Desktop)

Pingo reads the Windows notifications that **WhatsApp Desktop** (and Telegram Desktop) show. It
uses the Windows `UserNotificationListener` API through a hidden Windows PowerShell helper
([notification-listener.ps1](src/watchers/notification-listener.ps1)). Every new WhatsApp toast
becomes a Pingo walk-in with the ball and burst. Group messages show as "Sender · Group".

You need:

1. WhatsApp Desktop installed, signed in and running (it can sit minimised in the tray).
2. **Windows notifications turned on:** Settings → System → Notifications → On.
3. WhatsApp allowed there, and notifications enabled inside WhatsApp (Settings → Notifications).
4. Optional: if you only want Pingo's version, open WhatsApp in Windows notification settings and turn
   off **Show notification banners**. Keep **Show notifications in notification center** on, because
   Pingo reads from there.

The control panel's **WHATSAPP LINK** line shows the status: *Watching*, *Windows notifications are
OFF* (with a button that opens the settings page), or *No notification access*. Switch off
**Show message text** to show only the sender's name. Nothing is sent anywhere; messages stay on
this PC.

Limits: Pingo sees only what the toast shows. If WhatsApp hides previews, or bundles messages
("3 new messages"), Pingo shows the same. Messages that arrive while the PC is off or Pingo is
stopped aren't replayed.

Other sources can still push messages through the HTTP endpoint above, for example a phone
automation app over a LAN bridge, or a WhatsApp Business Cloud API webhook.

## Try the animations in a browser

```bash
node scripts/demo-server.js
```

Then open http://localhost:47400 and use the demo panel.

## Project layout

```
src/main.js               overlay window, control panel, tray, reminder timer, notify server, face profile
src/preload.js            bridge for the overlay window
src/control-preload.js    bridge for the control panel
src/faceid.js             privacy camera engine: YuNet detection, alignment, SFace embeddings, verdict
src/models/               YuNet + SFace ONNX models (+ licence notes)
src/icon-art.js           app / tray icon art
src/watchers/             WhatsApp/Telegram notification watcher (PowerShell + parser)
src/renderer/overlay.*    animation engine: walking, ball, burst, glass, bubbles, message cards
src/renderer/control.*    control panel (3-column, auto-zoom)
src/renderer/sprite.js    the three characters + media tiles (pixel art drawn in code, auto-outlined)
src/renderer/camera.js    webcam capture helpers
build/                    installer icon + NSIS script (Stop Pingo shortcut)
scripts/                  icon generator, browser demo server
```

## Licences

- **Pingo:** MIT, see [LICENSE](LICENSE).
- **Pixel font:** Press Start 2P, SIL Open Font License (`src/renderer/fonts/OFL-LICENSE.txt`).
- **Face models:** YuNet (MIT) and SFace (Apache-2.0) from the OpenCV Model Zoo
  (`src/models/MODELS-LICENSE.txt`).
