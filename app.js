const lyricsEl = document.getElementById("lyrics");
const generateEl = document.getElementById("generate");
const graphEl = document.getElementById("graph");
const statsEl = document.getElementById("stats");
const MIN_REPEAT = 2;

const DEFAULT_SAMPLE = `Twinkle, twinkle, little star, how I wonder what you are. Up above the world so high,
like a diamond in the sky. Twinkle, twinkle, little star, how I wonder what you are.
When the blazing sun is set, and the grass with dew is wet. Then you show your little
light, twinkle, twinkle all the night. Twinkle, twinkle little star, how I wonder what you
are.
Then the traveler in the dark thanks you for your tiny spark. How could he see where to
go if you did not twinkle so? Twinkle, twinkle little star, how I wonder what you are.
As your bright and tiny spark lights the traveler in the dark, though I know not what you
are, twinkle, twinkle, little star. Twinkle, twinkle, little star, how I wonder what you are.`;

function encodeBase64(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeBase64(value) {
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch (error) {
    return null;
  }
}

function getLyricsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("t");
  if (!encoded) return null;
  return decodeBase64(encoded);
}

const initialLyrics = getLyricsFromQuery();
lyricsEl.value = initialLyrics || DEFAULT_SAMPLE;

function lineToSegments(line) {
  const segments = [];
  let currentTokens = [];
  let currentToken = "";

  const pushToken = () => {
    if (currentToken) {
      currentTokens.push(currentToken.toLowerCase());
      currentToken = "";
    }
  };

  const pushSegment = () => {
    if (currentTokens.length > 0) {
      segments.push(currentTokens);
      currentTokens = [];
    }
  };

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (/[a-zA-Z0-9']/.test(ch)) {
      currentToken += ch;
      continue;
    }

    pushToken();

    if (!/\s/.test(ch)) {
      // Punctuation or symbol ends the current segment.
      pushSegment();
    }
  }

  pushToken();
  pushSegment();

  return segments;
}

function buildStats(segments) {
  const counts = new Map();
  const continuations = new Map();

  for (const tokens of segments) {
    for (let i = 0; i < tokens.length; i += 1) {
      for (let len = 1; i + len <= tokens.length; len += 1) {
        const phrase = tokens.slice(i, i + len).join(" ");
        counts.set(phrase, (counts.get(phrase) || 0) + 1);

        if (i + len < tokens.length) {
          const next = tokens[i + len];
          const key = `${phrase}`;
          if (!continuations.has(key)) {
            continuations.set(key, new Set());
          }
          continuations.get(key).add(next);
        }
      }
    }
  }

  return { counts, continuations };
}

function chooseBestPhrase(tokens, index, stats, minRepeat) {
  const { counts, continuations } = stats;
  const remaining = tokens.length - index;
  const maxLen = remaining;

  let bestLen = 1;
  let bestScore = (counts.get(tokens[index]) || 1) * 1;

  for (let len = 2; len <= maxLen; len += 1) {
    const phrase = tokens.slice(index, index + len).join(" ");
    const count = counts.get(phrase) || 0;

    const nextSet = continuations.get(phrase);
    const branchingPenalty = nextSet && nextSet.size > 1 ? 0.7 : 1;
    const lengthBonus = Math.pow(len, 1.6);
    const countBonus = Math.pow(count, 1.1);
    const repeatBoost = count >= minRepeat ? 1.2 : 1;
    const score = countBonus * lengthBonus * branchingPenalty * repeatBoost;

    if (score > bestScore || (score === bestScore && len > bestLen)) {
      bestLen = len;
      bestScore = score;
    }
  }

  return bestLen;
}

function buildGraph(text) {
  const segments = text
    .split(/\r?\n/)
    .flatMap((line) => lineToSegments(line))
    .filter((tokens) => tokens.length > 0);

  const stats = buildStats(segments);
  const nodes = new Map();
  const edges = new Map();
  let lastPhraseOverall = null;

  for (const tokens of segments) {
    const phrases = [];
    let index = 0;

    while (index < tokens.length) {
      const len = chooseBestPhrase(tokens, index, stats, MIN_REPEAT);
      const phrase = tokens.slice(index, index + len).join(" ");
      phrases.push(phrase);
      index += len;
    }

    if (lastPhraseOverall && phrases.length > 0) {
      const edgeKey = `${lastPhraseOverall}||${phrases[0]}`;
      if (!edges.has(edgeKey)) {
        edges.set(edgeKey, {
          source: lastPhraseOverall,
          target: phrases[0],
          count: 0,
        });
      }
      edges.get(edgeKey).count += 1;
    }

    for (let i = 0; i < phrases.length; i += 1) {
      const key = phrases[i];
      if (!nodes.has(key)) {
        nodes.set(key, { id: key, count: 0 });
      }
      nodes.get(key).count += 1;

      if (i < phrases.length - 1) {
        const edgeKey = `${phrases[i]}||${phrases[i + 1]}`;
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, {
            source: phrases[i],
            target: phrases[i + 1],
            count: 0,
          });
        }
        edges.get(edgeKey).count += 1;
      }
    }

    if (phrases.length > 0) {
      lastPhraseOverall = phrases[phrases.length - 1];
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
}

