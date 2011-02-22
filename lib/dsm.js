// dsm // distributed services for mozilla

"use strict";
var {Cc, Ci, Cu, Cr, Cm} = require("chrome");
Cu.import("resource://gre/modules/NetUtil.jsm", this);

// helpers ///////////////////////////////////////////////////////////////////

function defined(obj) {
  return typeof obj != "undefined";
}

function assert(test, msg) {
  if (!test) throw new Exception(msg);
}

function clone(obj) {
  return eval( uneval( obj ) );
}

// socket provider ///////////////////////////////////////////////////////////

function socketprovider() {
  this.KeepRunning = true;
  this.ServerSocket = null; 
  this.ListeningPort = -1;
  this.ListeningAddress = null;
  
  this.initServerSocket();
}

socketprovider.prototype.initServerSocket = function() {
  this.ServerSocket = Cc["@mozilla.org/network/server-socket;1"].createInstance(Components.interfaces.nsIServerSocket);
  this.ServerSocket.init(this.ListeningPort, false, -1);
  this.ServerSocket.asyncListen(this);
  var dnsService = Cc["@mozilla.org/network/dns-service;1"].createInstance(Components.interfaces.nsIDNSService);
  this.ListeningPort = this.ServerSocket.port;
  console.log("Listening on port " + this.ListeningPort);
};

socketprovider.prototype.onSocketAccepted = function(serverSocket, transport) {
  assert( this.ServerSocket == serverSocket );
  new connection(transport);
};

socketprovider.prototype.onStopListening = function(serverSocket, status) {
  this.ServerSocket = null;
  if ( this.KeepRunning && status != NS_BINDING_ABORTED )
    setTimeout( initServerSocket, 1000 );
};

socketprovider.prototype.shutdown = function() {
  this.KeepRunning = false;
  this.ServerSocket.close();
};

socketprovider.prototype.getListeningPort = function() {
    return this.ListeningPort;
};

// connection /////////////////////////////////////////////////////////////////

function connection(transport) {
  this.Transport = transport;
  this.RemoteID = null;
  //transport.setEventSink(this, null);
  this.TransportStatus = null;
  this.TransportProgress = null;
  this.TransportProgressMax = null;
  this.BufferIn = "";
  this.BufferOut = "DSM/" + dsm.protocolVersion + "/" + dsm.identityprovider.nodeId() + "\0";
  this.StreamIn = transport.openInputStream(0, 0, 0);
  this.StreamOut = transport.openOutputStream(0, 0, 0);
  this.Thread = Cc["@mozilla.org/thread-manager;1"].getService().currentThread;
  this.StreamIn.asyncWait(this, 0, 0, this.Thread);
  this.StreamOut.asyncWait(this, 0, 0, this.Thread);
  console.log("connection created");
}

connection.open = function(ip, port) {
  var transport = dsm.socketservice.createTransport(null, 0, ip, port, null);
  return new connection(transport);
};

connection.prototype.close = function() {
  this.Transport.close();
  dsm.connectionregistry.remove(this);
};

connection.prototype.onTransportStatus = function(transport, status, progress, progressmax) {
  assert( this.Transport == transport );
  this.TransportStatus = status;
  this.TransportProgress = progress;
  this.TransportProgressMax = progressmax;
};

connection.prototype.onInputStreamReady = function(stream) {
  console.log("Input stream ready");
  assert( this.StreamIn == stream );
  var bytesAvailable = 0;
  try { bytesAvailable = stream.available(); } catch (e) {
    console.log("Input stream error");
    this.close();
    return;
  }
  console.log("Input stream receiving");
  if ( bytesAvailable > 0 ) {
    this.BufferIn += NetUtil.readInputStreamToString(stream, bytesAvailable);
    this.parseBufferIn();
  }
  stream.asyncWait(this, 0, 0, this.Thread);
};

