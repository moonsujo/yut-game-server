import { calculateScore, pickBestMoveSequence } from "./ai"
import initialState from "../initialState"

// calculate possible moves
describe("calculate smart move sequence", () => {
  // board: u0s1
  // moves: 4, 4, -1
  // list of moves: u0s1 to u0s0, u1sH to u1s4, u2sH to u2s4
  it("u0s1, 4:4:-1 should sequence to u0s1->u0s0, u1sH->u1s4, u2sH->u2s4", () => {
    let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
    friendlyPieces[0] = {
      tile: 1,
      team: 0,
      id: 0,
      history: [0, 1],
      lastPath: [0, 1]
    }
    let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
    let backdoLaunch = true
    let moves = JSON.parse(JSON.stringify(initialState.initialMoves))
    moves['-1'] = 1
    moves['4'] = 2
    let bestMoveSequence = pickBestMoveSequence({ 
      moves, 
      friendlyPieces, 
      enemies: enemyPieces, 
      bestMoveSequence: { sequence: [], score: 100 },
      backdoLaunch,
      numTokens: 4
    }).sequence
    expect(bestMoveSequence).toEqual([
      {
        tokenId: 0,
        moveInfo: { tile: 0, move: '-1', history: [0], path: [1, 0] }
      },
      {
        tokenId: 1,
        moveInfo: { tile: 4, move: '4', history: [0, 1, 2, 3], path: [0, 1, 2, 3, 4] }
      },
      {
        tokenId: 2,
        moveInfo: { tile: 4, move: '4', history: [0, 1, 2, 3], path: [0, 1, 2, 3, 4] }
      }
    ])
  })
})

