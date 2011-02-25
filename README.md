# dsm
Distributed Services for Mozilla

The dsm library can be used in Firefox Jetpack extensions to perform peer-to-peer asynchronous communications.
It's currently in the first implementation phases so it's mostly non working. Have a look at the tests directory to understand what's the current state of affairs.

## Example usage (when it will be ready)
The following code creates the endpoint "helloWorld" and establishes a connection to a peer with IP peerIP and port peerPort and sends the message "Hello". The peer, upon receiving the message replies with "World".

    const dsm = require("dsm");
    
    const ep = new dsm.endpoint("helloWorld", function(msg) {
        // this function gets called every time this endpoint receives a message
        if (msg.getData() == "Hello")
            msg.reply("World");
    });
    
    var c = new dsm.connection(peerIP, peerPort, function() {
        // this function gets called once the connection has been established
        ep.sendMessage("Hello", this.getRemoteId());
    });

The first parameter to sendMessage and reply is the payload to be sent. It can be any JSON-serializable object.

The second parameter to sendMessage is optional and is used to specify which peer will be sent the message. If it is a string it is interpreted as a peerId. If it is an array it is interpreted as a list of peerIds. If it is an integer it is interpreted as a number of random peers. If missing (undefined, null or false), the message will be sent to all currently connected peers. If true, the message will be sent to all known peers.

sendMessage and reply also have a last callback parameter (not shown in the example above) where you can supply a function to be called either on succesful or failed transmission.

