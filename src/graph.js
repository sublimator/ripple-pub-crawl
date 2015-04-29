var cytoscape = require('cytoscape');


function Graph() {
  this.graph = {};
}

Graph.prototype.addEdge = function (from_, to_) {
  this.graph[from_] 
}

exports.buildGraph = function(crawl, peers, edges, onBuilt) {
  var cy = cytoscape();
};