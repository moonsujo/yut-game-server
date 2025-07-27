import edgeList from "./edgeList.js";

export function tileType(tile) {
  if (tile === -1) {
    return 'home'
  } else if (tile === 29) {
    return 'scored'
  } else {
    return 'onBoard'
  }
}

export function isBackdoMoves({moves}) {
  try {
    if (typeof moves !== 'object') {
      throw new Error('moves is not an object')
    }

    for (const move in moves) {
      if (parseInt(move) !== 0 && parseInt(move) !== -1 && moves[move] > 0) {
        return false;
      }
    }
    return true
  } catch (err) {
    console.log('[isBackdoMoves] error', err)
  }
}

export function hasTokenOnBoard({ pieces }) {
  for (let i = 0; i < 4; i++) {
    if (tileType(pieces[i].tile) === 'onBoard') {
      return true
    }
  }
  return false
}

// if first step, keep forks; else, go straight
export function getNextTiles(tile, forward, shortcutOptions) {
  let nextTiles = [];
  if (tile === -1 && forward) {
    return [1]
  }

  // on board
  let [start, end] = getStartAndEndVertices(forward);
  for (const edge of edgeList) {
    if (edge[start] === tile) {
      nextTiles.push(edge[end]);
    }
  }

  return nextTiles
}

export function getForks(tile, forward, shortcutOptions) {
  let nextTiles = [];
  if (tile === -1 && forward) {
    return [1]
  }

  // on board
  let [start, end] = getStartAndEndVertices(forward);
  for (const edge of edgeList) {
    if (shortcutOptions && edge[start] === tile) {
      nextTiles.push(edge[end]);
    } else if (tile === 5) { // you can only go on the short path.
      return [20]
    } else if (tile === 10) {
      return [25]
    } else if (tile === 22) {
      return [27]
    } else if (edge[start] === tile) {
      nextTiles.push(edge[end]);
    }
  }

  return nextTiles
}

export function getStartAndEndVertices(forward) {
  if (forward === true) {
    return [0, 1]
  } else {
    return [1, 0]
  }
}

export function checkFinishRule(forks) {
  for (let i = 0; i < forks.length; i++) {
    if (forks[i] === 29) {
      return [29]
    }
  }
  return forks
}

export function winCheck(pieces) {
  for (const piece of pieces) {
    if (piece.tile !== 29) {
      return false
    }
  }
  return true;
}

// returns object: { tile: [piece] }
export function getOccupiedTiles({ pieces }) {

  let tiles = {}
  for (let i = 0; i < pieces.length; i++) {
    const piece = JSON.parse(JSON.stringify(pieces[i]))
    if (piece.tile !== 29) {
      if (!tiles[piece.tile]) {
        tiles[piece.tile] = [piece]
      } else {
        tiles[piece.tile].push(piece)
      }
    }
  }
  return tiles
}

export function movePieces({friendlyPieces, enemies, movingPieces, to, path, history, move, yutMoCatch}) {
  
  let newFriendlyPieces = JSON.parse(JSON.stringify(friendlyPieces))
  let newEnemies = JSON.parse(JSON.stringify(enemies))

  // Update moving team's pieces at home
  for (const piece of movingPieces) {
    newFriendlyPieces[piece.id].tile = to
    newFriendlyPieces[piece.id].history = history
    newFriendlyPieces[piece.id].lastPath = path
  }

  // If catch, update enemy pieces
  let caught = false
  let caughtNoBonus = false
  let enemyTiles = getOccupiedTiles({ pieces: enemies })

  if (enemyTiles[to] && enemyTiles[to].length > 0) {
    if (yutMoCatch) {
      caught = true
    } else if (parseInt(move) === 4 || parseInt(move) === 5) {
      caughtNoBonus = true
    }
    let occupyingTeam = enemyTiles[to][0].team
    let movingTeam = friendlyPieces[0].team
    if (occupyingTeam != movingTeam) {
      for (let piece of enemyTiles[to]) { // if tile is empty, it won't run
        piece.tile = -1
        piece.history = []
        if (piece._doc)
          newEnemies[piece.id] = JSON.parse(JSON.stringify(piece._doc))
        else
          newEnemies[piece.id] = JSON.parse(JSON.stringify(piece))
      }
    }
  }

  return [newFriendlyPieces, newEnemies, caught, caughtNoBonus]
}


export function allPiecesOut({ pieces }) {
  for (const piece of pieces) {
    if (piece.tile === -1) {
      return false
    }
  }
  return true
}

export function scorePieces({pieces, movingPieces, history, path}) {
  let newPieces = []
  for (const piece of pieces) {
    if (piece._doc)
      newPieces.push({ ...piece._doc }) // newFriendlyPieces.push({ ...piece.toObject() })
    else
    newPieces.push({ ...piece })
  }

  // Update moving team's pieces at home
  for (const piece of movingPieces) {
    newPieces[piece.id].tile = 29
    newPieces[piece.id].history = history
    newPieces[piece.id].lastPath = path
  }

  return [newPieces]
}

export function isEmptyMoves(moves) {
  for (const move in moves) {
    if (parseInt(move) !== 0 && moves[move] > 0) {
      return false;
    }
  }
  return true;
}