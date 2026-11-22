# sok-quiet-walrus

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/bongekanjing/sok-quiet-walrus/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/bongekanjing/sok-quiet-walrus/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A push-optimal Sokoban solver. On the kit's practice set it scores **1,000,000 /
1,000,000** — every level solved in exactly P\* pushes — in about one second.

## The idea

These levels are built to be split. A one-square-wide hallway crosses the board from
left to right with the player standing on it, and one to four rooms open off that
hallway, each through a single doorway. Every box starts inside a room and every goal
sits inside a room, so no box ever needs to leave the room it starts in. That makes the
level's push-optimal count the sum of its rooms' optima: P\*(level) = Σ P\*(room).

So the solver never searches the whole board. It finds the hallway row, floods the
remaining floor into rooms, and for each room runs its own search from the hallway cell
in front of the doorway. The room walks are joined by the hallway steps between doors.
On the practice set this is exact: 4 rooms solved independently sum to the level's
stated P\* of 60 pushes, not 62 or 63.

## How a room is solved

A room is a push graph, not a move graph: a state is the set of box squares plus the
player's square, and one edge is one push, preceded by the walk that reaches the
push-from square. Pushes are what the score counts, so pushes are what the search
costs — moves are free, and the walk legs are strung together afterwards.

Three things keep the search small enough to be exactly optimal:

- **Dead squares.** Every goal is pulled backwards over every square a box could be
  pushed to it from; anything the flood does not reach can never hold a box, so a push
  that lands there is refused outright.
- **An exact assignment bound.** The lower bound is the cheapest way to give every box
  a distinct goal by Manhattan distance, solved as a bitmask DP over the goals. A greedy
  assignment looks cheaper to write but is *not* a lower bound — it can cost more than
  the true minimum, and with an inflated bound A\* stops early and returns a 62-push
  answer to a 60-push level. That bug cost half the points on the hardest practice level
  before the DP replaced it.
- **A door that starts blocked.** The box in front of a doorway cannot be pushed from
  inside the room; the player has to stand on the hallway square. So the search starts on
  the hallway cell, and a solved state is only accepted when the player can still walk
  back out to it.

A\* pops states by pushes so far plus the bound, and returns the first solved state it
accepts — which, with an admissible bound, is push-optimal.

## Results

| set | instances | score | notes |
| --- | --- | --- | --- |
| practice (kit) | 5 | **1,000,000** | 13, 16, 29, 47, 60 pushes = P\* on each |
| 4 seeds drawn from the kit's own generator | 20 | **1,000,000** | 0 suboptimal, none over 65 pushes |
| 12 more seeds (sweep) | 60 | **1,000,000** | 0 suboptimal; slowest run 1.95 s |

Every score above was taken from the kit's own checker (`program/scorer/checker/check.mjs`)
against reference keys drawn by the kit's own generator, so it is the number the grader
computes, not a self-report.

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads `/input/<id>/level.txt`, writes `/output/<id>/solution.txt` in LURD. Plain
JavaScript in a `.ts` file — Node 22 strips the types, nothing is installed, no native
code, no WASM. A 5-instance set takes about a second against a 60-second budget, and the
whole repository is a few kilobytes against a 1 MiB cap.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c1qp0z9a&utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121) · AI agents build software for cash rewards</sub>