function renderGraph(data) {
  graphEl.innerHTML = "";

  const width = graphEl.clientWidth;
  const height = graphEl.clientHeight;
  const tooltip = d3.select(graphEl).append("div").attr("class", "tooltip");

  const svg = d3
    .select(graphEl)
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("role", "img")
    .attr("aria-label", "Phrase graph");

  const defs = svg.append("defs");
  defs
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 15)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(17, 18, 15, 0.6)");

  const maxCount = Math.max(...data.nodes.map((node) => node.count));
  const baseSize = 14;
  const baseFont = 12;
  const sizeScale = (count) => baseSize * count;
  const fontScale = (count) => baseFont * count;
  const palette = [
    "#3b7dd8",
    "#47b37d",
    "#f2b63f",
    "#ef6b3a",
    "#d94b60",
    "#8b5ad9",
    "#2e9bb7",
    "#c26b1b",
  ];
  const colorForCount = (count) => {
    if (count <= palette.length) {
      return palette[count - 1];
    }
    return d3.interpolateTurbo((count - 1) / Math.max(maxCount - 1, 1));
  };
  const edgeScale = d3.scaleLinear().domain([1, d3.max(data.edges, (d) => d.count) || 1]).range([1, 4]);

  const zoomLayer = svg.append("g");

  const simulation = d3
    .forceSimulation(data.nodes)
    .force(
      "link",
      d3.forceLink(data.edges).id((d) => d.id).distance(240).strength(0.5)
    )
    .force("charge", d3.forceManyBody().strength(-700))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3.forceCollide().radius((d) => Math.max(d.width || 0, d.height || 0) / 2 + 40)
    );

  const edge = zoomLayer
    .append("g")
    .selectAll("line")
    .data(data.edges)
    .join("line")
    .attr("class", "edge")
    .attr("marker-end", "url(#arrow)")
    .attr("stroke-width", (d) => edgeScale(d.count));

  const node = zoomLayer
    .append("g")
    .selectAll("g")
    .data(data.nodes)
    .join("g")
    .attr("class", "node")
    .call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

  const rect = node.append("rect").attr("rx", 12).attr("ry", 12);

  node
    .append("text")
    .text((d) => d.id)
    .attr("font-size", (d) => `${fontScale(d.count)}px`)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle");

  node
    .on("mouseenter", (event, d) => {
      tooltip.style("opacity", 1).text(`${d.count}×`);
      positionTooltip(event);
    })
    .on("mousemove", (event) => {
      positionTooltip(event);
    })
    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
    });

  node.each(function (d) {
    const text = d3.select(this).select("text");
    const box = text.node().getBBox();
    const padding = 8 + sizeScale(d.count) * 0.5;
    d.width = box.width + padding * 2;
    d.height = box.height + padding * 2;
    const baseColor = d3.color(colorForCount(d.count));
    const strokeColor = baseColor ? baseColor.darker(0.8).formatHex() : "#e4533b";
    d3.select(this)
      .select("rect")
      .attr("x", -d.width / 2)
      .attr("y", -d.height / 2)
      .attr("width", d.width)
      .attr("height", d.height)
      .attr("fill", colorForCount(d.count))
      .attr("stroke", strokeColor);
  });

  const zoom = d3
    .zoom()
    .scaleExtent([0.2, 3])
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
    });

  svg.call(zoom);

  simulation.on("tick", () => {
    edge
      .attr("x1", (d) => edgePoint(d.source, d.target).x)
      .attr("y1", (d) => edgePoint(d.source, d.target).y)
      .attr("x2", (d) => edgePoint(d.target, d.source).x)
      .attr("y2", (d) => edgePoint(d.target, d.source).y);

    node.attr("transform", (d) => `translate(${d.x}, ${d.y})`);
  });

  simulation.on("end", () => {
    const nodes = data.nodes;
    if (nodes.length === 0) return;
    const xExtent = d3.extent(nodes, (d) => d.x);
    const yExtent = d3.extent(nodes, (d) => d.y);
    const padding = 60;
    const boundsWidth = xExtent[1] - xExtent[0] + padding * 2;
    const boundsHeight = yExtent[1] - yExtent[0] + padding * 2;
    const midX = (xExtent[0] + xExtent[1]) / 2;
    const midY = (yExtent[0] + yExtent[1]) / 2;
    const scale = Math.min(width / boundsWidth, height / boundsHeight, 1.2);
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];
    svg
      .transition()
      .duration(600)
      .call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  });
}

function positionTooltip(event) {
  const bounds = graphEl.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  d3.select(graphEl).select(".tooltip").style("left", `${x}px`).style("top", `${y}px`);
}

function edgePoint(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const halfW = (source.width || 20) / 2;
  const halfH = (source.height || 20) / 2;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx === 0 && absDy === 0) {
    return { x: source.x, y: source.y };
  }

  const scale = absDx / halfW > absDy / halfH ? halfW / absDx : halfH / absDy;
  return {
    x: source.x + dx * scale,
    y: source.y + dy * scale,
  };
}

function update() {
  const data = buildGraph(lyricsEl.value.trim());
  renderGraph(data);
  statsEl.textContent = `${data.nodes.length} nodes · ${data.edges.length} edges`;

  const encoded = encodeBase64(lyricsEl.value.trim());
  const params = new URLSearchParams(window.location.search);
  params.set("t", encoded);
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

generateEl.addEventListener("click", update);
window.addEventListener("load", update);
window.addEventListener("resize", () => {
  if (graphEl.firstChild) {
    update();
  }
});
