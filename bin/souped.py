from __future__ import print_function
import http_server
import sys
import json

from sqlsoup import SQLSoup
import networkx as nx
from networkx.readwrite import json_graph

def export_to_dot(G, peers, name):
  for n in G:
      if peers[n].ip:
        G.node[n]['label'] = "%s:%s:%s%s" % (G.in_degree(n),
                                            G.out_degree(n),
                                            G.degree(n),
                                            ':u' if not peers[n].reachable else '')
      else:
        G.node[n]['label'] = "%s" % (G.degree(n))

  nx.write_dot(G, name)
  with open(name) as fh:
    header = fh.readline()
    rest = fh.read()

  with open(name, 'w') as fh:
    fh.write(header)
    fh.write('\tgraph [splines=true overlap=false];\n')
    fh.write(rest)

  print('saved graph to', name)

def main(url, crawl_id):
  G = nx.DiGraph()

  soup = SQLSoup(url)
  peers = dict((p.id, p) for p in soup.peers
                 .filter_by(crawl_id=crawl_id).all())

  edges = soup.edges.filter_by(crawl_id=crawl_id).all()

  for p in peers.values():
      G.add_node(p.id, color= ('blue' if p.ip else 'red' if not p.reachable else 'orange'))

  for e in edges:
    G.add_edge(getattr(e, 'from'), e.to, color = 'black' if e.directed else 'red')

  export_to_dot(G, peers, 'crawl-%d.dot' % crawl_id)


  print('vertices', len(G))
  print('edges (directed)', G.size())

  G = nx.Graph(G)
  print('graph edges (undirected)', G.size())
  print('graph diameter', nx.diameter(G))

if __name__ == '__main__':
  argv = sys.argv[1:]
  main(argv[0], int(argv[1]))