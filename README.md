# Jarvis New Tab

A Chrome extension that replaces your new tab page with **Jarvis**, a voice and text assistant that can control your browser: switch, group, pin, mute and close tabs, open bookmarks and history, set timers, and more. It is built to be privacy-first: by default the model never sees your tabs, history, or pages.

> Version 0.5.0 · Manifest V3 · No build step, plain JavaScript modules

## Features

- **New tab replacement.** A customizable home page with an animated particle orb, a combined "Ask Jarvis or type a URL" bar, and shortcut tiles.
- **Voice and text.** Type a request, or click the orb or mic to talk. Speech is transcribed with Groq Whisper, and replies are spoken with your browser's built-in voices (free, no TTS API).
- **Browser control through tools.** Jarvis acts on your browser with function calling (see [Tools](#tools)).
- **Floating presence on every tab.** A draggable orb on regular web pages opens a compact chat panel. It never reads the page. Toggle it with **Alt+J**.
- **Smart omnibox.** Suggestions blend open tabs, bookmarks, history, optional Google search suggestions, and an "Ask Jarvis" row. Switch between Jarvis mode and web-search mode with the mode chip (Shift+Enter does the opposite once).
- **Gentle nudges.** Local-only reminders, e.g. when you have 25+ tabs open, and notifications when timers finish.
- **Personalization.** Five theme presets plus an accent hue slider, Aurora / Grid / custom photo wallpapers (with tint and blur), editable shortcuts with drag-to-reorder, a custom personality prompt, and voice, speed, and pitch controls.

## Install

1. Download or clone this folder (`jarvis-newtab/`).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `jarvis-newtab` folder.
4. Open a new tab, click the avatar (or the status pill), and paste your **Groq API key** in settings.

Get a key at [console.groq.com](https://console.groq.com). Works in Chromium-based browsers that support Manifest V3.

## Usage

| Action | How |
| --- | --- |
| Ask Jarvis | Type in the bar and press Enter |
| Search the web instead | Click the mode chip, or press Shift+Enter once |
| Talk | Click the orb or the mic button |
| Stop speaking / close panel | Esc |
| Show or hide Jarvis on any page | Alt+J (change at `chrome://extensions/shortcuts`) or click the toolbar icon |
| New conversation | The **+** button in the bar |
| Customize look and behavior | The pencil button (bottom right) |
| Full settings | Avatar button (top right) |

Example requests:

- "Group my open tabs by site. Don't close anything."
- "Close the duplicate tabs."
- "Switch to my GitHub tab."
- "Mute everything that's playing."
- "Open that article I read yesterday about espresso."
- "Start a 25 minute focus timer."

## Tools

Tools take plain-text queries (the words you used) and resolve them locally, so the model does not need to see your tabs.

| Tool | What it does | Notes |
| --- | --- | --- |
| `tab_stats` | Counts of tabs, windows, pinned, audible, duplicates | No page info returned |
| `switch_to_tab` | Focus the best-matching tab | |
| `open_url` | Open a URL in a new tab | Optional background |
| `web_search` | Open a web search in a new tab | |
| `close_tabs` | Close tabs matching a query | **Asks first** |
| `close_duplicate_tabs` | Close same-URL duplicates, keep one | **Asks first** |
| `group_tabs` | Group matching tabs into a named, colored group | |
| `group_tabs_by_site` | Auto-group tabs by site (2+ tabs) | Skips private sites, closes nothing |
| `pin_tab` | Pin or unpin matching tabs | |
| `mute_tabs` | Mute or unmute tabs, or all audible ones | |
| `new_window` | Open a window, optionally incognito | |
| `open_from_history` | Open the best history match | Opens locally, nothing returned |
| `open_bookmark` | Open the best bookmark match | Opens locally, nothing returned |
| `reopen_last_closed` | Restore the last closed tab or window | |
| `set_timer` | Timer or reminder with a desktop notification | |
| `get_time_and_resources` | Local time, CPU cores, memory | No device identifiers |
| `list_tabs` | List tab sites and titles | Balanced privacy only |
| `search_history` | Return matching history entries | Balanced only, **asks first** |
| `search_bookmarks` | Return matching bookmarks | Balanced only, **asks first** |
| `get_page_text` | Read a tab's text (first 4,000 chars) to summarize | Balanced only, **asks first**, never on private sites |

You can disable any tool individually in settings.

## Privacy model

Privacy is the central design constraint.

**Privacy levels** (set in settings):

- **Strict (default).** Jarvis never sees your tabs, history, bookmarks, or pages. The model only receives what you type plus counts and "done" results from tools.
- **Balanced.** Also unlocks tab titles and sites, and reading history, bookmarks, or a page's text, but only after you approve each request.

**Always on, in both modes:**

- **Redaction.** Emails, phone numbers, card numbers (Luhn-checked), IDs, IBAN-like account numbers, IPs, API keys, JWTs, long tokens, passwords, and URL query strings and fragments are replaced with placeholders like `[EMAIL_1]` before anything leaves the browser. The mapping stays in local session storage, and real values are restored only in what you see.
- **Private sites.** Jarvis hides itself and never exposes tab titles on email, messaging, banking, health, password manager, login, and checkout pages. This uses a built-in list plus keyword patterns. You can add your own sites in settings.
- **No screen access.** There are no screenshots and no DOM reading, apart from the explicit, approved `get_page_text` tool. The floating orb's content script only draws a UI and an iframe to the extension's own panel.
- **Untrusted page text.** Text returned from web pages is labeled as untrusted data, never instructions.
- **Transparency.** Settings show the exact, already-scrubbed last request sent to Groq. It is kept in memory only and cleared when the browser closes.
- **Local storage.** Your API key lives in `chrome.storage.local`, is never synced, and is sent only to Groq (or to your configured API base).

**Network traffic to be aware of:**

- Groq (`api.groq.com`) for chat completions and Whisper transcription. Audio is sent only while the mic is open.
- Optional web suggestions send what you type in the new-tab bar to `suggestqueries.google.com`. Turn this off in the customize panel (**Web suggestions**).

## Configuration

Open the settings page (avatar button, or the extension's Options) to configure:

- Groq API key and model (default `llama-3.3-70b-versatile`; the model must support tool calling; "Load models from Groq" lists available ones)
- Personality prompt (a fixed, non-editable set of privacy rules is always appended)
- Voice, speed, and pitch, plus a sample button
- Privacy level, presence, hide on private sites, and nudges
- Extra private sites and sites where the orb is hidden
- Enabled and disabled tools
- The last outbound request, for auditing

## How it works

```
 newtab.html / panel.html ──port "jarvis"──▶ background.js (service worker)
        ▲                                         │  ├─ privacy.js   scrub / restore placeholders
        │ logs, state, confirmations              │  ├─ sensitive.js private-site detection
        │                                         │  ├─ settings.js  defaults and fixed rules
 content.js (orb + iframe, no page reads)         │  └─ tools/       tabs, browser, system
                                                  ▼
                                      Groq chat completions (tool loop, max 8 steps)
```

- **`background.js`** owns the conversation (history capped at 40 messages, stored in session storage), runs the tool-calling loop, asks for confirmation on risky tools (60 s timeout), manages timer and nudge alarms, and broadcasts state to every open Jarvis surface so the new tab and the floating panel share one conversation.
- **`privacy.js`** scrubs user text and tool results on the way out and restores placeholders in replies and tool arguments.
- **`tools/`** holds the tool definitions. Each tool declares a name, JSON-schema parameters, and a `run` function, plus optional `level: "balanced"`, `requiresConfirm`, and `describe` for the confirmation text.
- **`tts.js`** picks the best installed English voice (preferring natural, neural, and British voices as tie-breakers), cleans markdown and URLs for speech, and chunks text to avoid Chrome cutting off long utterances.

## Project structure

```
jarvis-newtab/
├── manifest.json        MV3 manifest, permissions, Alt+J command
├── background.js        Service worker: chat loop, confirmations, alarms
├── newtab.html/.js/.css New tab page: bar, orb, chat log, customize panel
├── panel.html/.js/.css  Compact chat panel shown in the floating overlay
├── content.js           Floating orb and panel iframe (never reads the page)
├── options.html/.js     Settings page
├── settings.js          Defaults, default personality, fixed rules
├── privacy.js           Redaction and placeholder restore
├── sensitive.js         Private-site detection
├── suggest.js           Omnibox suggestions
├── shortcuts.js         Shortcut tiles (most visited or custom, drag to reorder)
├── wallpaper.js         Aurora, grid, and photo wallpapers
├── orb.js               Canvas particle orb animation
├── tts.js, voice.js     Speech output and mic capture and transcription
├── util.js              Small helpers (markdown, favicons, URL checks)
├── tools/
│   ├── index.js         Registers all tools
│   ├── tabs.js          Tab management tools
│   ├── browser.js       History, bookmarks, timers, page text
│   └── system.js        Time and resource info
└── icons/icon128.png
```

## Adding a tool

Add an object to one of the arrays in `tools/tabs.js`, `tools/browser.js`, or `tools/system.js`:

```js
{
  name: "my_tool",
  description: "What the model should know about it.",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  level: "balanced",        // optional: hidden under strict privacy
  requiresConfirm: true,    // optional: ask the user first
  describe: async (args) => `Human-readable summary of what will happen`,
  run: async (args, ctx) => ({ ok: true }),   // ctx.isPrivate(url) available
}
```

Keep results small and free of page content unless the tool is `balanced` and confirmed. Tools that return page-derived text should label it as untrusted.

## Permissions

| Permission | Used for |
| --- | --- |
| `tabs`, `tabGroups`, `sessions` | Switching, grouping, closing, and restoring tabs |
| `bookmarks`, `history`, `topSites`, `favicon`, `search` | Omnibox suggestions, shortcuts, bookmark and history tools, web search |
| `scripting` | Reading a page's text, only via the approved `get_page_text` tool |
| `storage`, `unlimitedStorage` | Settings and the optional wallpaper photo |
| `alarms`, `notifications` | Timers and nudges |
| `system.cpu`, `system.memory` | `get_time_and_resources` |
| Host: `api.groq.com`, `<all_urls>` | Groq API calls, and the presence orb and page-text reading on web pages |

## Limitations

- Requires a Groq API key; model quality depends on the model you pick, and it must support tool calling.
- Tab matching is simple: every word in your query must appear in the tab's title or URL.
- Voice quality depends on the speech voices installed on your system.
- The floating orb doesn't appear on `chrome://` pages, the Web Store, or incognito windows.
- Conversation history lives in session storage and is cleared when the browser closes.

## License

No license specified yet. Add one (e.g. MIT) before publishing.
