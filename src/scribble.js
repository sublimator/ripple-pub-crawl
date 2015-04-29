'use strict';

/*eslint no-shadow:0*/

/* -------------------------------- REQUIRES -------------------------------- */

var extend = require('extend');
var geoip = require('geoip-lite');
var fs = require('fs');
var Sequelize = require('sequelize');
var Promise = Sequelize.Promise;
var _ = require('lodash');

var modelsFactory = require('./lib/models');
var Crawler = require('./lib/crawler').Crawler;


var json = JSON.parse(fs.readFileSync('crawl.json'));
console.log(Object.keys(json))

var dbUrl = 'postgres://postgres:zxccxz@localhost:5432/crawl';
var sql = new Sequelize(dbUrl, {logging: false});
var models = modelsFactory(sql, Sequelize);

sql
  .sync()
  .then(function() {
    var pubs = {};
    _.values(json).forEach(function(peerData){
      peerData.overlay.active.forEach(function(peer) {
        if (peer.public_key) {
          pubs[peer.public_key] = true;
        };
      });
    });
    return models.Peer.findAll({where: {public_key: Object.keys(pubs)}});
  })
  .then(function(peers) {
    peers.forEach(function(peer) {
      console.log(peer.public_key);
    })
  })