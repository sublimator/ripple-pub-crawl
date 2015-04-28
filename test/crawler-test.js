var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var util = require('util');
var Crawler = require('../src/lib/crawler').Crawler;
var normalizePubKey = require('../src/lib/crawler').normalizePubKey;

function TestCrawler() {
  Crawler.apply(this, arguments);
  var noop = function(){};
  this.logger = {log: noop, error: noop};
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
    _.forOwn(responses, function(resp, ip) {
      resp.overlay.active.forEach(function(a){
        func(a);
      });
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
        var vals = _.map(_.groupBy(crawler.byPub, function(v, k) {
          return v.hops;
        }), function(v, k){
          return v.length;
        });
        var peers = vals.reduce(function(a,b){ return a+b});
        assert(peers == 131);
        assert(peers == expectedPeers);
        done();
      });
      crawler.enter(ip);
    });
  });
})