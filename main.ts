// A solver for make.fun's sokoban-solver-01 levels.
//
// The levels are drawn to be split: a one-square-wide hallway across the board with the player on it, and one to four
// rooms off that hallway, each entered through a single doorway cell. Every box starts inside a room and every goal is
// inside a room, so a room is solved on its own and the level's push-optimal count P* is the sum of its rooms'.
// Points are 1,000 in exactly P* pushes and 500*P*/pushes above it, so each room is solved push-optimally and the
// rooms are joined by the hallway steps between doorways.
//
// A room is searched as a push graph: a state is the box squares plus the player's square, and an edge is one push
// preceded by the walk that reaches the push-from square. The player may stand on the hallway cell in front of the
// doorway, so the first push is the one that clears the box out of the doorway. A solved state also has to let the
// player walk back out, so the search only accepts solutions the player can leave by. Nodes are ordered by pushes
// plus an assignment lower bound, and boxes are refused on squares no goal can be reached from.
//
// Local run: mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const CH = ['u', 'r', 'd', 'l'];

/** The level's floor, goals, boxes and player, and its width and height. */
function parse(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const n = w * h;
  const floor = new Uint8Array(n);
  const goal = new Uint8Array(n);
  const box = new Uint8Array(n);
  let player = -1;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '#') continue;
      const i = y * w + x;
      floor[i] = 1;
      if (c === '.' || c === '*' || c === '+') goal[i] = 1;
      if (c === '$' || c === '*') box[i] = 1;
      if (c === '@' || c === '+') player = i;
    }
  }
  return { w, h, n, floor, goal, box, player };
}

/** The rooms: components of floor off the player's row, each with its doorway cell and the hallway cell in front. */
function rooms(level) {
  const { w, h, n, floor } = level;
  const py = Math.floor(level.player / w);
  const seen = new Int32Array(n).fill(-1);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!floor[i] || seen[i] !== -1 || Math.floor(i / w) === py) continue;
    const id = out.length;
    const cells = [];
    const stack = [i];
    seen[i] = id;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!floor[ni] || seen[ni] !== -1 || ny === py) continue;
        seen[ni] = id;
        stack.push(ni);
      }
    }
    let door = -1;
    let hall = -1;
    for (const c of cells) {
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let d = 0; d < 4; d++) {
        if (cy + DY[d] !== py) continue;
        const ni = (cy + DY[d]) * w + (cx + DX[d]);
        if (ni < 0 || ni >= n || !floor[ni]) continue;
        door = c;
        hall = ni;
      }
    }
    out.push({ cells, door, hall });
  }
  return out;
}

/**
 * The moves that solve one room from the hallway in front of its doorway, push-optimally: walking in, pushing, and
 * walking back out at the end. Null when the room cannot be solved that way.
 */
function solveRoom(level, room) {
  const { w, h, n, goal, box } = level;
  // Where the player may stand: the room's own squares and the hallway cell at its doorway.
  const stand = new Uint8Array(n);
  for (const c of room.cells) stand[c] = 1;
  stand[room.hall] = 1;

  const boxes = room.cells.filter((c) => box[c]);
  const goals = room.cells.filter((c) => goal[c]);
  if (boxes.length === 0) return '';
  if (boxes.length !== goals.length) return null;

  const alive = aliveFrom(level, room);

  const cameFrom = new Int32Array(n);

  /** The steps from `from` to `to` over the standable squares, boxes excluded; null when there is no way. */
  function walk(from, to, boxSet) {
    if (from === to) return '';
    cameFrom.fill(-2);
    cameFrom[from] = -1;
    const queue = [from];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      if (c === to) break;
      const cx = c % w;
      const cy = (c - cx) / w;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (cameFrom[ni] !== -2 || !stand[ni] || boxSet.has(ni)) continue;
        cameFrom[ni] = c;
        queue.push(ni);
      }
    }
    if (cameFrom[to] === -2) return null;
    const rev = [];
    for (let c = to; c !== from; c = cameFrom[c]) {
      const p = cameFrom[c];
      const d = c - p === 1 ? 1 : c - p === -1 ? 3 : c - p === w ? 2 : 0;
      rev.push(CH[d]);
    }
    return rev.reverse().join('');
  }

  const startBoxes = new Set(boxes);
  const open = new Heap();
  const best = new Map();
  open.push({ f: bound(boxes, goals, w), g: 0, boxes: startBoxes, player: room.hall, path: '' });
  best.set(key(startBoxes, room.hall), 0);
  let expanded = 0;

  while (open.size) {
    const cur = open.pop();
    if (++expanded > 3_000_000) return null;
    if (cur.boxes.size === goals.length) {
      let done = true;
      for (const b of cur.boxes) if (!goal[b]) { done = false; break; }
      if (done) {
        const out = walk(cur.player, room.hall, cur.boxes);
        if (out !== null) return cur.path + out;
      }
    }
    for (const b of cur.boxes) {
      const bx = b % w;
      const by = (b - bx) / w;
      for (let d = 0; d < 4; d++) {
        const sx = bx - DX[d];
        const sy = by - DY[d];
        const tx = bx + DX[d];
        const ty = by + DY[d];
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const s = sy * w + sx;
        const t = ty * w + tx;
        if (!stand[s] || !alive[t]) continue;
        if (cur.boxes.has(s) || cur.boxes.has(t)) continue;
        const leg = walk(cur.player, s, cur.boxes);
        if (leg === null) continue;
        const nb = new Set(cur.boxes);
        nb.delete(b);
        nb.add(t);
        const g = cur.g + 1;
        const k = key(nb, b);
        const prev = best.get(k);
        if (prev !== undefined && prev <= g) continue;
        best.set(k, g);
        open.push({ f: g + bound([...nb], goals, w), g, boxes: nb, player: b, path: cur.path + leg + CH[d] });
      }
    }
  }
  return null;
}

