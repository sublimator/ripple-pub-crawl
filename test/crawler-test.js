var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var util = require('util');
var crawler = require('../src/lib/crawler');

var Crawler = crawler.Crawler;
var normalizePubKey = crawler.normalizePubKey;

function TestCrawler() {
  Crawler.apply(this, arguments);
  this.logger = {log: _.noop, error: _.noop};
}

util.inherits(TestCrawler, Crawler);

TestCrawler.prototype.crawlSingle = function(ip, onResponse) {
  var response = this.responses_[ip];
  var err = !response ? 'no response' : null;
  var json = !response ? null : response;
  process.nextTick(function() {
    onResponse(err, response);
  });
}

describe('TestCrawler', function() {
  var crawler;
  var fixture = __dirname + '/crawl-fixtures.json';
  var responses = JSON.parse(fs.readFileSync(fixture));
  var pub2ip = {};
  var allpubs = {};

  function eachActive(func) {
    _.forOwn(responses, function(resp) {
      resp.overlay.active.forEach(func);
    });
  }
  eachActive(function(a) {
    if (a.public_key) {
      a.public_key = normalizePubKey(a.public_key);
      allpubs[a.public_key] = true;
    };
  });
  eachActive(function(a) {
    if (a.public_key && a.ip) {
      pub2ip[a.public_key] = a.ip;
    };
  });
  eachActive(function(a) {
    if (a.public_key && !a.ip) {
      a.ip = pub2ip[a.public_key];
    };
  });

  var expectedPeers = Object.keys(allpubs).length;

  beforeEach('function', function(){
    crawler = new TestCrawler();
    crawler.responses_ = _.cloneDeep(responses);
  })

  var ips = Object.keys(responses);
  ips.slice(0, 10).forEach(function(ip) {
    it('it works for ip: ' + ip, function(done) {
      crawler.once('done', function() {
        function add(a, b) { return a + b; }
        // [peers_at_hop_n, peers_at_hop_n+1, ...]
        var peers_at_n_hops = _.map(_.groupBy(crawler.byPub, 'hops'), 'length');
        var peers = peers_at_n_hops.reduce(add);
        assert(peers == 131);
        assert(peers == expectedPeers);
        done();
      });
      crawler.enter(ip);
    });
  });
})