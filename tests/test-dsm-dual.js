const timer = require("timer");
const dsm = require("dsm");
const dsm1 = dsm.global;
const dsm2 = new dsm.dsm();
const dsm3 = new dsm.dsm();

exports.test_id = function(test) {
  test.assert(dsm1.controller.getNodeId() != dsm2.controller.getNodeId());
};

exports.test_connect = function(test) {
  test.waitUntilDone();
  var c2 = dsm1.connect("localhost", dsm2.socketprovider.getListeningPort());
  var c3 = dsm1.connect("localhost", dsm3.socketprovider.getListeningPort());
  timer.setTimeout(function() {
    test.assert(c2.RemoteID !== null);
    test.assert(c3.RemoteID !== null);
    test.done();
  }, 1000);
};

exports.test_sendString = function(test) {
  test.waitUntilDone(1000);
  var ep1 = dsm1.listen("test");
  var ep2 = dsm2.listen("test");
  var str = "Hello World!";
  ep2.setContentSink(function(msg) {
    test.assert(msg.getData() === str);
    test.done();
  });
  ep1.sendMessage(str, dsm2.controller.getNodeId());
};

exports.test_replyString = function(test) {
  test.waitUntilDone(1000);
  var ep1 = dsm1.listen("test2");
  var ep2 = dsm2.listen("test2");
  var str1 = "Hello";
  var str2 = "World";
  ep1.setContentSink(function(msg) {
    test.assert(msg.getData() === str2);
    test.done();
  });
  ep2.setContentSink(function(msg) {
    test.assert(msg.getData() === str1);
    msg.reply(str2);
  });
  ep1.sendMessage(str1, dsm2.controller.getNodeId());
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
    test.assert(msg.getData().str === str);
    msg.reply(2);
  });
  ep3.setContentSink(function(msg) {
    test.assert(msg.getData().str === str);
    msg.reply(3);
  });
  for (var i=0; i<10; i++) {
    ep1.sendMessage({str:str, i:i}, dsm2.controller.getNodeId());
    ep1.sendMessage({str:str, i:i}, dsm3.controller.getNodeId());
  }
};

