/**
 * Watch the @calliopemini accounts for a new post and hand it to your program.
 *
 * The posts do not come from the platforms directly - see README.md. A small
 * relay service does the talking and answers with four short lines of plain
 * text, which is all a micro:bit can reasonably handle.
 */

enum SocialPlatform {
    //% block="Mastodon"
    Mastodon = 0,
    //% block="Facebook"
    Facebook = 1,
    //% block="Instagram"
    Instagram = 2,
    //% block="Threads"
    Threads = 3,
    //% block="any platform"
    Any = 4
}

//% color=#8E44AD icon="" block="Social Feed"
//% groups='["Setup", "Posts"]'
namespace socialFeed {

    let relayHost = "192.168.1.10"
    let relayPort = 8080

    // the newest post already reported, one slot per platform
    let seen: string[] = ["", "", "", "", ""]

    let text = ""
    let platform = ""
    let posted = ""

    // ---------------------------------------------------------------- Setup

    /**
     * Where the relay service runs. It has to be reachable over plain HTTP
     * from the same network the WiFi module joins.
     * @param host the relay's address, eg: "192.168.1.10"
     * @param port the relay's port, eg: 8080
     */
    //% blockId=socialfeed_setrelay
    //% block="relay service at|host %host|port %port"
    //% host.defl="192.168.1.10" port.defl=8080
    //% group="Setup" weight=100
    export function setRelay(host: string, port: number): void {
        relayHost = host
        relayPort = port
    }

    function nameOf(which: SocialPlatform): string {
        if (which == SocialPlatform.Mastodon) return "mastodon"
        if (which == SocialPlatform.Facebook) return "facebook"
        if (which == SocialPlatform.Instagram) return "instagram"
        if (which == SocialPlatform.Threads) return "threads"
        return "all"
    }

    function firstLine(s: string): string {
        const i = s.indexOf("\n")
        const line = i < 0 ? s : s.substr(0, i)
        let end = line.length
        while (end > 0 && (line.charAt(end - 1) == "\r" || line.charAt(end - 1) == " ")) {
            end = end - 1
        }
        return line.substr(0, end)
    }

    function afterFirstLine(s: string): string {
        const i = s.indexOf("\n")
        return i < 0 ? "" : s.substr(i + 1)
    }

    /** Ask the relay and remember what came back. */
    function fetch(which: SocialPlatform, report: boolean): boolean {
        const slot = which as number
        const path = "/latest?platform=" + nameOf(which) + "&since=" + seen[slot]
        const body = espWifi.httpGet(relayHost, relayPort, path)

        let rest = body
        const id = firstLine(rest); rest = afterFirstLine(rest)
        const where = firstLine(rest); rest = afterFirstLine(rest)
        const when = firstLine(rest); rest = afterFirstLine(rest)

        if (id.length == 0 || id == "-") return false
        seen[slot] = id
        if (!report) return false

        platform = where
        posted = when
        text = rest
        return true
    }

    // ---------------------------------------------------------------- Posts

    /**
     * Ask whether a post has appeared that this program has not seen yet.
     * Each post is only reported once. Takes a few seconds.
     * @param which which account to look at
     */
    //% blockId=socialfeed_check
    //% block="new post on %which"
    //% group="Posts" weight=100 blockGap=8
    export function checkForNewPost(which: SocialPlatform): boolean {
        return fetch(which, true)
    }

    /**
     * Treat whatever is there right now as already seen, without reporting it.
     * Put this in "on start" so the board does not print an old post every
     * time it is switched on.
     * @param which which account to catch up on
     */
    //% blockId=socialfeed_markseen
    //% block="ignore posts up to now on %which"
    //% group="Posts" weight=90 blockGap=8
    export function ignorePostsUpToNow(which: SocialPlatform): void {
        fetch(which, false)
    }

    /** The text of the post that was just found. */
    //% blockId=socialfeed_text
    //% block="post text"
    //% group="Posts" weight=80
    export function postText(): string {
        return text
    }

    /** Which platform the post that was just found came from. */
    //% blockId=socialfeed_platform
    //% block="post platform"
    //% group="Posts" weight=70
    export function postPlatform(): string {
        return platform
    }

    /** When the post that was just found was published. */
    //% blockId=socialfeed_time
    //% block="post time"
    //% group="Posts" weight=60
    export function postTime(): string {
        return posted
    }
}
