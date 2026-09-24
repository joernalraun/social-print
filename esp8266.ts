/**
 * Minimal HTTP client for an ESP8266 WiFi module in AT command mode.
 *
 * This talks to the module directly rather than depending on one of the many
 * WiFi extensions, because most of them can only send and never hand back the
 * server's answer - which is exactly what fetching a post needs.
 *
 * The board has only ONE serial port, and the thermal printer uses it too, so
 * this namespace switches it between the module and the printer around each
 * request. Tell it about both with the two setup blocks.
 */

//% color=#2E86C1 icon="" block="WiFi"
//% groups='["Setup", "Connection", "Request"]'
namespace espWifi {

    let moduleTx = SerialPin.P1          // board -> module RX
    let moduleRx = SerialPin.P2          // module TX -> board
    let moduleBaud = BaudRate.BaudRate115200

    let printerTx = SerialPin.P8
    let printerBaud = BaudRate.BaudRate9600
    let printerKnown = false

    let connected = false
    let lastReply = ""

    // ---------------------------------------------------------------- Setup

    /**
     * Tell the extension where the WiFi module is wired and how fast it talks.
     * Most ESP8266 modules leave the factory at 115200 baud.
     * @param tx the board pin wired to the module's RX, eg: SerialPin.P1
     * @param rx the board pin wired to the module's TX, eg: SerialPin.P2
     * @param baud the module's baud rate, eg: BaudRate.BaudRate115200
     */
    //% blockId=espwifi_usemodule
    //% block="WiFi module|TX pin %tx|RX pin %rx|baud rate %baud"
    //% tx.defl=SerialPin.P1 rx.defl=SerialPin.P2 baud.defl=BaudRate.BaudRate115200
    //% group="Setup" weight=100 blockGap=8
    export function useWifiModule(tx: SerialPin = SerialPin.P1, rx: SerialPin = SerialPin.P2, baud: BaudRate = BaudRate.BaudRate115200): void {
        moduleTx = tx
        moduleRx = rx
        moduleBaud = baud
    }

    /**
     * Tell the extension how the thermal printer is wired, so the serial port
     * can be handed back to it after each request. Use the same pin and baud
     * rate as the printer's own connect block.
     * @param tx the board pin wired to the printer's RX, eg: SerialPin.P8
     * @param baud the printer's baud rate, eg: BaudRate.BaudRate9600
     */
    //% blockId=espwifi_useprinter
    //% block="printer is on|TX pin %tx|baud rate %baud"
    //% tx.defl=SerialPin.P8 baud.defl=BaudRate.BaudRate9600
    //% group="Setup" weight=90
    export function usePrinterPort(tx: SerialPin = SerialPin.P8, baud: BaudRate = BaudRate.BaudRate9600): void {
        printerTx = tx
        printerBaud = baud
        printerKnown = true
    }

    // -------------------------------------------------------- port handover

    function toModule(): void {
        serial.redirect(moduleTx, moduleRx, moduleBaud)
        serial.setRxBufferSize(254)
        basic.pause(20)
    }

    function toPrinter(): void {
        if (!printerKnown) return
        // the module's TX pin doubles as the unused RX pin while printing
        serial.redirect(printerTx, moduleRx, printerBaud)
        basic.pause(20)
    }

    /** Collect the module's answer until it says it is done, or time runs out. */
    function readReply(timeoutMs: number, stop: string): string {
        let buf = ""
        const deadline = control.millis() + timeoutMs
        while (control.millis() < deadline) {
            const chunk = serial.readString()
            if (chunk.length > 0) {
                buf = buf + chunk
                if (stop.length > 0 && buf.indexOf(stop) >= 0) break
                if (buf.indexOf("ERROR") >= 0) break
            } else {
                basic.pause(5)
            }
        }
        return buf
    }

    function at(command: string, timeoutMs: number, stop: string): string {
        serial.readString()              // drop anything left over
        serial.writeString(command + "\r\n")
        lastReply = readReply(timeoutMs, stop)
        return lastReply
    }

    // ----------------------------------------------------------- Connection

