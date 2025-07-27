import edgeList from "./edgeList.js";
import { checkFinishRule, getNextTiles, getStartAndEndVertices, tileType } from "./rulesHelpers.js";

// schema
// legalTiles: {
//   "1": { destination: 1, move: 1, path: [1, 2, 3]},
//   "29": [
//     { destination: 29, "move": 1, "path": [28, 29]},
//     { destination: 29, "move": 2, "path": [28, 29]}
//   ]
// }
export function getLegalTiles(tile, moves, pieces, history, backdoLaunch, shortcutOptions) {
  try {
    let legalTiles = {}
    if (typeof moves !== 'object') {
      throw new Error('moves is not an object')
    } else if (tile !== 29) {
    
  
      for (let move in moves) {
        if (parseInt(move) == 0) {
          continue;
        } else if (moves[move] > 0) {
    
          // Special Rule: If you don't have a piece on the board, you can place one on Earth immediately
          if (parseInt(move) < 0 && (backdoLaunch && checkBackdoRule(moves, pieces))) {
    
            legalTiles[0] = { tile: 0, move: "-1", history: [], path: [1, 0] }
    
          } else {
    
            let forward = parseInt(move) > 0 ? true: false
            let forks = getNextTiles(tile, forward, shortcutOptions)
            if (forward) {
              // If you're on Earth, there's a path to score and path to tile 1. Eliminate the path to tile 1
              forks = checkFinishRule(forks) 
            } else {
              // If you have no history, present both paths. If you do, take the last tile from the history
              forks = checkBackdoFork(forks, history)
            }
      
            for (let i = 0; i < forks.length; i++) {
              
              // Initialize path
              let path = tileType(tile) === 'home' ? [0] : [tile]
              let destination = getDestination(forks[i], Math.abs(parseInt(move))-1, forward, path, shortcutOptions)
              
              let forkHistory = makeNewHistory(
                history, 
                destination.path.slice(0, destination.path.length-1), 
                forward
              )
      
              // If piece can score
              if (destination.tile == 29) {
                if (!(29 in legalTiles)) {
                  // Initialize array because multiple moves can be used to finish
                  legalTiles[29] = []
                }
                legalTiles[29].push({ tile: destination.tile, move, history: forkHistory, path: destination.path })
              } else {
                legalTiles[destination.tile] = { tile: destination.tile, move, history: forkHistory, path: destination.path }
              }
            }
          }
        }
      }
    }
  
    return legalTiles
  } catch (err) {
    console.log('[getLegalTiles] error', err)
  }
}

function makeNewHistory(history, path, forward) {
  if (forward) {
    return history.concat(path)
  } else {
    if (path.length == 0) { // Backdo and starting from home
      return []
    } else {
      return history.slice(0, history.length-1)
    }
  }
}

// Precondition: history is an array
function checkBackdoFork(forks, history) {
  if (history.length == 0) {
    return forks
  } else if (forks.length == 1) {
    return forks
  } else {
    return [history[history.length-1]]
  }
}

function getDestination(tile, steps, forward, path, shortcutOptions) {
  
  path.push(tile)
  if (steps == 0 || tile == 29) {
    return { tile, path }
  }
  
  let [start, end] = getStartAndEndVertices(forward);
  for (const edge of edgeList) {
    if (edge[start] === tile) {
      let nextTile;
      let forks = getNextTiles(tile, forward, shortcutOptions);
      if (forks.length > 1) {
        nextTile = chooseTileFromFork(path, forks)
      } else {
        nextTile = edge[end]
      }
      steps--; // Update value AFTER reading
      return getDestination(nextTile, steps, forward, path, shortcutOptions)
    }
  }
}

function chooseTileFromFork(path, forks) {
  let closestIndexDistance = 1000;
  let closestIndex = -2;
  for (const fork of forks) {
    let indexDistance = Math.abs(path[path.length-2] - fork)
    if (indexDistance < closestIndexDistance) {
      closestIndexDistance = indexDistance
      closestIndex = fork
    }
  }
  return closestIndex
}

function checkBackdoRule(moves, pieces) {

  let hasBackdo = false;
  for (let move in moves) {
    if (move === "-1" && moves[move] > 0) {
      hasBackdo = true;
    }
  }
  if (!hasBackdo) {
    return false;
  }

  // should have no pieces on the board
  for (let piece of pieces) {
    if (piece.tile !== -1 && piece.tile !== 29) {
      return false;
    }
  }
  
  return true; 
}