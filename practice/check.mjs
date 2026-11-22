// sokoban-solver-01's checker (scripts/releases/new-solver-home.ts's contract): it replays an answer on its level and
// never solves one. An instance's answer is solution.txt, the player's moves in LURD: u, d, l and r, one letter a step,
// either case (the replay, not the letter's case, decides whether a step pushes a box), whitespace anywhere ignored;
// any other character makes the answer invalid. An empty answer is valid: no moves.
//
// The replay starts from level.txt (XSB) and plays every step: a step into a wall, or one pushing a box into a wall
// or another box, is illegal, and an answer holding one scores 0 points. When the last step leaves every box on a
// goal, the level is solved: 1,000 points in P* pushes, where pushes counts the steps that moved a box and P* is the
// level's push-optimal count (the key's pushes), and 500 x P* / pushes in more. An unsolved replay scores 0.

/** The level: its width, walls, goals, boxes and player. */
function levelOf(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const w = Math.max(...rows.map((r) => r.length));
  const size = w * rows.length;
  const wall = new Uint8Array(size).fill(1);
  const goal = new Uint8Array(size);
  const box = new Uint8Array(size);
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goal[i] = 1;
      if (ch === '$' || ch === '*') box[i] = 1;
      if (ch === '@' || ch === '+') player = i;
    }
  });
  return { w, wall, goal, box, player };
}

const STEP = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

/** The answer's points. */
export function points(files, key, outputs) {
  const moves = outputs['solution.txt'].replace(/\s+/g, '');
  const odd = /[^udlrUDLR]/.exec(moves);
  if (odd !== null) return { points: 0, valid: false, detail: `solution.txt holds ${JSON.stringify(odd[0])}, which is no move (u, d, l or r)` };
  const { w, wall, goal, box, player: start } = levelOf(files['level.txt']);
  let player = start;
  let pushes = 0;
  for (let k = 0; k < moves.length; k++) {
    const [dx, dy] = STEP[moves[k].toLowerCase()];
    const d = dy * w + dx;
    const next = player + d;
    if (wall[next]) return { points: 0, valid: true, detail: `move ${k + 1} (${moves[k]}) walks into a wall` };
    if (box[next]) {
      const beyond = next + d;
      if (wall[beyond] || box[beyond]) return { points: 0, valid: true, detail: `move ${k + 1} (${moves[k]}) pushes a box into ${wall[beyond] ? 'a wall' : 'another box'}` };
      box[next] = 0;
      box[beyond] = 1;
      pushes++;
    }
    player = next;
  }
  for (let i = 0; i < box.length; i++) {
    if (box[i] && !goal[i]) return { points: 0, valid: true, detail: `the replay ends with a box off its goal, after ${moves.length} moves and ${pushes} pushes` };
  }
  return { points: pushes <= key.pushes ? 1000 : (500 * key.pushes) / pushes, valid: true, detail: `solved in ${pushes} pushes (P* ${key.pushes})` };
}