    /**
     * Join a WiFi network. Takes a few seconds; returns true when it worked.
     * @param ssid the network name
     * @param password the network password
     */
    //% blockId=espwifi_connect
    //% block="connect to WiFi|network %ssid|password %password"
    //% group="Connection" weight=100 blockGap=8
    export function connectToNetwork(ssid: string, password: string): boolean {
        toModule()
        at("AT", 2000, "OK")
        at("AT+CWMODE=1", 2000, "OK")
        const reply = at("AT+CWJAP=\"" + ssid + "\",\"" + password + "\"", 20000, "OK")
        at("AT+CIPMUX=0", 2000, "OK")
        connected = reply.indexOf("OK") >= 0 || reply.indexOf("GOT IP") >= 0
        toPrinter()
        return connected
    }

    /** True when the last attempt to join a network worked. */
    //% blockId=espwifi_isconnected
    //% block="WiFi connected"
    //% group="Connection" weight=90
    export function isConnected(): boolean {
        return connected
    }

    /**
     * The raw text the module sent back last time. Useful when something does
     * not work and you want to see what the module actually said.
     */
    //% blockId=espwifi_lastreply
    //% block="last WiFi module reply"
    //% group="Connection" weight=80
    //% advanced=true
    export function lastModuleReply(): string {
        return lastReply
    }

    // -------------------------------------------------------------- Request

    /**
     * Fetch a page over plain HTTP and give back the body.
     * Plain HTTP only - these modules cannot do HTTPS reliably, which is why
     * the relay service exists. Keep answers small, the board has little room.
     * @param host the server, eg: "192.168.1.10"
     * @param port the port, eg: 8080
     * @param path the path including any query, eg: "/latest?platform=mastodon"
     */
    //% blockId=espwifi_httpget
    //% block="HTTP GET|host %host|port %port|path %path"
    //% host.defl="192.168.1.10" port.defl=8080 path.defl="/latest"
    //% group="Request" weight=100
    export function httpGet(host: string, port: number, path: string): string {
        toModule()

        at("AT+CIPSTART=\"TCP\",\"" + host + "\"," + port, 8000, "OK")

        const request = "GET " + path + " HTTP/1.1\r\n"
            + "Host: " + host + "\r\n"
            + "Connection: close\r\n\r\n"

        at("AT+CIPSEND=" + request.length, 3000, ">")
        serial.writeString(request)

        const raw = readReply(12000, "CLOSED")
        at("AT+CIPCLOSE", 1000, "OK")

        toPrinter()
        return bodyOf(raw)
    }

    /** Remove the "+IPD,<length>:" markers the module puts before each chunk. */
    function stripChunkMarkers(raw: string): string {
        let out = ""
        let rest = raw
        while (true) {
            const start = rest.indexOf("+IPD,")
            if (start < 0) {
                out = out + rest
                break
            }
            let piece = rest.substr(0, start)
            // the module puts a line break of its own in front of each marker;
            // it is not part of the page, so it has to go as well. The relay
            // separates its lines with \n alone, so nothing real is lost here.
            if (piece.length >= 2 && piece.substr(piece.length - 2) == "\r\n") {
                piece = piece.substr(0, piece.length - 2)
            }
            out = out + piece
            // the colon has to be the one closing THIS marker - searching the
            // whole string would find the one in a header or in a timestamp
            const marker = rest.substr(start)
            const colon = marker.indexOf(":")
            if (colon < 0) break
            rest = marker.substr(colon + 1)
        }
        return out
    }

    /** Everything after the HTTP headers, with the module's chatter removed. */
    function bodyOf(raw: string): string {
        const stream = stripChunkMarkers(raw)
        const split = stream.indexOf("\r\n\r\n")
        if (split < 0) return ""
        let body = stream.substr(split + 4)
        // cut at whichever piece of module chatter comes first
        const noise = ["\r\nCLOSED", "\r\nOK", "\r\nERROR", "\r\n+IPD"]
        let cut = body.length
        for (let i = 0; i < noise.length; i++) {
            const at = body.indexOf(noise[i])
            if (at >= 0 && at < cut) cut = at
        }
        return body.substr(0, cut)
    }
}