connection.prototype.onOutputStreamReady = function(stream) {
  console.log("Output stream ready");
  assert( this.StreamOut == stream );
  if (this.BufferOut.length == 0) {
    var msg = dsm.messagebroker.getMessage(this.RemoteID);
    if (msg)
      this.BufferOut += msg.serialize() + "\0";
  }
  console.log("Output stream sending");
  var bytesCopied = stream.write(this.BufferOut, this.BufferOut.length);
  if (this.BufferOut.length > bytesCopied) {
    this.BufferOut = this.BufferOut.substr(bytesCopied);
    stream.asyncWait(this, 0, 0, this.Thread);
  } else {
    this.BufferOut = "";
  }
};

connection.prototype.onOutgoingDataAvailable = function() {
  console.log("no connection for the requested remoteid");
  this.onOutputStreamReady(this.StreamOut);
};

connection.prototype.parseBufferIn = function() {
  var pos;
  while ((pos = this.BufferIn.indexOf("\0")) != -1) {
    console.log("Decoding DSM message");
    console.log("len:"+this.BufferIn.length+" pos:"+pos);
    var message_raw = this.BufferIn.substring(0, pos+1);
    this.BufferIn = this.BufferIn.substr(pos+1);
    if ( this.RemoteID ) {
      console.log("Parsing DSM message");
      console.log(message_raw);
      var msg = message.parse( message_raw );
      if ( msg && msg.getFrom() == this.RemoteID && msg.getTo() == dsm.identityprovider.nodeId() )
		dsm.messagebroker.putMessage( msg );
    } else {
      console.log("Looking for DSM header");
      var handshake = /DSM\/([0-9]+)\/([^\0]+)\0/.exec(message_raw);
      if (handshake == false || handshake[1] != dsm.protocolVersion)
        return false;
      console.log("DSM header found");
      this.RemoteID = handshake[2];
      dsm.connectionregistry.add(this);
    }
  }
};

connection.prototype.getRemoteId = function() {
  return this.RemoteID;
};

// connection registry ///////////////////////////////////////////////////////

function connectionregistry() {
  this.connections = [];
}

connectionregistry.prototype.shutdown = function() {
  for (var i=0; i<this.connections.length; i++)
    this.connections[i].close();
};

connectionregistry.prototype.add = function(conn) {
  var idx = this.getConnectionIndex(conn);
  if (idx === false)
    this.connections.push(conn);
  console.log("connection added to registry");
};

connectionregistry.prototype.remove = function(conn) {
  var idx = this.getConnectionIndex(conn);
  if (idx !== false)
    this.connections.split(idx, 1);
};

connectionregistry.prototype.getConnectionIndex = function(conn) {
  for (var i=0; i<this.connections.length; i++)
    if (this.connections[i] == conn)
      return i;
  return false;
}

connectionregistry.prototype.getConnectionFor = function(remoteid) {
  console.log("getConnectionFor " + uneval(remoteid));
  for (var i=0; i<this.connections.length; i++) {
    console.log("-- " + uneval(this.connections[i].getRemoteId()));
    if (this.connections[i].getRemoteId() == remoteid)
      return this.connections[i];
  }
  return false;
};

connectionregistry.prototype.onOutgoingDataAvailable = function(remoteid) {
  var conn = dsm.connectionregistry.getConnectionFor( remoteid );
  if (conn)
    conn.onOutgoingDataAvailable();
  else
    console.log("no connection for the requested remoteid");
};



// message //////////////////////////////////////////////////////////////////

function message(data, to, type) {
  this.from = dsm.identityprovider.nodeId();
  this.to = "" + to;
  this.type = "" + type;
  this.data = clone(data);
  
  var _this = this;
  this.unserialize = function(data) {
    var obj;
    try { obj = JSON.parse(data); } catch (e) {
      return false;
    }
    _this.from = "" + obj.from;
    _this.to = "" + obj.to;
    _this.type = "" + obj.type;
    _this.data = obj.data;
    _this.unserialize = null;
    return true;
  };
}

message.parse = function(data) {
  var m = new message();
  return m.unserialize(data) ? m : false;
};

message.prototype.serialize = function() {
  return JSON.stringify({
    from: this.from,
    to:   this.to,
    type: this.type,
    data: this.data
  });
};

message.prototype.reply = function(obj) {
  var m = new message(obj, this.from, this.type);
  dsm.messagebroker.putMessage(m);
};

