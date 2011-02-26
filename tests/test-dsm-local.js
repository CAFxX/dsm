const dsm = require("dsm");
const gdsm = dsm.global;

exports.test_id = function(test) {
  test.assert(require("self").id.length > 0);
};

exports.test_NodeId = function(test) {
  test.assert(gdsm.nodeId.length > 0);
};

exports.test_sendMessageStringToSelfExportedGlobal = function(test) {
  var ep = dsm.listen("test");
  test.assert(ep != null);
  test.assert(ep.getMessage() == false);
  const msg = "test message";
  ep.sendMessage(msg, dsm.nodeId);
  test.assert(ep.getMessage().data == msg);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageStringToSelf = function(test) {
  var ep = gdsm.listen("test");
  test.assert(ep != null);
  test.assert(ep.getMessage() == false);
  const msg = "test message";
  ep.sendMessage(msg, gdsm.nodeId);
  test.assert(ep.getMessage().data == msg);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageObjectToSelf = function(test) {
  var ep = gdsm.listen("test");
  test.assert(ep != null);
  const msg = Date.now();
  ep.sendMessage(msg, gdsm.nodeId);
  test.assert(ep.getMessage().data == msg);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageStringToSelfAndReply = function(test) {
  var ep = gdsm.listen("test");
  test.assert(ep != null);
  const msg = "test message";
  ep.sendMessage(msg, gdsm.nodeId);
  const msg2 = "test reply";
  ep.getMessage().reply(msg2);
  test.assert(ep.getMessage().data == msg2);
  test.assert(ep.getMessage() == false);
  ep.close();
};

exports.test_sendMessageStringToSelfMulti = function(test) {
  var ep = gdsm.listen("test");
  var ep2 = gdsm.listen("test");
  test.assert(ep != null);
  const msg = "test message";
  ep.sendMessage(msg, gdsm.nodeId);
  test.assert(ep.getMessage().data == msg);
  test.assert(ep2.getMessage().data == msg);
  test.assert(ep.getMessage() == false);
  test.assert(ep2.getMessage() == false);
  ep.close();
};

