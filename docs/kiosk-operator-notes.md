# Kiosk — facility setup

The kiosk is a web page, not an app. Locking the iPad to it is a **device**
setting, not something the code can do.

## One-time iPad setup

1. Settings → Accessibility → **Guided Access** → on. Set a passcode. This
   passcode is the only way out of the kiosk — do not lose it.
2. Safari → open `https://gosoccerone.com/kiosk/<location-slug>`.
3. Share → **Add to Home Screen**. Launch from that icon: it runs full-screen
   with no address bar, so nobody can browse away.
4. Triple-click the side button → **Guided Access** → Start.
5. Settings → Display & Brightness → Auto-Lock → **Never**.
6. Leave it on a charger. It is designed to run all day.

## What the kiosk does on its own

- Clears the screen after 60 seconds of inactivity (with a 20-second warning),
  so no customer's details are left on display.
- Returns to the start screen automatically after each check-in.
- Shows an honest "no connection" message if the Wi-Fi drops. It does **not**
  queue registrations offline — a queued booking could be sold out by the time
  it reached us, and telling someone that an hour later is worse than telling
  them now.

## If something goes wrong

Exit Guided Access with the passcode and reload the page. Nothing is stored on
the device.