message.prototype.getFrom = function() { 
  return this.from; 
};

message.prototype.getTo = function() { 
  return this.to; 
};

message.prototype.getType = function() { 
  return this.type; 
};

message.prototype.getData = function() { 
  return clone(this.data); 
};

// message broker ///////////////////////////////////////////////////////////

function messagebroker() {
  this.outgoing = [];
  this.terminals = [];
}

messagebroker.prototype.getMessage = function(recipient) {
  if ( this.outgoing[ recipient ] )
    return this.outgoing[ recipient ].shift();
  return false;
};

messagebroker.prototype.putMessage = function(msg) {
  if (msg.to == dsm.identityprovider.nodeId()) {
    console.log("putMessage > incoming");
    var t;
    if ( t = this.terminals[ msg.type ] )
      for ( var i=0; i<t.length; i++ )
        t[i].deliverToContentSink(msg);
  } else {
    console.log("putMessage > outgoing");
    if ( !this.outgoing[ msg.to ] )
      this.outgoing[ msg.to ] = [];
    this.outgoing[ msg.to ].push(msg);
    dsm.connectionregistry.onOutgoingDataAvailable( msg.to );
  }
};

messagebroker.prototype.registerTerminal = function(terminal) {
  if (!this.terminals[ terminal.terminalId ])
    this.terminals[ terminal.terminalId ] = [];
  if (this.terminals[ terminal.terminalId ].indexOf(terminal) == -1)
    this.terminals[ terminal.terminalId ].push(terminal);
};

messagebroker.prototype.unregisterTerminal = function(terminal) {
  if (!this.terminals[ terminal.terminalId ])
    return false;
  var idx = this.terminals[ terminal.terminalId ].indexOf(terminal);
  if (idx == -1)
    return false;
  this.terminals[ terminal.terminalId ].splice(idx, 1);
  return true;
};

// messageterminal //////////////////////////////////////////////////////////

function messageterminal(terminalId) {
  this.terminalId = "" + terminalId;
  this.contentSink = this;
  this.buffer = [];
  dsm.messagebroker.registerTerminal(this);
}

messageterminal.prototype.setContentSink = function(listener) {
  if (typeof listener == "function" || (listener && typeof listener.onMessageReceived == "function"))
    this.contentSink = listener;
  if (this.contentSink != this)
    while ( this.buffer.length > 0 )
      this.deliverToContentSink( this.buffer.shift() );
};

messageterminal.prototype.deliverToContentSink = function(msg) {
  if (typeof this.contentSink == "function")
    this.contentSink(msg);
  else
    this.contentSink.onMessageReceived(msg);
};

messageterminal.prototype.onMessageReceived = function(msg) {
  this.buffer.push(msg);
};

messageterminal.prototype.sendMessage = function(obj, to) {
  var m = new message(obj, to, this.terminalId);
  dsm.messagebroker.putMessage(m);
};

messageterminal.prototype.getMessage = function() {
  if (this.contentSink != this || this.buffer.length == 0)
    return false;
  return this.buffer.shift();
};

messageterminal.prototype.close = function() {
  dsm.messagebroker.unregisterTerminal(this);
  this.contentSink = null;
  this.buffer = null;
};

// identityprovider //////////////////////////////////////////////////////////

function identityprovider() {
}

identityprovider.prototype.nodeId = function() {
    return "" + dsm.socketprovider.getListeningPort();
};

// controller ////////////////////////////////////////////////////////////////

function controller() {
}

// dsm global object /////////////////////////////////////////////////////////

var dsm = {
  version: 0,
  protocolVersion: 0,
  socketservice: Cc["@mozilla.org/network/socket-transport-service;1"].getService(Components.interfaces.nsISocketTransportService),
  socketprovider: new socketprovider(),
  connectionregistry: new connectionregistry(),
  messagebroker: new messagebroker(),
  identityprovider: new identityprovider()
};

// exports ///////////////////////////////////////////////////////////////////

exports.version = dsm.version;
exports.connection = connection;
exports.messageterminal = messageterminal;
