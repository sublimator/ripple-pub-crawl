var _ = require('lodash');
var Sequelize = require('sequelize');
var Promise = Sequelize.Promise; // bluebird++

var create = module.exports = function(sql, Sequelize) {
  var Crawl = sql.define('crawl', {
    entry_ip: {type: Sequelize.STRING, validate: {isIPv4: true}},
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true }
  }, {underscored: true});

  var Peer = sql.define('peer', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    // We explicitly define this here, so we can enforce the constraint of peers
    // being unique for their given public keys, per crawl.
    crawl_id: { type: Sequelize.INTEGER, unique: 'pubCrawl'},
    public_key: {type: Sequelize.STRING, allowNull: false, unique: 'pubCrawl'},
    hops_from_entry: {type: Sequelize.INTEGER},
    reachable: {type: Sequelize.BOOLEAN},

    version: {type: Sequelize.STRING, allowNull: true},

    ip: {type: Sequelize.STRING, validate: {isIPv4: true}, allowNull: true},
    port: { type: Sequelize.INTEGER },
    city: {type: Sequelize.STRING, allowNull: true},
    country: {type: Sequelize.STRING, allowNull: true},
    region: {type: Sequelize.STRING, allowNull: true}

  }, {
    timestamps: false,
    underscored: true,

    // This is accessed via `.ip_and_port` rather than `.ip_and_port()`
    getterMethods: {
      ip_and_port : function() {
        return this.ip + ':' + this.port;
      }
    },

  });

  var Edge = sql.define('edge', {}, {timestamps: false, underscored: true});

  var Summary = sql.define('summary', {
    count: {type: Sequelize.INTEGER},
    diameter: {type: Sequelize.INTEGER},
    time: {type: Sequelize.INTEGER}, // ms
  }, {timestamps: false, underscored: true});

  Crawl.hasOne(Summary, {onDelete: 'cascade'});
  Crawl.hasMany(Edge, {onDelete: 'cascade'});
  Crawl.hasMany(Peer, {onDelete: 'cascade'});

  Peer.hasMany(Edge, {foreignKey: 'from', onDelete: 'cascade'});
  Peer.hasMany(Edge, {foreignKey: 'to', onDelete: 'cascade'});

  return {
    Crawl: Crawl,
    Edge: Edge,
    Peer: Peer
  };
};
