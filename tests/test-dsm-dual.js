const timer = require("timer");
const dsm = require("dsm");
const dsm1 = dsm.global;
const dsm2 = new dsm.dsm();
const dsm3 = new dsm.dsm();

exports.test_id = function(test) {
  test.assert(dsm1.nodeId != dsm2.nodeId);
  test.assert(dsm2.nodeId != dsm3.nodeId);
  test.assert(dsm3.nodeId != dsm1.nodeId);
};

exports.test_connect = function(test) {
  test.waitUntilDone();
  var c2 = dsm1.connect("localhost", dsm2.listeningPort);
  timer.setTimeout(function() {
    test.assert(c2.RemoteID === dsm2.nodeId);
    test.done();
  }, 1000);
};

exports.test_connectExportedGlobal = function(test) {
  test.waitUntilDone();
  var c3 = dsm.connect("localhost", dsm3.listeningPort);
  timer.setTimeout(function() {
    test.assert(c3.RemoteID === dsm3.nodeId);
    test.done();
  }, 1000);
};

exports.test_sendString = function(test) {
  test.waitUntilDone(1000);
  var ep1 = dsm1.listen("test");
  var ep2 = dsm2.listen("test");
  var str = "Hello World!";
  ep2.setContentSink(function(msg) {
    test.assert(msg.data === str);
    test.done();
  });
  ep1.sendMessage(str, dsm2.nodeId);
};

exports.test_replyString = function(test) {
  test.waitUntilDone(1000);
  var ep1 = dsm1.listen("test2");
  var ep2 = dsm2.listen("test2");
  var str1 = "Hello";
  var str2 = "World";
  ep1.setContentSink(function(msg) {
    test.assert(msg.data === str2);
    test.done();
  });
  ep2.setContentSink(function(msg) {
    test.assert(msg.data === str1);
    msg.reply(str2);
  });
  ep1.sendMessage(str1, dsm2.nodeId);
};

exports.test_multiSendString = function(test) {
  test.waitUntilDone(5000);
  var ep1 = dsm1.listen("test3");
  var ep2 = dsm2.listen("test3");
  var ep3 = dsm2.listen("test3");
  var str = "Hello World!";
  var count = 0;
  ep1.setContentSink(function(msg) {
    count++;
    if (count == 20)
        test.done();
    else if (count > 20)
        test.fail();
  });
  ep2.setContentSink(function(msg) {
    test.assert(msg.data.str === str);
    msg.reply(2);
  });
  ep3.setContentSink(function(msg) {
    test.assert(msg.data.str === str);
    msg.reply(3);
  });
  for (var i=0; i<10; i++) {
    ep1.sendMessage({str:str, i:i}, dsm2.nodeId);
    ep1.sendMessage({str:str, i:i}, dsm3.nodeId);
  }
};

