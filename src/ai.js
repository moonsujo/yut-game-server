import { allPiecesOut, checkFinishRule, getNextTiles, getOccupiedTiles, isEmptyMoves, movePieces, scorePieces, tileType, winCheck } from '../rules/rulesHelpers.js'
import { getLegalTiles } from '../rules/legalTiles.js'

// return: { sequence, score }
// sequence: [{ token id, move }]
export function pickBestMoveSequence({ moves, friendlyPieces, enemies, bestMoveSequence, backdoLaunch, numTokens, throwsEarned, shortcutOptions }) {

  // base case
  if (isEmptyMoves(moves) || winCheck(friendlyPieces)) {
    // calculate score
    // if moves is empty
    // return move sequence with score
    let score = calculateScore({ 
      pieces: friendlyPieces, 
      enemyPieces: enemies, 
      backdoLaunch,
      throwsEarned,
      shortcutOptions
    })

    return { sequence: bestMoveSequence.sequence, score }
  } else {

    let nextBestScore = 100
    let nextBestSequence = []
    let occupiedTiles = getOccupiedTiles({ pieces: friendlyPieces })
    for (let i = 0; i < numTokens; i++) {
      // take a piece
      // get legal tiles
      // get token positions when that move is made
      // score that set of positions
      // do it for each legal tile
  
      let selectedPiece = friendlyPieces[i]
      let tile = selectedPiece.tile
      let team = selectedPiece.team
      let id = selectedPiece.id
      let history;
      let selectedPieces;
      if (tileType(tile) === 'home') {
        history = []
        selectedPieces = [{tile, team, id, history}]
      } else {
        history = selectedPiece.history // go back the way you came from of the first token
        selectedPieces = occupiedTiles[tile];
      }
      let legalTiles = getLegalTiles(tile, moves, friendlyPieces, history, backdoLaunch)

      // appends move for every token
      // should pick one of them
      // sample output: 
      /**
       * smart move sequence [
          { tile: 3, move: '3', history: [ 0, 1, 2 ], path: [ 0, 1, 2, 3 ] },
          { tile: 3, move: '3', history: [ 0, 1, 2 ], path: [ 0, 1, 2, 3 ] },
          { tile: 3, move: '3', history: [ 0, 1, 2 ], path: [ 0, 1, 2, 3 ] },
          { tile: 3, move: '3', history: [ 0, 1, 2 ], path: [ 0, 1, 2, 3 ] }
        ]
       */
      if (!(Object.keys(legalTiles).length === 0)) {
        for (let legalTile of Object.keys(legalTiles)) {
          legalTile = parseInt(legalTile)
          // if legal tile is 29
          // pick the lowest move whether there's one move or multiple moves
          let moveInfo
          if (legalTile === 29) {
            for (const moveInfo of legalTiles[legalTile]) {
              const [newPieces] = scorePieces({ 
                pieces: friendlyPieces,
                movingPieces: selectedPieces,
                path: moveInfo.path,
                history: moveInfo.history,
              })
              let newMoves = JSON.parse(JSON.stringify(moves))
              newMoves[moveInfo.move]--
              let nextBestMoveSequence = JSON.parse(JSON.stringify(bestMoveSequence))
              nextBestMoveSequence.sequence.push({
                tokenId: i,
                moveInfo,
              })
              let candidate = pickBestMoveSequence({ 
                moves: newMoves, 
                friendlyPieces: newPieces, 
                enemies, 
                bestMoveSequence: nextBestMoveSequence, 
                backdoLaunch, 
                numTokens,
                throwsEarned
              })
              if (candidate.score < nextBestScore) {
                nextBestScore = candidate.score
                nextBestSequence = candidate.sequence
              }
            }
          } else {
            moveInfo = legalTiles[legalTile]
            const [newFriendlyPieces, newEnemyPieces, caught] = movePieces({ 
              friendlyPieces,
              enemies,
              movingPieces: selectedPieces,
              to: parseInt(legalTile),
              path: moveInfo.path,
              history: moveInfo.history,
            })
            let newMoves = JSON.parse(JSON.stringify(moves))
            newMoves[moveInfo.move]--
            let nextBestMoveSequence = JSON.parse(JSON.stringify(bestMoveSequence))
            nextBestMoveSequence.sequence.push({
              tokenId: i,
              moveInfo
            })
            let candidate = pickBestMoveSequence({ 
              moves: newMoves, 
              friendlyPieces: newFriendlyPieces, 
              enemies: newEnemyPieces, 
              bestMoveSequence: nextBestMoveSequence, 
              backdoLaunch, 
              numTokens,
              throwsEarned: throwsEarned + (caught ? 1 : 0)
            })
            if (candidate.score < nextBestScore) {
              nextBestScore = candidate.score
              nextBestSequence = candidate.sequence
            }
          }
        }
      }
    }
    return { sequence: nextBestSequence, score: nextBestScore }
  }
}