describe("calculate score", () => {
  describe("start", () => {
    it("should return 1 if you start and send a ship to star 1", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 1,
        team: 0,
        id: 0,
        history: [1, 2],
        lastPath: [0, 1, 2]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(1)
    })
    it("should return 1 if you start and send a ship to star 2", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 2,
        team: 0,
        id: 0,
        history: [1, 2],
        lastPath: [0, 1, 2]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(1)
    })
    it("should return 0 if you start and send a ship to star 3", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 3,
        team: 0,
        id: 0,
        history: [1, 2, 3],
        lastPath: [0, 1, 2, 3]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(0)
    })
    it("should return -3 if you start and send a ship to star 4", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 4,
        team: 0,
        id: 0,
        history: [1, 2, 3, 4],
        lastPath: [0, 1, 2, 3, 4]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(-3)
    })
    it("should return -9 if you start and send a ship to star 5", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 5,
        team: 0,
        id: 0,
        history: [1, 2, 3, 4, 5],
        lastPath: [0, 1, 2, 3, 4, 5]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(-10)
    })
    it("should return -20 if you use a backdo to send a ship to Earth", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 0,
        team: 0,
        id: 0,
        history: [],
        lastPath: [0, 1]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(-20)
    })
  })
  describe("piggyback", () => {
    it("should return -17 if you have two ships on star 2", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 2,
        team: 0,
        id: 0,
        history: [0, 1],
        lastPath: [0, 1, 2]
      }
      friendlyPieces[1] = {
        tile: 2,
        team: 0,
        id: 0,
        history: [0, 1],
        lastPath: [0, 1, 2]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(-17)
    })
    it("should return -17 if you have two ships on star 7 and an enemy on star 4", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 7,
        team: 0,
        id: 0,
        history: [1, 2, 3, 4, 5, 6, 7],
        lastPath: [0, 1, 2, 3, 4, 5, 6, 7]
      }
      friendlyPieces[1] = {
        tile: 7,
        team: 0,
        id: 0,
        history: [1, 2, 3, 4, 5, 6, 7],
        lastPath: [0, 1, 2, 3, 4, 5, 6, 7]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      enemyPieces[0] = {
        tile: 4,
        team: 1,
        id: 0,
        history: [1, 2, 3, 4],
        lastPath: [0, 1, 2, 3, 4]
      }
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(-17)
    })
  })
  describe("multiple friendlies", () => {
    // stack
    // separated
    it("should return 0 if you have a ship at s1 and another ship at s2", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 1,
        team: 0,
        id: 0,
        history: [0],
        lastPath: [0,1]
      }
      friendlyPieces[1] = {
        tile: 2,
        team: 0,
        id: 0,
        history: [0,1],
        lastPath: [0, 1, 2]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(0)
    })
    it("should return -15 if you have a ship at s6 and another ship at s8", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 6,
        team: 0,
        id: 0,
        history: [1, 2, 3, 4, 5],
        lastPath: [0, 1, 2, 3, 4, 5, 6]
      }
      friendlyPieces[1] = {
        tile: 8,
        team: 0,
        id: 0,
        history: [1, 2, 3, 4, 5, 6, 7],
        lastPath: [0, 1, 2, 3, 4, 5, 6, 7, 8]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch, tiles })
      expect(score).toEqual(-15)
    })
  })
  describe("fork", () => {
    it("should return -10 if you have a ship at s5", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 5,
        team: 0,
        id: 0,
        history: [3, 4, 5],
        lastPath: [2, 3, 4, 5]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch })
      expect(score).toEqual(-10)
    })
    it("should return -15 if you have a ship at s10 (saturn)", () => {
      let friendlyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces[0] = {
        tile: 10,
        team: 0,
        id: 0,
        history: [8, 9],
        lastPath: [8, 9, 10]
      }
      let enemyPieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let score = calculateScore({ pieces: friendlyPieces, enemyPieces, backdoLaunch })
      expect(score).toEqual(-15)
    })
  })
  describe("compare two scores", () => {
    // favor shortcut over regular star
    it("should favor a token on s10 and token on s6 over a token on s9 and another one on s7", () => {
      // board 1: u0 on s10, u1 on s6
      let friendlyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces0[0] = {
        tile: 10,
        team: 0,
        id: 1,
        history: [8, 9, 10],
        lastPath: [7, 8, 9, 10]
      }
      friendlyPieces0[1] = {
        tile: 6,
        team: 0,
        id: 0,
        history: [4, 5, 6],
        lastPath: [3, 4, 5, 6]
      }
      let enemyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles0 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score0 = calculateScore({ pieces: friendlyPieces0, enemyPieces: enemyPieces0, backdoLaunch, tiles0 })

      // board 2: u0 on s9, u1 on s7
      let friendlyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces1[0] = {
        tile: 9,
        team: 0,
        id: 0,
        history: [7, 8, 9],
        lastPath: [6, 7, 8, 9]
      }
      friendlyPieces1[1] = {
        tile: 7,
        team: 0,
        id: 0,
        history: [5, 6, 7],
        lastPath: [4, 5, 6, 7]
      }
      let enemyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      backdoLaunch = true
      let tiles1 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score1 = calculateScore({ pieces: friendlyPieces1, enemyPieces: enemyPieces1, backdoLaunch, tiles1 })

      // expect score_board 1 < score_board 2
      expect(score0).toBeLessThan(score1)
    })
    // favor closer friendlies over spreading out
    it("should favor u0s13 and u1s9 over u0s15 and u1s7", () => {
      let friendlyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces0[0] = {
        tile: 13,
        team: 0,
        id: 0,
        history: [11, 12, 13],
        lastPath: [10, 11, 12, 13]
      }
      friendlyPieces0[1] = {
        tile: 9,
        team: 0,
        id: 1,
        history: [7, 8, 9],
        lastPath: [6, 7, 8, 9]
      }
      let enemyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles0 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score0 = calculateScore({ pieces: friendlyPieces0, enemyPieces: enemyPieces0, backdoLaunch, tiles0 })

      // board 2: u0s15 and u1s7
      let friendlyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces1[0] = {
        tile: 15,
        team: 0,
        id: 0,
        history: [13, 14],
        lastPath: [13, 14, 15]
      }
      friendlyPieces1[1] = {
        tile: 7,
        team: 0,
        id: 0,
        history: [5, 6],
        lastPath: [5, 6, 7]
      }
      let enemyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      backdoLaunch = true
      let tiles1 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score1 = calculateScore({ pieces: friendlyPieces1, enemyPieces: enemyPieces1, backdoLaunch, tiles1 })

      // expect score_board 1 < score_board 2
      expect(score0).toBeLessThan(score1)
    })
    // favor piggyback over advancing in first row
    it("should favor u0s2 and u1s2 over u0s4", () => {
      let friendlyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces0[0] = {
        tile: 2,
        team: 0,
        id: 0,
        history: [1, 2],
        lastPath: [0, 1, 2]
      }
      friendlyPieces0[1] = {
        tile: 2,
        team: 0,
        id: 1,
        history: [1, 2],
        lastPath: [0, 1, 2]
      }
      let enemyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      let backdoLaunch = true
      let tiles0 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score0 = calculateScore({ pieces: friendlyPieces0, enemyPieces: enemyPieces0, backdoLaunch, tiles0 })

      // board 2: u0s15 and u1s7
      let friendlyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces1[0] = {
        tile: 4,
        team: 0,
        id: 0,
        history: [2, 3, 4],
        lastPath: [1, 2, 3, 4]
      }
      let enemyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      backdoLaunch = true
      let tiles1 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score1 = calculateScore({ pieces: friendlyPieces1, enemyPieces: enemyPieces1, backdoLaunch, tiles1 })

      // expect score_board 1 < score_board 2
      expect(score0).toBeLessThan(score1)
    })
    // u0s23, r0s4, r1s4, r2s4 vs. u0s21, u1s2, r0s4, r1s4, r2s4
    it.only("should favor u0s21, u1s2, r0s4, r1s4, r2s4 over u0s23, r0s4, r1s4, r2s4", () => {
      let friendlyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces0[0] = {
        tile: 21,
        team: 0,
        id: 0,
        history: [5, 20],
        lastPath: [5, 20, 21]
      }
      friendlyPieces0[1] = {
        tile: 2,
        team: 0,
        id: 0,
        history: [1],
        lastPath: [1, 2]
      }
      let enemyPieces0 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      enemyPieces0[0] = {
        tile: 4,
        team: 1,
        id: 0,
        history: [1, 2, 3],
        lastPath: [1, 2, 3, 4]
      }
      enemyPieces0[1] = {
        tile: 4,
        team: 1,
        id: 1,
        history: [1, 2, 3],
        lastPath: [1, 2, 3, 4]
      }
      enemyPieces0[2] = {
        tile: 4,
        team: 1,
        id: 2,
        history: [1, 2, 3],
        lastPath: [1, 2, 3, 4]
      }
      let backdoLaunch = true
      let tiles0 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score0 = calculateScore({ pieces: friendlyPieces0, enemyPieces: enemyPieces0, backdoLaunch, tiles0 })

      // board 2: u0s15 and u1s7
      let friendlyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      friendlyPieces1[0] = {
        tile: 23,
        team: 0,
        id: 0,
        history: [21, 22],
        lastPath: [21, 22, 23]
      }
      let enemyPieces1 = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      enemyPieces1[0] = {
        tile: 4,
        team: 1,
        id: 0,
        history: [1, 2, 3],
        lastPath: [1, 2, 3, 4]
      }
      enemyPieces1[1] = {
        tile: 4,
        team: 1,
        id: 1,
        history: [1, 2, 3],
        lastPath: [1, 2, 3, 4]
      }
      enemyPieces1[2] = {
        tile: 4,
        team: 1,
        id: 2,
        history: [1, 2, 3],
        lastPath: [1, 2, 3, 4]
      }
      backdoLaunch = true
      let tiles1 = JSON.parse(JSON.stringify(initialState.initialTiles))
      let score1 = calculateScore({ pieces: friendlyPieces1, enemyPieces: enemyPieces1, backdoLaunch, tiles1 })

      // expect score_board 1 < score_board 2
      expect(score0).toBeLessThan(score1)
    })
    // u0s26+u1s26, u2s22, r0s9
    // yoot, gul
    // u0s26+u1s26 -> u0s0+u1s0, u2s22 -> u2s0
    // option 2
    // u3sH -> u3s4, u3s4 -> u3s7
    // currently, it prefers option 2 because there is bonus points for closing in on enemy
    // and you only save 1 step by piggybacking

    // u0s10, u0s26+u1s26, u2s22
    // gul
    // u0s10 -> u0s22
    // option 2
    // u0s26+u1s26 -> u0s28+u1s28
    // currently, it prefers option 2

    // u0s5, u1s1, r0s8, r1s29, r2s29, r3s29
    // gul
    // u0s5 -> u0s8
    // option 2
    // u0s5 -> u0s22
    // option 3
    // u1s1 -> u1s4
    // option 4
    // u2sH -> u2s3
    // should prefer option 1

    // catch prioritize
    // scenario 1: enemy is far ahead of you
    // scenario 2: enemy:you 3:0, you have a token in front of the enemy.
      // send your guy behind him
    // scenario 3: enemy at saturn, you are at mars with ge
      // send your guy to s21
    // scenario 4: enemy at saturn, you are at mars with gul
      // send your guy to the moon
    // scenario 4: enemy at saturn, you are at mars with gul and ge
      // capture
    // scenario 5: enemy at s11, you are at s8 and s6 with ge
      // s8 to saturn
  })
})