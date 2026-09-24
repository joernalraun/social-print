#!/usr/bin/env node
/*
 * Relay for the social-print micro:bit extension.
 *
 * The micro:bit cannot talk to Facebook, Instagram, Threads or Mastodon
 * itself: three of them need OAuth tokens, all four are HTTPS only, and a
 * single Mastodon post is about 5 KB of JSON - more than the board has room
 * for. This service does that work and answers with a few short lines of
 * plain text over plain HTTP, which an ESP8266 can fetch and a micro:bit can
 * parse.
 *
 * Request : GET /latest?platform=<name>&since=<last id seen>
 * Answer  : line 1  post id, or "-" when there is nothing newer
 *           line 2  platform
 *           line 3  time, as YYYY-MM-DD HH:MM
 *           line 4+ the post text, cleaned up and shortened
 *
 * Needs Node 18 or newer (for the built-in fetch).
 */

const http = require("http")
const fs = require("fs")
const path = require("path")

const CONFIG_PATH = process.env.SOCIAL_PRINT_CONFIG
    || path.join(__dirname, "config.json")

let config
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"))
} catch (e) {
    console.error(`Cannot read ${CONFIG_PATH}: ${e.message}`)
    console.error("Copy config.example.json to config.json and fill it in.")
    process.exit(1)
}

const PORT = config.port || 8080
const MAX_CHARS = config.maxChars || 280
const CACHE_MS = (config.cacheSeconds || 60) * 1000
const ASCII_FOLD = config.asciiFold !== false

// ---------------------------------------------------------------- text tidy

const ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&hellip;": "...",
    "&ndash;": "-", "&mdash;": "-", "&bdquo;": '"', "&ldquo;": '"',
    "&rdquo;": '"', "&sbquo;": "'", "&auml;": "ä", "&ouml;": "ö",
    "&uuml;": "ü", "&Auml;": "Ä", "&Ouml;": "Ö", "&Uuml;": "Ü",
    "&szlig;": "ß"
}

// Thermal printers use a code page, not UTF-8, so anything beyond plain
// ASCII comes out as garbage. Folding it here keeps the board out of it.
const FOLD = {
    "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
    "ß": "ss", "é": "e", "è": "e", "ê": "e", "á": "a", "à": "a", "â": "a",
    "í": "i", "ì": "i", "ó": "o", "ò": "o", "ô": "o", "ú": "u", "ù": "u",
    "ñ": "n", "ç": "c", "å": "a", "ø": "o", "æ": "ae",
    "„": '"', "“": '"', "”": '"', "‚": "'", "‘": "'", "’": "'",
    "–": "-", "—": "-", "…": "...", " ": " ", "€": "EUR"
}

function cleanText(raw) {
    if (!raw) return ""
    let t = String(raw)
    t = t.replace(/<br\s*\/?>/gi, "\n")
    t = t.replace(/<\/p>/gi, "\n\n")
    t = t.replace(/<[^>]+>/g, "")
    for (const [entity, char] of Object.entries(ENTITIES)) {
        t = t.split(entity).join(char)
    }
    t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    if (ASCII_FOLD) {
        t = t.replace(/[^\x00-\x7F]/g, c => FOLD[c] !== undefined ? FOLD[c] : "")
    }
    t = t.replace(/[ \t]+/g, " ")
    t = t.replace(/\n{3,}/g, "\n\n")
    t = t.split("\n").map(l => l.trim()).join("\n").trim()
    if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS - 3).trimEnd() + "..."
    return t
}

function formatTime(iso) {
    if (!iso) return ""
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    const p = n => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
        + `${p(d.getHours())}:${p(d.getMinutes())}`
}

async function getJson(url) {
    const res = await fetch(url, { headers: { "User-Agent": "social-print-relay" } })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
        const msg = body && body.error
            ? (body.error.message || JSON.stringify(body.error))
            : `HTTP ${res.status}`
        throw new Error(msg)
    }
    return body
}

// --------------------------------------------------------------- platforms
// Each returns { id, time, text } for the newest post, or null.