function key(boxes, player) {
  return `${[...boxes].sort((a, b) => a - b).join(',')}|${player}`;
}

/**
 * A lower bound on the pushes left: the cheapest way to give every box a distinct goal, by Manhattan distance. The
 * assignment is exact (a bitmask DP over goals), because a greedy one can cost more than the true minimum, and a bound
 * that overestimates would let A* return a solution that is not push-optimal.
 */
function bound(boxes, goals, w) {
  const k = boxes.length;
  if (k === 0) return 0;
  if (k > 10) {
    // Too many boxes for the table: fall back to the sum of each box's nearest goal, which never overestimates.
    let total = 0;
    for (const b of boxes) {
      let bd = Infinity;
      for (const g of goals) {
        const d = Math.abs((b % w) - (g % w)) + Math.abs(Math.floor(b / w) - Math.floor(g / w));
        if (d < bd) bd = d;
      }
      total += bd;
    }
    return total;
  }
  const full = 1 << k;
  const dp = new Float64Array(full).fill(Infinity);
  dp[0] = 0;
  for (let mask = 0; mask < full; mask++) {
    const i = popcount(mask);
    if (i >= k || dp[mask] === Infinity) continue;
    const b = boxes[i];
    const bx = b % w;
    const by = (b - bx) / w;
    for (let j = 0; j < k; j++) {
      if (mask & (1 << j)) continue;
      const g = goals[j];
      const d = Math.abs(bx - (g % w)) + Math.abs(by - Math.floor(g / w));
      const next = mask | (1 << j);
      const v = dp[mask] + d;
      if (v < dp[next]) dp[next] = v;
    }
  }
  return dp[full - 1];
}

function popcount(x) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c += 1;
  }
  return c;
}

/** The squares of a room a box can still be pushed to a goal from, by pulling each goal backwards. */
function aliveFrom(level, room) {
  const { w, h, n, goal } = level;
  const inRoom = new Uint8Array(n);
  for (const c of room.cells) inRoom[c] = 1;
  const alive = new Uint8Array(n);
  const queue = [];
  for (const c of room.cells) if (goal[c]) { alive[c] = 1; queue.push(c); }
  while (queue.length) {
    const q = queue.pop();
    const qx = q % w;
    const qy = (q - qx) / w;
    for (let d = 0; d < 4; d++) {
      const px = qx - DX[d];
      const py = qy - DY[d];
      const sx = qx - 2 * DX[d];
      const sy = qy - 2 * DY[d];
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const p = py * w + px;
      if (!inRoom[p] || !inRoom[sy * w + sx] || alive[p]) continue;
      alive[p] = 1;
      queue.push(p);
    }
  }
  return alive;
}

/** A binary heap ordered by f, then by the larger g. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v) {
    const a = this.a;
    a.push(v);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[i].f < a[p].f || (a[i].f === a[p].f && a[i].g > a[p].g)) {
        const t = a[i]; a[i] = a[p]; a[p] = t; i = p;
      } else break;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && (a[l].f < a[m].f || (a[l].f === a[m].f && a[l].g > a[m].g))) m = l;
        if (r < a.length && (a[r].f < a[m].f || (a[r].f === a[m].f && a[r].g > a[m].g))) m = r;
        if (m === i) break;
        const t = a[i]; a[i] = a[m]; a[m] = t; i = m;
      }
    }
    return top;
  }
}

/** The moves for one level: each room solved from its doorway, the rooms joined along the hallway. */
function solve(text) {
  const level = parse(text);
  if (level.player < 0) return '';
  const rs = rooms(level);
  if (!rs.length) return '';
  const { w } = level;

  let out = '';
  let at = level.player;
  for (const room of rs) {
    if (room.door < 0 || room.hall < 0) return '';
    const ax = at % w;
    const bx = room.hall % w;
    if (Math.floor(at / w) !== Math.floor(room.hall / w)) return '';
    out += bx > ax ? 'r'.repeat(bx - ax) : 'l'.repeat(ax - bx);
    const moves = solveRoom(level, room);
    if (moves === null) return '';
    out += moves;
    at = room.hall;
  }
  return out;
}

for (const id of readdirSync(I).sort()) {
  // Only the instance directories hold levels; /input may also carry a seed file or other entries.
  let text;
  try {
    text = readFileSync(join(I, id, 'level.txt'), 'utf8');
  } catch {
    continue;
  }
  const moves = solve(text);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