export function calculateSmartMoveSequence({ room, team }) {
  const moves = room.teams[team].moves.toObject()
  const friendlyPieces = room.teams[team].pieces
  const enemies = room.teams[team === 0 ? 1 : 0].pieces
  
  let bestMoveSequence = pickBestMoveSequence({ 
    moves, 
    friendlyPieces, 
    enemies, 
    bestMoveSequence: { sequence: [], score: 100 },
    backdoLaunch: room.rules.backdoLaunch,
    numTokens: room.rules.numTokens,
    throwsEarned: 0,
    shortcutOptions: room.rules.shortcutOptions
  }).sequence

  return bestMoveSequence
}

// should favor getting closer than advancing the one in front
// add additional points for number of throws
export function calculateScore({ pieces, enemyPieces, backdoLaunch, throwsEarned, shortcutOptions }) {
  // get long distance from piece's tile to finish
  let score;
  // depth first search
  // measure 1: distance to finish
  // piggyback counts distance only once
  let friendlyDistanceScore = 0
  let enemyDistanceScore = 0
  let enemyTiles = getOccupiedTiles({ pieces: enemyPieces })
  let friendlyTiles = getOccupiedTiles({ pieces: pieces })
  for (let friendlyTile of Object.keys(friendlyTiles)) {
    friendlyTile = parseInt(friendlyTile)
    if (friendlyTile === -1) {
      // longest to compare distance. shorter the better
      friendlyDistanceScore += (startCalculateLongestPathHome(friendlyTile, 0) * friendlyTiles[friendlyTile].length)
    } else {
      if (friendlyTile > 0 && friendlyTile < 4) {
        // Heuristic: Escape the first row. Don't dedup score so it prioritizes exit
        // Higher means worse 
        // between length of longest path from first shortcut and second shortcut (star 6)
        // case: ship at 2, ship at 4. ge. piggyback at 4 or send ship at 4 to 6. if no piggyback, sending ship to 6 is worse because the path is longer.
        const penalizeFirstRow = 5 * friendlyTiles[friendlyTile].length 
        friendlyDistanceScore += (startCalculateLongestPathHome(friendlyTile, 0) * friendlyTiles[friendlyTile].length) + penalizeFirstRow
      } else {
        friendlyDistanceScore += startCalculateLongestPathHome(friendlyTile, 0)
      }
    }
  }
  for (let enemyTile of Object.keys(enemyTiles)) {
    enemyTile = parseInt(enemyTile)
    if (enemyTile === -1) {
      enemyDistanceScore += (startCalculateLongestPathHome(enemyTile, 0) * enemyTiles[enemyTile].length)
    } else {
      enemyDistanceScore += startCalculateLongestPathHome(enemyTile, 0)
    }
  }

  
  const moveSets = {
    '1': { // one move
      '0': 0,
      '1': 1, 
      '2': 0, 
      '3': 0, 
      '4': 0,
      '5': 0,
      '-1': 0
    },
    '2': { // two move
      '0': 0,
      '1': 0, 
      '2': 1, 
      '3': 0, 
      '4': 0,
      '5': 0,
      '-1': 0
    }, 
    '3': { // three move
      '0': 0,
      '1': 0, 
      '2': 0, 
      '3': 1, 
      '4': 0,
      '5': 0,
      '-1': 0
    },
    '4': { // four move
      '0': 0,
      '1': 0, 
      '2': 0, 
      '3': 0, 
      '4': 1,
      '5': 0,
      '-1': 0
    },
    '5': { // five move
      '0': 0,
      '1': 0, 
      '2': 0, 
      '3': 0, 
      '4': 0,
      '5': 1,
      '-1': 0
    },
    // Commented: don't count backdo in future move calculation
    // '-1': { // backdo move
    //   '0': 0,
    //   '1': 0, 
    //   '2': 0, 
    //   '3': 0, 
    //   '4': 0,
    //   '5': 0,
    //   '-1': 1
    // }
  }
  const proximityScore = {
    '1': 3,
    '2': 4,
    '3': 4,
    '4': 2,
    '5': 1,
    // Commented: don't count backdo in future move calculation
    // '-1': 1 
  }

  // measure 2: enemies behind you within catch range
  let enemyProximityScore = 0
  if (throwsEarned === 0) {
    for (let enemyTile of Object.keys(enemyTiles)) {
      enemyTile = parseInt(enemyTile)
      let history
      if (tileType(enemyTile) === 'home') {
        history = []
      } else {
        history = enemyTiles[enemyTile][0].history
      }
      // count piggyback pieces only once
      // technically, pieces at home are piggybacked
      for (const move of Object.keys(moveSets)) {
        if (move !== '-1') { // don't count backdo to anticipate future move
          const legalTiles = getLegalTiles(enemyTile, moveSets[move], enemyPieces, history, backdoLaunch)
          // check how many friendlies are on it
          // multiply score by that number
          if (Object.keys(legalTiles).length > 0) {
            let numMostTokens = 0
            for (const legalTile of Object.keys(legalTiles)) {
              if (legalTile !== 29) {
                // if you're on a shortcut, count the legal tile with the most pieces to catch
                if (friendlyTiles[legalTile] && friendlyTiles[legalTile].length > numMostTokens) {
                  numMostTokens = friendlyTiles[legalTile].length
                }
              }
            }
            enemyProximityScore += (proximityScore[move] * numMostTokens)
          }
        }
      }
    }
  }

  // measure 3: friendlies in piggyback range
  // measure 4: enemies in front of you within catch range
  // if token is within 5 stars, give 1 point
  // prevent spreading out tokens over first row
  let piggybackScore = 0
  let enemyCatchScore = 0
  let piggybackFound = false
  for (let friendlyTile of Object.keys(friendlyTiles)) {
    friendlyTile = parseInt(friendlyTile)
    let history
    if (tileType(friendlyTile) === 'home') {
      history = []
    } else {
      history = friendlyTiles[friendlyTile][0].history
    }
    // count piggyback pieces only once
    // technically, pieces at home are piggybacked
    for (const move of Object.keys(moveSets)) {
      if (parseInt(move) !== 0 && move !== -1) { // don't count backdo to anticipate future move
        const legalTiles = getLegalTiles(friendlyTile, moveSets[move], pieces, history, backdoLaunch)
        // console.log('move', move, 'legalTiles', legalTiles)
        // check how many enemies are on it
        // multiply score by that number
        if (Object.keys(legalTiles).length > 0) {
          for (let legalTile of Object.keys(legalTiles)) {
            legalTile = parseInt(legalTile)
            if (legalTile !== 29 && legalTile !== -1) {
              if (friendlyTiles[legalTile]) {
                piggybackFound = true
                break
              } else if (enemyTiles[legalTile]) {
                // check how many enemies are on it
                // multiply score by that number
                let numMostTokens = 0
                // if you're on a shortcut, count the legal tile with the most pieces to catch
                if (enemyTiles[legalTile].length > numMostTokens) {
                  numMostTokens = enemyTiles[legalTile].length
                }
                // don't reward catching if you're ahead
                if (friendlyDistanceScore > enemyDistanceScore) {
                  enemyCatchScore += (proximityScore[move] * numMostTokens)
                }
              }
            }
          }
        }
        if (piggybackFound) {
          break
        }
      }
    }
    if (piggybackFound) {
      piggybackScore = 1
    }
  }

  // measure 5: throws earned during the sequence
  let throwsEarnedScore = throwsEarned * 10

  // heuristic 1: prioritize catch if all remaining enemies are on the board
  // get the shortest distance between enemy and friendly
  // add it to score - algorithm selects lowest score
  /* 
  let catchPrioritizeScore = 100
  if (allPiecesOut({ pieces: enemyPieces }) && friendlyDistanceScore > enemyDistanceScore && enemyCatchScore === 0) {
    let enemyFound = false
    
    // get legal tile for enemy with gul
    // if shortcut, pick the shortest path to home
    for (let enemyTile of Object.keys(enemyTiles)) {
      enemyTile = parseInt(enemyTile)
      let history
      if (tileType(enemyTile) === 'home') {
        history = []
      } else {
        history = enemyTiles[enemyTile][0].history
      }
      const legalTiles = getLegalTiles(enemyTile, moveSets['3'], enemyPieces, history, backdoLaunch, shortcutOptions)
      console.log('legal tiles', Object.keys(legalTiles))
      let shortestDistanceTile
      if (Object.keys(legalTiles).length > 0) {
        // pick distance that's shortest to earth
        let candidate
        let shortestDistanceHome = 100
        for (let tile of Object.keys(legalTiles)) {
          tile = parseInt(tile)
          candidate = startCalculateLongestPathHome(tile, 0, shortcutOptions)
          console.log('candidate', candidate)
          if (candidate < shortestDistanceHome) {
            shortestDistanceHome = candidate
            shortestDistanceTile = tile
          }
        }
      }
      console.log(`shortestDistanceTile ${shortestDistanceTile}`)
      // use catchPrioritizeScore
      for (let friendlyTile of Object.keys(friendlyTiles)) {
        friendlyTile = parseInt(friendlyTile)
        // calculate shortest distance from friendlyTile to enemy tile
        // if path found
        // enemyFound = true
        let candidate = calculateLongestPathDestination(friendlyTile, 0, shortestDistanceTile)
        if (candidate > -1) {
          enemyFound = true
          if (candidate < catchPrioritizeScore) {
            catchPrioritizeScore = candidate
          }
        }
      }
    }

    // if you didn't find an enemy in any paths
    if (!enemyFound) {
      // advance the token that is closest to earth
      // add the distance of the token closest to earth
      
      for (let friendlyTile of Object.keys(friendlyTiles)) {
        friendlyTile = parseInt(friendlyTile)
        // calculate shortest distance from friendlyTile to enemy tile
        // if path found
        // enemyFound = true
        let candidate = calculateLongestPathHome(friendlyTile, 0)
        if (candidate < catchPrioritizeScore) {
          catchPrioritizeScore = candidate
        }
      }
    }
  } else {
    catchPrioritizeScore = -1 // it can be 0 if potential enemy tile and friendly tile overlap
  }
  */

  console.log('friendlyDistanceScore', friendlyDistanceScore)
  console.log('enemyDistanceScore', enemyDistanceScore)
  console.log('enemyProximityScore', enemyProximityScore)
  console.log('piggybackScore', piggybackScore)
  console.log('enemyCatchScore', enemyCatchScore)
  console.log('throwsEarnedScore', throwsEarnedScore)
  // console.log('catchPrioritizeScore', catchPrioritizeScore)
  // if (catchPrioritizeScore > -1) {
  //   score = catchPrioritizeScore
  // } else {
  //   score = friendlyDistanceScore - enemyDistanceScore + enemyProximityScore - piggybackScore - enemyCatchScore - throwsEarnedScore
  // }
  score = friendlyDistanceScore - enemyDistanceScore + enemyProximityScore - piggybackScore - enemyCatchScore - throwsEarnedScore
  console.log('final score', score)
  return score
}

