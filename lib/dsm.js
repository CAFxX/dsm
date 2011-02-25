// dsm // distributed services for mozilla

"use strict";
const simpleStorage = require("simple-storage");
const {Cc, Ci, Cu, Cr, Cm} = require("chrome");
const timer = require("timer");
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

function socketprovider(idsm) {
  this.dsm = idsm;
  this.KeepRunning = true;
  this.ServerSocket = null; 
  this.ListeningPort = -1;
  this.ListeningAddress = null;
  
  this.initServerSocket();
}

socketprovider.prototype.initServerSocket = function() {
  this.ServerSocket = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
  this.ServerSocket.init(this.ListeningPort, false, -1);
  this.ServerSocket.asyncListen(this);
  var dnsService = Cc["@mozilla.org/network/dns-service;1"].createInstance(Ci.nsIDNSService);
  this.ListeningPort = this.ServerSocket.port;
  console.log("Listening on port " + this.ListeningPort);
};

socketprovider.prototype.onSocketAccepted = function(serverSocket, transport) {
  assert( this.ServerSocket == serverSocket );
  new connection(this.dsm, transport);
};

socketprovider.prototype.onStopListening = function(serverSocket, status) {
  this.ServerSocket = null;
  if ( this.KeepRunning && status != NS_BINDING_ABORTED )
    timer.setTimeout( initServerSocket, 1000 );
};

socketprovider.prototype.shutdown = function() {
  this.KeepRunning = false;
  this.ServerSocket.close();
};

socketprovider.prototype.getListeningPort = function() {
    return this.ListeningPort;
};

// connection /////////////////////////////////////////////////////////////////

function connection(idsm, transport) {
  this.dsm = idsm;
  this.Transport = transport;
  this.RemoteID = null;
  this.Thread = Cc["@mozilla.org/thread-manager;1"].getService().currentThread;
  transport.setEventSink(this, this.Thread);
  this.TransportStatus = null;
  this.TransportProgress = null;
  this.TransportProgressMax = null;
  this.BufferIn = "";
  this.BufferOut = "DSM/" + this.dsm.protocolVersion + "/" + this.dsm.identityprovider.nodeId() + "\0";
  this.MessageOut = null;
  this.StreamIn = transport.openInputStream(0, 0, 0);
  this.StreamOut = transport.openOutputStream(0, 0, 0);
  this.StreamIn.asyncWait(this, 0, 0, this.Thread);
  this.StreamOut.asyncWait(this, 0, 0, this.Thread);
  console.log("connection created - host: " + this.Transport.host + ", port: " + this.Transport.port);
}

connection.open = function(idsm, ip, port) {
  var transport = idsm.socketservice.createTransport(null, 0, ip, port, null);
  return new connection(idsm, transport);
};

connection.prototype.close = function(retry) {
  this.Transport.close();
  this.dsm.connectionregistry.remove(this);
  if (retry)
    connection.open(this.Transport.host, this.Transport.port);
};

connection.prototype.onTransportStatus = function(transport, status, progress, progressmax) {
  assert( this.Transport == transport );
  this.TransportStatus = status;
  this.TransportProgress = progress;
  this.TransportProgressMax = progressmax;
};

connection.prototype.onInputStreamReady = function(stream) {
  //console.log("Input stream ready");
  assert( this.StreamIn == stream );
  try { 
    var bytesAvailable = stream.available(); 
    //console.log("Input stream receiving");
    if ( bytesAvailable > 0 ) {
      this.BufferIn += NetUtil.readInputStreamToString(stream, bytesAvailable);
      this.parseBufferIn();
    }
    stream.asyncWait(this, 0, 0, this.Thread);
  } catch (e) {
    console.log("Input stream error");
    this.close(e.name != "NS_BASE_STREAM_CLOSED"); 
  }
};

connection.prototype.onOutputStreamReady = function(stream) {
  //console.log("Output stream ready");
  assert( this.StreamOut == stream );
  if (this.BufferOut.length == 0) {
    this.MessageOut = this.dsm.messagebroker.getMessage(this.RemoteID);
    if (this.MessageOut)
      this.BufferOut = this.MessageOut + "\0";
  }
  //console.log("Output stream sending");
  try {
    var bytesCopied = stream.write(this.BufferOut, this.BufferOut.length);
    if (this.BufferOut.length > bytesCopied) {
      this.BufferOut = this.BufferOut.substr(bytesCopied);
      stream.asyncWait(this, 0, 0, this.Thread);
    } else {
      this.BufferOut = "";
      this.MessageOut = null;
    }
  } catch (e) {
    console.log("Output stream error");
    this.close(e.name != "NS_BASE_STREAM_CLOSED"); 
    this.dsm.messagebroker.putMessage(this.MessageOut, true);
  }
};

connection.prototype.onOutgoingDataAvailable = function() {
  //console.log("Outgoing data available for " + this.RemoteID);
  this.onOutputStreamReady(this.StreamOut);
};

