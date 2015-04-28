from __future__ import print_function
import sys

from sqlsoup import SQLSoup
import networkx as nx

def main(url, crawl_id):
  G = nx.DiGraph()

  soup = SQLSoup(url)
  peers = dict((p.id, p) for p in soup.peers
                 .filter_by(reachable=True, crawl_id=crawl_id).all())

  edges = soup.edges.filter_by(crawl_id=crawl_id).all()

  for p in peers.values():
      G.add_node(p.id)

  for e in edges:
    G.add_edge(getattr(e, 'from'), e.to)

  print('reachable nodes in graph', len(G))
  print('graph edges (directed)', G.size())
  # Convert to unidirected graph to find diameter as a link in any direction is
  # the business yes?
  G = nx.Graph(G)
  print('graph edges (undirected)', G.size())
  print('graph diameter', nx.diameter(G))

if __name__ == '__main__':
  argv = sys.argv[1:]
  main(argv[0], int(argv[1]))