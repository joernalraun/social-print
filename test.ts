// Prints every new @calliopemini post on a thermal till-roll printer.
//
// Wiring, Calliope mini 3 and micro:bit alike:
//   WiFi module TX -> P2, module RX -> P1, printer RX -> P8 (C8 on the mini 3)
//   everything sharing one GND.
// The WiFi module needs its OWN 3.3 V supply - the board cannot feed it.
// With a Grove WiFi module on a Calliope mini 3, plug it into Grove A1 and
// swap the pins below for SerialPin.P17 (shown as C17, TX) and SerialPin.P16
// (shown as C16, RX). Those two only exist on the Calliope. See README.md.

thermalPrinter.connect(SerialPin.P8, BaudRate.BaudRate9600)

espWifi.useWifiModule(SerialPin.P1, SerialPin.P2, BaudRate.BaudRate115200)
espWifi.usePrinterPort(SerialPin.P8, BaudRate.BaudRate9600)

socialFeed.setRelay("192.168.1.10", 8080)

basic.showString("W")
if (espWifi.connectToNetwork("MY-WIFI", "my-password")) {
    basic.showIcon(IconNames.Yes)
} else {
    basic.showIcon(IconNames.No)
}

// do not print everything that was already there when the board started
socialFeed.ignorePostsUpToNow(SocialPlatform.Any)

basic.forever(function () {
    if (socialFeed.checkForNewPost(SocialPlatform.Any)) {
        thermalPrinter.setAlignment(thermalPrinter.Alignment.Centre)
        thermalPrinter.setBold(true)
        thermalPrinter.printLine(socialFeed.postPlatform())
        thermalPrinter.setBold(false)
        thermalPrinter.setSmallFont(true)
        thermalPrinter.printLine(socialFeed.postTime())
        thermalPrinter.setSmallFont(false)

        thermalPrinter.setAlignment(thermalPrinter.Alignment.Left)
        thermalPrinter.printLine("")
        thermalPrinter.printLine(socialFeed.postText())
        thermalPrinter.feedLines(3)
    }
    basic.pause(60000)
})