// force tile 10, 25, 26, and 22 to the shortcut distance
// instead of taking the long way from the moon
function startCalculateLongestPathHome(tile, longestDistance) {
  if (tile === 29) { // scored
    return 0 
  } else if (tile === 10) { // Saturn - take shortcut over long path
    return 7 
  } else if (tile === 25) { // Vertical shortcut - take shortcut over zigzag
    return 6
  } else if (tile === 26) { // Vertical shortcut - take shortcut over zigzag
    return 5
  } else if (tile === 22) { // Moon - take shortcut over long path
    return 4
  } else if (tile === 5) { // Mars - take shortcut over long path
    return 12 
  } else {
    return calculateLongestPathHome(tile, longestDistance)
  }
}

// dfs
// longest distance from start is 22 because of the path from saturn to moon and neptune
export function calculateLongestPathHome(tile, longestDistance) {
  
  longestDistance+=1

  const nextTiles = checkFinishRule(getNextTiles(tile, true, true)) // shortcutOptions enabled to calculate the longest path
  // caller (startCalculateLongestPathHome) accounts for starting from shortcut
  
  // base case
  if (nextTiles[0] === 29) {
    return longestDistance
  } else {
    let nextLongestDistance = 0
    for (const nextTile of nextTiles) {
      const candidate = calculateLongestPathHome(nextTile, longestDistance)
      if (candidate > nextLongestDistance) {
        nextLongestDistance = candidate
      }
    }
    return nextLongestDistance
  }
}

// dfs
// longest distance from start is 22 because of the path from saturn to moon and neptune
export function calculateLongestPathDestination(start, longestDistance, end) {

  if (start === end) {
    return longestDistance
  }
  
  longestDistance+=1

  const nextTiles = checkFinishRule(getNextTiles(start, true, shortcutOptions))
  
  // base case
  if (nextTiles[0] === 29) {
    return -1 // not found
  } else {
    let nextLongestDistance = -2 // less than base case
    for (const nextTile of nextTiles) {
      const candidate = calculateLongestPathDestination(nextTile, longestDistance, end)
      if (candidate > nextLongestDistance) {
        nextLongestDistance = candidate
      }
    }
    return nextLongestDistance
  }
}