async function fetchMastodon(cfg) {
    // public, no credentials needed
    const instance = cfg.instance || "mastodon.social"
    const handle = cfg.handle || config.handle || "calliopemini"
    const account = await getJson(
        `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`)
    const list = await getJson(
        `https://${instance}/api/v1/accounts/${account.id}/statuses`
        + `?limit=1&exclude_replies=true&exclude_reblogs=true`)
    if (!Array.isArray(list) || !list.length) return null
    const s = list[0]
    return { id: s.id, time: s.created_at, text: cleanText(s.content) }
}

async function fetchFacebook(cfg) {
    // needs a Page access token for a Page you administer
    const list = await getJson(
        `https://graph.facebook.com/v21.0/${cfg.pageId}/posts`
        + `?fields=id,message,created_time&limit=1`
        + `&access_token=${encodeURIComponent(cfg.accessToken)}`)
    const p = list.data && list.data[0]
    if (!p) return null
    return { id: p.id, time: p.created_time, text: cleanText(p.message) }
}

async function fetchInstagram(cfg) {
    // needs an Instagram Business or Creator account linked to a Facebook Page
    const list = await getJson(
        `https://graph.facebook.com/v21.0/${cfg.userId}/media`
        + `?fields=id,caption,timestamp,permalink&limit=1`
        + `&access_token=${encodeURIComponent(cfg.accessToken)}`)
    const p = list.data && list.data[0]
    if (!p) return null
    return { id: p.id, time: p.timestamp, text: cleanText(p.caption) }
}

async function fetchThreads(cfg) {
    // the Threads API only reads back your OWN account
    const list = await getJson(
        `https://graph.threads.net/v1.0/${cfg.userId}/threads`
        + `?fields=id,text,timestamp&limit=1`
        + `&access_token=${encodeURIComponent(cfg.accessToken)}`)
    const p = list.data && list.data[0]
    if (!p) return null
    return { id: p.id, time: p.timestamp, text: cleanText(p.text) }
}

const PLATFORMS = {
    mastodon: fetchMastodon,
    facebook: fetchFacebook,
    instagram: fetchInstagram,
    threads: fetchThreads
}

// ------------------------------------------------------------------- cache

const cache = new Map()

async function latestFor(name) {
    const cfg = (config.platforms || {})[name]
    if (!cfg || cfg.enabled === false) return null

    const hit = cache.get(name)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.post

    try {
        const post = await PLATFORMS[name](cfg)
        cache.set(name, { at: Date.now(), post })
        return post
    } catch (e) {
        console.error(`[${name}] ${e.message}`)
        // keep serving the last good answer rather than going quiet
        return hit ? hit.post : null
    }
}

async function newest(names) {
    const found = []
    for (const name of names) {
        const post = await latestFor(name)
        if (post) found.push(Object.assign({ platform: name }, post))
    }
    if (!found.length) return null
    found.sort((a, b) => new Date(b.time) - new Date(a.time))
    return found[0]
}

// ------------------------------------------------------------------ server

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
    const send = body => {
        const buf = Buffer.from(body, "utf8")
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Length": buf.length,
            "Connection": "close"
        })
        res.end(buf)
    }

    if (url.pathname === "/health") return send("ok\n")

    if (url.pathname !== "/latest") {
        res.writeHead(404, { "Content-Type": "text/plain", "Connection": "close" })
        return res.end("not found\n")
    }

    const wanted = (url.searchParams.get("platform") || "all").toLowerCase()
    const since = url.searchParams.get("since") || ""
    const names = wanted === "all" || wanted === "any"
        ? Object.keys(PLATFORMS)
        : [wanted]

    if (names.some(n => !PLATFORMS[n])) return send("-\n\n\n")

    const post = await newest(names)
    if (!post || post.id === since) return send("-\n\n\n")

    send(`${post.id}\n${post.platform}\n${formatTime(post.time)}\n${post.text}\n`)
})

server.listen(PORT, () => {
    const on = Object.entries(config.platforms || {})
        .filter(([, c]) => c && c.enabled !== false)
        .map(([n]) => n)
    console.log(`social-print relay listening on port ${PORT}`)
    console.log(`platforms: ${on.join(", ") || "(none configured)"}`)
    console.log(`try: curl "http://localhost:${PORT}/latest?platform=mastodon"`)
})