connection.prototype.parseBufferIn = function() {
  var pos;
  while ((pos = this.BufferIn.indexOf("\0")) != -1) {
    //console.log("Decoding DSM message");
    //console.log("len:"+this.BufferIn.length+" pos:"+pos);
    var message_raw = this.BufferIn.substring(0, pos);
    this.BufferIn = this.BufferIn.substr(pos+1);
    if ( this.RemoteID ) {
      //console.log("Parsing DSM message");
      //console.log(uneval(message_raw));
      var msg = message.parse( this.dsm, message_raw );
      if ( msg && msg.getFrom() == this.RemoteID && msg.getTo() == this.dsm.identityprovider.nodeId() )
		    this.dsm.messagebroker.putMessage( msg );
    } else {
      console.log("Looking for DSM header");
      var handshake = /^DSM\/([0-9]+)\/(.*)$/.exec(message_raw);
      if (handshake == false || parseInt(handshake[1]) != this.dsm.protocolVersion)
        return false;
      console.log("DSM header found");
      this.RemoteID = handshake[2];
      this.dsm.connectionregistry.add(this);
      this.dsm.peerdirectory.add(this.RemoteID, this.Transport.host, this.Transport.port);
    }
  }
};

connection.prototype.getRemoteId = function() {
  return this.RemoteID;
};

// connection registry ///////////////////////////////////////////////////////

function connectionregistry(idsm) {
  this.dsm = idsm;
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
  //console.log("getConnectionFor " + uneval(remoteid));
  for (var i=0; i<this.connections.length; i++)
    if (this.connections[i].getRemoteId() == remoteid)
      return this.connections[i];
  return false;
};

connectionregistry.prototype.onOutgoingDataAvailable = function(remoteid) {
  var conn = this.dsm.connectionregistry.getConnectionFor( remoteid );
  if (conn) {
    conn.onOutgoingDataAvailable();
  } else {
    //console.log("no connection for outgoing data");
    var ipport = this.dsm.peerdirectory.get(remoteid);
    if (ipport) {
      new connection(this.dsm, ipport.ip, ipport.port);
    } else {
      //console.log("unknown remoteid");
    }
  }
};

// peerdirectory ////////////////////////////////////////////////////////////

function peerdirectory(idsm) {
  this.dsm = idsm;
  if (!simpleStorage.storage.peers)
    simpleStorage.storage.peers = [];
  var _this = this;
  simpleStorage.on("OverQuota", function() { _this.onOverQuota(); });
}

peerdirectory.prototype.add = function(id, ip, port) {
  simpleStorage.storage.peers[id] = {
    ip: ip,
    port: port,
    lastconn: Date.now()
  };
};

peerdirectory.prototype.get = function(id) {
  return simpleStorage.storage.peers[id] ? { 
    ip: this.peers[id].ip, 
    port: this.peers[id].port 
  } : null;
};

peerdirectory.prototype.onOverQuota = function() {
  var peers = clone(simpleStorage.storage.peers);
  peers.sort(function(a,b) {
    return a.lastconn.toTime() - b.lastconn.toTime();
  });
  while (simpleStorage.quotaUsage > 0.75) {
    var peer = peers.shift();
    var peerIdx = simpleStorage.storage.peers.indexOf(peer);
    simpleStorage.storage.peers.splice(peerIdx, 1);
  }
};

// message //////////////////////////////////////////////////////////////////

function message(idsm, data, to, type) {
  this.dsm = idsm;
  this.from = this.dsm.identityprovider.nodeId();
  this.to = "" + to;
  this.type = "" + type;
  this.data = clone(data);
  
  var _this = this;
  this.unserialize = function(data) {
    var obj;
    try { obj = JSON.parse(data); } catch (e) {
      console.log("Failed parsing JSON");
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

message.parse = function(idsm, data) {
  var m = new message(idsm);
  return m.unserialize(data) ? m : false;
};

message.prototype.toString = 
message.prototype.serialize = function() {
  return JSON.stringify({
    from: this.from,
    to:   this.to,
    type: this.type,
    data: this.data
  });
};

message.prototype.reply = function(obj) {
  var m = new message(this.dsm, obj, this.from, this.type);
  this.dsm.messagebroker.putMessage(m);
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

function messagebroker(idsm) {
  this.dsm = idsm;
  this.outgoing = [];
  this.terminals = [];
}

messagebroker.prototype.getMessage = function(recipient) {
  if ( this.outgoing[ recipient ] )
    return this.outgoing[ recipient ].shift();
  return false;
};

messagebroker.prototype.putMessage = function(msg, atFront) {
  if (msg.to == this.dsm.identityprovider.nodeId()) {
    //console.log("putMessage > incoming");
    var t;
    if ( t = this.terminals[ msg.type ] ) {
      for ( var i=0; i<t.length; i++ ) {
        var terminal = t[i].get();
        if (terminal)
          terminal.deliverToContentSink(msg, atFront);
      }
    }
  } else {
    //console.log("putMessage > outgoing");
    if ( !this.outgoing[ msg.to ] )
      this.outgoing[ msg.to ] = [];
    if (atFront)
      this.outgoing[ msg.to ].unshift(msg);
    else
      this.outgoing[ msg.to ].push(msg);
    this.dsm.connectionregistry.onOutgoingDataAvailable( msg.to );
  }
};

messagebroker.prototype.registerTerminal = function(terminal) {
  if (!this.terminals[ terminal.terminalId ])
    this.terminals[ terminal.terminalId ] = [];
  if (this.terminals[ terminal.terminalId ].indexOf(terminal) == -1)
    this.terminals[ terminal.terminalId ].push(terminal.getWeakRef());
};

messagebroker.prototype.unregisterTerminal = function(terminal) {
  var terminals = this.terminals[ terminal.terminalId ];
  if (!terminals)
    for (var i=0; i<terminals.length; i++)
      if (terminals[i].get() === terminal)
        return terminals.splice(i, 1);
  return false;
};

messagebroker.prototype.filterTerminals = function() {
  for (var i=0; i<this.terminals.length; i++) {
    this.terminals[i] = this.terminals[i].filter(function (weakRef) {
      return weakRef.get() !== null;
    });
  }
};

// messageterminal //////////////////////////////////////////////////////////

function messageterminal(idsm, terminalId) {
  this.dsm = idsm;
  this.terminalId = "" + terminalId;
  this.contentSink = this;
  this.buffer = [];
  this.dsm.messagebroker.registerTerminal(this);
}

messageterminal.prototype.QueryInterface = function(IID) { 
  if (IID.equals(Ci.nsISupportsWeakReference) || IID.equals(Ci.nsISupports)) 
    return this;
  throw Cr.NS_NOINTERFACE; 
};

messageterminal.prototype.getWeakRef = function() {
  return Cu.getWeakReference(this);
};

messageterminal.prototype.setContentSink = function(listener) {
  if (typeof listener == "function" || (listener && typeof listener.onMessageReceived == "function"))
    this.contentSink = listener;
  if (this.contentSink != this)
    while ( this.buffer.length > 0 )
      this.deliverToContentSink( this.buffer.shift() );
};

messageterminal.prototype.deliverToContentSink = function(msg, atFront) {
  if (!this.contentSink)
    return;
  if (typeof this.contentSink == "function")
    this.contentSink(msg);
  else
    this.contentSink.onMessageReceived(msg, atFront);
};

messageterminal.prototype.onMessageReceived = function(msg, atFront) {
  if (atFront)
    this.buffer.unshift(msg);
  else
    this.buffer.push(msg);
};

messageterminal.prototype.sendMessage = function(obj, to) {
  var recipients = [];
  if (typeof to == "string")
    recipients.push(to);
  else if (Array.isArray(to))
    recipients.concat(to);
  else if (typeof to == "number")
    throw new Exception("unimplemented");
  else if (to === true)
    throw new Exception("unimplemented");
  else if (to == false)
    throw new Exception("unimplemented");
  else        
    throw new Exception("invalid <to>");
  for (var i=0; i<recipients.length; i++) {
    var m = new message(this.dsm, obj, recipients[i], this.terminalId);
    this.dsm.messagebroker.putMessage(m);
  }
};

messageterminal.prototype.getMessage = function() {
  if (this.contentSink != this)
    throw new Exception("getMessage() can't be called when a content sink has been specified");
  return this.buffer.length > 0 ? this.buffer.shift() : false;
};

messageterminal.prototype.close = function() {
  this.dsm.messagebroker.unregisterTerminal(this);
  this.contentSink = null;
  this.buffer = null;
};

// identityprovider //////////////////////////////////////////////////////////

function identityprovider(idsm) {
  this.dsm = idsm;
 //if (!simpleStorage.nodeId)
    this._nodeId = this.generateNodeId();
  console.log("nodeId: " + this.nodeId());
}

identityprovider.prototype.nodeId = function() {
  return this._nodeId.toString();
};

identityprovider.prototype.generateNodeId = function() {
  const bytes = 16;
  var id = "";
  for (var i=0; i<bytes*2; i++) 
    id += Math.floor(Math.random() * 16).toString(16);
  return id;
};

// controller ////////////////////////////////////////////////////////////////

function controller(idsm) {
  this.dsm = idsm;
  timer.setInterval( this.dsm.messagebroker.filterTerminals, 60000 );
}

controller.prototype.getNodeId = function() {
  return this.dsm.identityprovider.nodeId();
};

// dsm global object /////////////////////////////////////////////////////////

function dsm() {
  this.version = 0;
  this.protocolVersion = 0;
  this.socketservice = Cc["@mozilla.org/network/socket-transport-service;1"].getService(Ci.nsISocketTransportService);
  this.socketprovider = new socketprovider(this);
  this.connectionregistry = new connectionregistry(this);
  this.peerdirectory = new peerdirectory(this);
  this.messagebroker = new messagebroker(this);
  this.identityprovider = new identityprovider(this);
  this.controller = new controller(this);
};

dsm.prototype.listen = function(terminalId) {
  return new messageterminal(this, terminalId);
};

dsm.prototype.connect = function(ip, port) {
  return connection.open(this, ip, port);
};

const global_dsm = new dsm();

// exports ///////////////////////////////////////////////////////////////////

exports.global = global_dsm;
exports.dsm = dsm;
