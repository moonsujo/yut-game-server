import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import router from './router.js'; // needs .js suffix
import cors from 'cors';
import mongoose from 'mongoose';
import { hasValidMove, makeId } from './helpers.js';
import initialState from './initialState.js';
import { getLegalTiles } from './rules/legalTiles.js'
import { hasTokenOnBoard, isBackdoMoves, isEmptyMoves, movePieces, scorePieces, tileType, winCheck } from './rules/rulesHelpers.js'
import { calculateSmartMoveSequence } from './src/ai.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // origin: [
    //   "https://master.dh445c3qmwe4t.amplifyapp.com",
    // ],
    origin: "*"
  },
});

const PORT = process.env.PORT || 5000

app.use(router);
app.use(cors());

server.listen(PORT, () => console.log(`server has started on port ${PORT}`))

async function connectMongo() {
  await mongoose.connect("mongodb+srv://beatrhino:databaseAdmin@yootgamecluster.fgzfv9h.mongodb.net/yootGameDb")
}

const userSchema = new mongoose.Schema(
  {
    socketId: String,
    roomId: String, // shortId
    name: String,
    team: Number,
    connectedToRoom: Boolean,
    createdTime: Date,
    status: String, // playing, away
    type: String,
    level: String,
    moveSequence: [{
      tokenId: Number,
      moveInfo: {
        tile: Number,
        move: String,
        history: [Number],
        path: [Number]
      },
      _id: false
    }]
  },
  {
    versionKey: false,
  }
)

const roomSchema = new mongoose.Schema(
  {
    shortId: String,
    createdTime: Date,
    spectators: [{
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'users'
    }],
    teams: [{
      _id: Number,
      players: [{
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'users'
      }],
      pieces: [{
        tile: Number, // Home: -1, Scored: 29
        team: Number,
        id: Number,
        history: [Number],
        lastPath: [Number],
        _id: false
      }],
      throws: Number,
      moves: {
        '0': Number,
        '1': Number,
        '2': Number,
        '3': Number,
        '4': Number,
        '5': Number,
        '-1': Number
      },
      pregameRoll: Number
    }],
    turn: {
      team: Number,
      players: [Number]
    },
    messages: [{
      _id: false,
      name: String,
      team: Number,
      text: String
    }],
    gameLogs: [{
      _id: false,
      logType: String,
      content: Object
    }],
    host: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'users'
    },
    gamePhase: String,
    yootOutcome: Number,
    yootAnimation: Number,
    pregameOutcome: String,
    selection: {
      tile: Number,
      pieces: [{
        tile: Number,
        team: Number,
        id: Number,
        history: [Number],
        lastPath: [Number],
        _id: false
      }],
    },
    legalTiles: Object,
    tiles: [
      [
        {
          tile: Number,
          team: Number,
          id: Number,
          history: [Number],
          lastPath: [Number],
          _id: false
        }
      ]
    ],
    results: [Number],
    serverEvent: {
      name: String,
      content: Object,
      gameLogs: [Object]
    },
    lastJoinedUser: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'users'
    },
    paused: Boolean,
    rules: {
      backdoLaunch: Boolean,
      timer: Boolean,
      nak: Boolean,
      yutMoCatch: Boolean,
      shortcutOptions: Boolean,
      numTokens: Number,
    },
    turnStartTime: Number,
    turnExpireTime: Number,
    timerId: Number,
    turnsSkipped: Number,
    pauseTime: Number,
    kea4: Boolean
  },
  {
    versionKey: false,
    minimize: false
  }
)

const User = mongoose.model('users', userSchema)
const Room = mongoose.model('rooms', roomSchema)

async function addUser(socket, name, roomId, savedClient) {
  savedClient = JSON.parse(savedClient)
  try {
    // Input validation
    if (socket.length > 20) {
      throw new Error('socket id is too long')
    } else if (name.length > 16) {
      throw new Error('name is too long')
    } else if (roomId.length > 5) {
      throw new Error('roomId is too long')
    }
    let user;
    if (savedClient === null) {
      user = new User({
        socketId: socket.id,
        name,
        team: -1,
        roomId: null,
        connectedToRoom: false,
        createdTime: new Date(),
        status: 'playing',
        type: 'human',
        level: 'human',
        nextMove: {
          tile: null,
          move: null,
          history: [],
          path: []
        }
      })
      await user.save()
    } else {
      // in mongodb, when client leaves, the roomId and name haven't changed
      // room refers to player by _id
      // room[team].players array has objectIds, and that object's team hasn't been updated, which is why the host.team is -1 and 'players' is null
      if (roomId !== savedClient.roomId) {
        // If player, remove from the saved room
        if (savedClient.team === 0 || savedClient.team === 1) {
          await User.deleteOne({ roomId: savedClient.roomId, name: savedClient.name })
          let room = await Room.findOne({ shortId: savedClient.roomId })
          if (room) {
            let roomPlayerIndex = room.teams[savedClient.team].players.findIndex((player) => {
              return player._id.valueOf() === savedClient._id.valueOf()
            })
            room.teams[savedClient.team].players.splice(roomPlayerIndex, 1)
            room.serverEvent = {
              name: 'playerRoomSwitch',
              content: {
                roomPlayerIndex,
                roomPlayerTeam: savedClient.team
              }
            }
            await room.save()
          }
        }

        user = new User({
          socketId: socket.id,
          name,
          team: -1,
          roomId,
          connectedToRoom: false,
          createdTime: new Date(),
          status: 'playing',
          type: 'human',
          level: 'human',
          nextMove: {
            tile: null,
            move: null,
            history: [],
            path: []
          }
        })
        await user.save()
      } else {
        user = await User.findOneAndUpdate({ roomId: savedClient.roomId, name: savedClient.name }, { socketId: socket.id, connectedToRoom: false })
        // User could have been kicked, and removed
        if (!user) {
          user = new User({
            socketId: socket.id,
            name,
            team: -1,
            roomId: null,
            connectedToRoom: false,
            createdTime: new Date(),
            status: 'playing',
            type: 'human',
            level: 'human',
            nextMove: {
              tile: null,
              move: null,
              history: [],
              path: []
            }
          })
          await user.save()
        }
      }
    }
  } catch (err) {
    console.log('[addUser] error', err)
    return null
  }
}

// Room stream listener
Room.watch([], { fullDocument: 'updateLookup' }).on('change', async (data) => {
  if (data.operationType === 'insert' || data.operationType === 'update') {
    // Emit document to all clients in the room
    // instead of concatting everything, do it separately
    // building array takes time
    let users = data.fullDocument.spectators.concat(data.fullDocument.teams[0].players.concat(data.fullDocument.teams[1].players))

    // populate only when players are emitted
    let roomPopulated = await Room.findOne({ shortId: data.fullDocument.shortId })
    .populate('spectators')
    .populate('host')
    .populate('teams.players')
    .exec()
    let room = data.fullDocument;
    const serverEvent = data.fullDocument.serverEvent
    for (const user of users) {
      try {
        let userFound = await User.findById(user, 'socketId connectedToRoom roomId name').exec()
        if (userFound.roomId === data.fullDocument.shortId && userFound.connectedToRoom) {
          let userSocketId = userFound.socketId
          if (serverEvent.name === 'gameStart') {
            io.to(userSocketId).emit('gameStart', {
              gamePhase: room.gamePhase,
              newTeam: room.turn.team,
              newPlayer: room.turn.players[room.turn.team],
              throwCount: room.teams[room.turn.team].throws,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
              newGameLog: serverEvent.content.gameLog,
              timer: room.rules.timer,
              hasAI: serverEvent.content.hasAI
            })
            // separating it into two events lags the client
          } else if (serverEvent.name === 'passTurn') {
            io.to(userSocketId).emit('passTurn', {
              newTeam: room.turn.team,
              newPlayer: room.turn.players[room.turn.team],
              throwCount: room.teams[room.turn.team].throws,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
              gamePhase: room.gamePhase,
              content: serverEvent.content,
              newGameLogs: serverEvent.content.gameLogs,
              paused: room.paused,
            })
          } else if (serverEvent.name === 'recordThrow') {
            io.to(userSocketId).emit("recordThrow", {
              teams: roomPopulated.teams, // only the moves and throws
              // if 0 or -1 was recorded, clear moves depending on isEmptyMoves or isBackdo...Moves
              // if a yut or mo was thrown, update throws for the team
              gamePhaseUpdate: data.fullDocument.gamePhase,
              turnUpdate: data.fullDocument.turn,
              pregameOutcome: data.fullDocument.pregameOutcome,
              yootOutcome: data.fullDocument.yootOutcome,
              newGameLogs: serverEvent.content.gameLogs,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
              paused: room.paused
            })
          } else if (serverEvent.name === 'move') {
            io.to(userSocketId).emit('move', {
              newTeam: room.turn.team,
              prevTeam: serverEvent.content.prevTeam,
              newPlayer: room.turn.players[room.turn.team],
              moveUsed: serverEvent.content.moveUsed,
              updatedPieces: serverEvent.content.updatedPieces,
              updatedTiles: serverEvent.content.updatedTiles,
              throws: serverEvent.content.throws,
              newGameLogs: serverEvent.content.gameLogs,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
              paused: room.paused
            })
          } else if (serverEvent.name === "select") {
            if (userSocketId !== serverEvent.userSocketId) {
              io.to(userSocketId).emit("select", {
                selection: data.fullDocument.selection,
                legalTiles: data.fullDocument.legalTiles // should emit an array of tile indices
              })
            }
          } else if (serverEvent.name === 'throwYut') {
            io.to(userSocketId).emit('throwYut', { 
              yootOutcome: data.fullDocument.yootOutcome, 
              yootAnimation: data.fullDocument.yootAnimation, 
              throwCount: room.teams[room.turn.team].throws,
              turnExpireTime: room.turnExpireTime,
              newGameLogs: serverEvent.content.gameLogs,
            })
          } else if (serverEvent.name === 'score') {
            io.to(userSocketId).emit('score', { 
              newTeam: room.turn.team,
              prevTeam: serverEvent.content.prevTeam,
              newPlayer: room.turn.players[room.turn.team],
              moveUsed: serverEvent.content.moveUsed,
              updatedPieces: serverEvent.content.updatedPieces,
              from: serverEvent.content.fromTile,
              throws: serverEvent.content.throws,
              winner: serverEvent.content.winner, // -1, 0 or 1
              gamePhase: data.fullDocument.gamePhase,
              newGameLogs: serverEvent.content.gameLogs,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
              paused: room.paused
            })
          } else if (serverEvent.name === "joinRoom") {
            if (user._id.valueOf() === data.fullDocument.lastJoinedUser.valueOf()) {
              io.to(userSocketId).emit('room', roomPopulated)
            } else {
              io.to(userSocketId).emit('joinRoom', { 
                // pick out which array was updated by serverEvent.content
                spectators: roomPopulated.spectators,
                teams: roomPopulated.teams,
                host: roomPopulated.host,
                gamePhase: roomPopulated.gamePhase
              })
            }
          } else if (serverEvent.name === "joinTeam") {
            io.to(userSocketId).emit("joinTeam", { 
              spectators: roomPopulated.spectators,
              playersTeam0: roomPopulated.teams[0].players,
              playersTeam1: roomPopulated.teams[1].players,
              gamePhase: roomPopulated.gamePhase,
              host: roomPopulated.host,
              turn: roomPopulated.turn // Used to set the throw count for the current team
            })
          } else if (serverEvent === "reset") {
            io.to(userSocketId).emit("reset");
          } else if (serverEvent.name === "spectatorDisconnect") {
            io.to(userSocketId).emit("spectatorDisconnect", { 
              name: serverEvent.name,
            })
          } else if (serverEvent.name === "playerDisconnect") {
            io.to(userSocketId).emit("playerDisconnect", { 
              team: serverEvent.content.team,
              name: serverEvent.content.name,
            })
          } else if (serverEvent.name === "playerDisconnectLobby") {
            io.to(userSocketId).emit("playerDisconnectLobby", { 
              playersTeam0: roomPopulated.teams[0].players,
              playersTeam1: roomPopulated.teams[1].players,
            })
          } else if (serverEvent.name === "setAway") {
            io.to(userSocketId).emit("setAway", { 
              player: serverEvent.content,
              paused: room.paused
            })
          } else if (serverEvent.name === "setTeam") {
            io.to(userSocketId).emit("setTeam", { 
              user: serverEvent.content.user,
              prevTeam: serverEvent.content.prevTeam
            })
          } else if (serverEvent.name === "assignHost") {
            io.to(userSocketId).emit("assignHost", { 
              newHost: serverEvent.content
            })
          } else if (serverEvent.name === "kick") {
            io.to(userSocketId).emit("kick", { 
              team: serverEvent.content.team,
              name: serverEvent.content.name,
              turn: room.turn,
              paused: room.paused,
              gamePhase: room.gamePhase,
              hasAI: serverEvent.content.hasAI
            })
          } else if (serverEvent.name === "pause") {
            io.to(userSocketId).emit("pause", { 
              flag: serverEvent.content.flag,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
            })
          } else if (serverEvent.name === "setGameRule") {
            io.to(userSocketId).emit("setGameRule", { 
              rule: serverEvent.content.rule,
              flag: serverEvent.content.flag,
              turnStartTime: room.turnStartTime,
              turnExpireTime: room.turnExpireTime,
              paused: room.paused
            })
          } else if (serverEvent.name === "playerRoomSwitch") {
            io.to(userSocketId).emit("playerRoomSwitch", { 
              roomPlayerIndex: serverEvent.content.roomPlayerIndex,
              roomPlayerTeam: serverEvent.content.roomPlayerTeam
            })
          } else if (serverEvent.name === 'sendMessage') {
            io.to(userSocketId).emit("sendMessage", {...serverEvent.content})
          } else if (serverEvent.name === 'kea4') { // don't send to clients
          } else {
            io.to(userSocketId).emit('room', roomPopulated)
          }
        }
      } catch (err) {
        console.log(`[Room.watch] error in Room.watch`, err)
      }
    }
  }
})

async function createUniqueRoomId() {
  let roomId;
  let exists = true;
  let idLength = 4;
  while (exists) {
    roomId = makeId(idLength, false, true);
    exists = await Room.findOne({ shortId: roomId }).exec(); // Check for collisions
  }
  return roomId;
}

async function createUniqueUsername() {
  let name;
  let exists = true;
  let idLength = 5;
  while (exists) {
    name = makeId(idLength)
    exists = await User.findOne({ name }).exec(); // Check for collisions
  }
  return name;
}

async function createUniqueAIName(level) {
  let name;
  let exists = true;
  while (exists) {
    name = ''
    if (level === 'random') {
      name += 'AIBOT-EZ-'
    } else if (level === 'smart') {
      name += 'AIBOT-'
      // name += 'AIBOT-SMART-'
    }
    name += makeId(5, false, true)
    exists = await User.findOne({ name }).exec(); // Check for collisions
  }
  return name;
}

const BASE_TURN_EXPIRE_TIME = 60000 // add time for expired alert // 60000
const ALERT_TIME = 2500
const JUMP_TIME = 1000
const NUM_TURNS_SKIPPED_TO_PAUSE = 5
io.on("connect", async (socket) => {

  connectMongo().catch(err => console.log('mongo connect error', err))

  // when i add data to the socket via the dot operator,
  // it doesn't change across events

  socket.on("addUser", async ({ roomId, savedClient }, callback) => {
    try {
      const room = await Room.findOne({ shortId: roomId })
      if (!room) {
        throw new Error(`room with short id ${roomId} doesn't exist`)
      }
      let name = await createUniqueUsername()
      await addUser(socket, name, roomId, savedClient)
      return callback('success')
    } catch (err) {
      console.log ('[addUser] error', err)
      return callback('fail')
    }
  })

  socket.on("addAI", async ({ roomId, clientId, team, level }) => {
    console.log('[addAI]')
    try {
      const room = await Room.findOne({ shortId: roomId, host: clientId })
      if (!room) {
        throw new Error(`room with short id ${roomId} or host with id ${clientId} doesn't exist`)
      }

      let name = await createUniqueAIName(level)
      let ai = new User({
        socketId: 'ai',
        name,
        team,
        roomId,
        connectedToRoom: true,
        createdTime: new Date(),
        status: 'playing',
        type: 'ai',
        level,
        moveSequence: null
      })
      await ai.save()

      // Add user to team
      room.teams[team].players.push(ai)
      room.serverEvent = {
        name: 'joinTeam',
        content: {}
      }
      await room.save()

    } catch (err) {
      console.log ('[addAI] error', err)
    }
  })

  socket.on("createRoom", async ({}, callback) => {
    let objectId = new mongoose.Types.ObjectId()
    const shortRoomId = await createUniqueRoomId()

    // Get user by socket id
    try {
      let user = await User.findOne({ socketId: socket.id })
      if (!user) {
        throw new Error(`user with socket id ${socket.id} not found`)
      }
    } catch (err) {
      console.log(`[createRoom] error getting user`, err)
    }

    // Create room with socket id owner as host
    try {
      const room = new Room({
        _id: objectId,
        shortId: shortRoomId,
        createdTime: new Date(),
        spectators: [],
        teams: [
          {
            _id: 0,
            players: [],
            pieces: JSON.parse(JSON.stringify(initialState.initialPiecesTeam0)),
            moves: JSON.parse(JSON.stringify(initialState.initialMoves)),
            throws: 0,
            pregameRoll: null
          },
          {
            _id: 1,
            players: [],
            pieces: JSON.parse(JSON.stringify(initialState.initialPiecesTeam1)),
            moves: JSON.parse(JSON.stringify(initialState.initialMoves)),
            throws: 0,
            pregameRoll: null
          }
        ],
        messages: [],
        gameLogs: [],
        host: null,
        gamePhase: 'lobby',
        turn: {
          team: -1,
          players: [0, 0]
        },
        yootOutcome: null,
        yootAnimation: null,
        pregameOutcome: null,
        selection: null,
        legalTiles: {},
        tiles: JSON.parse(JSON.stringify(initialState.initialTiles)),
        results: [],
        moveResult: {
          type: '',
          team: -1,
          amount: 0,
          tile: -1
        },
        throwResult: {
          type: '',
          num: -2,
          time: Date.now()
        },
        serverEvent: {
          name: '',
          content: {},
          gameLogs: []
        },
        paused: false,
        rules: {
          backdoLaunch: false,
          timer: true,
          // timer: false,
          nak: true,
          yutMoCatch: false,
          shortcutOptions: false,
          numTokens: 4
        },
        turnStartTime: null,
        turnExpireTime: null,
        timerId: null,
        turnsSkipped: 0,
        pauseTime: null,
        kea4: false
      })
      await room.save();
      return callback({ shortId: shortRoomId })
    } catch (err) {
      return callback({ error: err.message })
    }
  })

  socket.on("checkRoomExists", async ({ roomId }, callback) => {
    // enhancement: return a string
    // if 'findOne' fails, display 'failed to call database' error
    // this way, user knows to return after a certain time
    let exists;
    try {
      let room = await Room.findOne({ shortId: roomId })
      if (!room) {
        exists = false
      } else {
        exists = true
      }
      callback({ exists })
    } catch (err) {
      console.log(`[checkRoomExists] error checking if room exists`, err)
    }
  })

  socket.on("joinRoom", async ({ roomId }) => {
    try {
      let user = await User.findOneAndUpdate({ 'socketId': socket.id }, { roomId, connectedToRoom: true }, { new: true })
      if (!user) {
        throw new Error(`user with socket id ${socket.id} not found`)
      }
      let operation = {}
      if (user && user.roomId && user.roomId.valueOf() === roomId) {
        if (user.team === -1) { // if spectator
          operation['$addToSet'] = { "spectators": user._id }
          operation['$set'] = { 
            "serverEvent": {
              name: 'joinRoom',
              content: {}
            },
            "lastJoinedUser": user._id
          }
        } else {
          operation['$addToSet'] = { [`teams.${user.team}.players`]: user._id }
          operation['$set'] = { 
            "serverEvent": {
              name: 'joinRoom',
              content: {}
            },
            "lastJoinedUser": user._id
          }
        }
      } else { // Use default values (add as spectator)
        operation['$addToSet'] = { "spectators": user._id }
        operation['$set'] = { 
          "serverEvent": {
            name: 'joinRoom',
            content: {}
          },
          "lastJoinedUser": user._id
        }
        user.name = makeId(5);
        user.team = -1
        await user.save();
      }
      await Room.findOneAndUpdate( { shortId: roomId }, operation )
    } catch (err) {
      console.log(`[joinRoom] error adding user to room`, err)
    }

    // Add user as host if room is empty
    try {
      let user = await User.findOne({ 'socketId': socket.id })
      let room = await Room.findOne({ shortId: roomId })
      if (!room) {
        throw new Error(`room with id ${roomId} not found`)
      }
      if (!user) {
        throw new Error(`user with socket id ${socket.id} not found`)
      }
      if (room.host === null) {
        room.host = user._id
        await room.save()
      }
    } catch (err) {
      console.log(`[joinRoom] error adding user as host`, err)
    }
  })
  
  socket.on("joinTeam", async ({ team, name }, callback) => {
    let player;
    try {
      player = await User.findOne({ 'socketId': socket.id })
      if (!player) {
        throw new Error(`player with socket id ${socket.id} not found`)
      }
      player.team = team
      player.name = name
      await player.save()
      
      const room = await Room.findOne({ shortId: player.roomId })

      // Remove user from spectator, team0 and team1 arrays
      let userIndex;
      userIndex = room.spectators.indexOf(player._id)
      if (userIndex > -1) {
        room.spectators.splice(userIndex, 1)
      }
      userIndex = room.teams[0].players.indexOf(player._id)
      if (userIndex > -1) {
        room.teams[0].players.splice(userIndex, 1)
      }
      userIndex = room.teams[1].players.indexOf(player._id)
      if (userIndex > -1) {
        room.teams[1].players.splice(userIndex, 1)
      }
      
      // Add user to team
      room.teams[team].players.push(player._id)
      room.serverEvent = {
        name: 'joinTeam',
        content: {}
      }
      await room.save()
    } catch (err) {
      console.log(`[joinTeam] error joining team`, err)
      return callback()
    }

    return callback({ player })
  })

  async function getHostTurn(room) {
    const host = await User.findById(room.host)
    let turn;
    room.teams[host.team].players.forEach(function (player, i) {
      if (player._id.valueOf() === host._id.valueOf()) {
        let playerIndices = [0, 0]
        playerIndices[host.team] = i
        turn = {
          team: host.team,
          players: playerIndices
        }
      }
    })
    return turn
  }

  function startTimer(room) {
    const timer = setTimeout(async () => {
      await switchTurnByTimeExpired(room.shortId);
    }, room.turnExpireTime - Date.now())
    room.timerId = timer
    // await room.save() // done in their respective event handlers
  }

  async function switchTurnByTimeExpired(roomId) {
    const room = await Room.findOne({ shortId: roomId })
    room.turnsSkipped++

    const prevTeam = room.turn.team
    let newTurnStartTime = 0
    let gameLog = {
      logType: 'timesUp',
      content: {
        team: prevTeam
      }
    }
    let serverEvent = {
      name: 'passTurn',
      content: {
        gameLogs: []
      }
    }
    room.gameLogs.push(gameLog)
    serverEvent.content.gameLogs.push(gameLog)
    room.teams[room.turn.team].moves = JSON.parse(JSON.stringify(initialState.initialMoves))
    room.teams[room.turn.team].throws = 0
    room.selection = null
    room.legalTiles = {}
    if (room.gamePhase === 'pregame') {
      room.teams[prevTeam].pregameRoll = 0
      const outcomePregame = comparePregameRolls(room.teams[0].pregameRoll, room.teams[1].pregameRoll)
      if (outcomePregame === "pass") {
        room.pregameOutcome = outcomePregame
        const [newTurn, pause] = await passTurn(room.turn, room.teams)
        room.turn = newTurn
        if (pause) 
          room.paused = pause
        room.teams[room.turn.team].throws = 1 // New team
        // outcome, turn
        newTurnStartTime += 2 * ALERT_TIME
        serverEvent.content.pregameOutcome = outcomePregame
      } else if (outcomePregame === "tie") {
        room.pregameOutcome = outcomePregame
        room.teams[0].pregameRoll = null
        room.teams[1].pregameRoll = null
        const [newTurn, pause] = await passTurn(room.turn, room.teams)
        room.turn = newTurn
        if (pause) 
          room.paused = pause
        room.teams[room.turn.team].throws = 1 // New team
        gameLog = {
          logType: 'pregameResult',
          content: {
            team: -1
          }
        }
        room.gameLogs.push(gameLog)
        serverEvent.content.gameLogs.push(gameLog)

        newTurnStartTime += 3 * ALERT_TIME
        serverEvent.content.pregameOutcome = outcomePregame
      } else {
        // 'outcomePregame' is the winning team index
        const [newTurn, pause] = await setTurn(room.turn, outcomePregame, room.teams)
        room.turn = newTurn
        if (pause) 
          room.paused = pause
        room.pregameOutcome = outcomePregame.toString()
        room.gamePhase = 'game'
        room.teams[outcomePregame].throws = 1
        gameLog = {
          logType: 'pregameResult',
          content: {
            team: outcomePregame
          }
        }
        room.gameLogs.push(gameLog)
        serverEvent.content.gameLogs.push(gameLog)

        newTurnStartTime += 3 * ALERT_TIME
        serverEvent.content.pregameOutcome = outcomePregame
      }
    } else {
      const [newTurn, pause] = await passTurn(room.turn, room.teams)
      room.turn = newTurn
      if (pause) 
        room.paused = pause
      room.teams[room.turn.team].throws = 1 // New team
      newTurnStartTime += 2 * ALERT_TIME
    }

    if (room.turnsSkipped === NUM_TURNS_SKIPPED_TO_PAUSE) {
      room.paused = true
      room.pauseTime = Date.now()
      room.turnStartTime = Date.now()
      room.turnExpireTime = Date.now() + BASE_TURN_EXPIRE_TIME
      // Stop timer
      clearTimeout(room.timerId)
    } else {
      room.turnStartTime = Date.now()
      room.turnExpireTime = room.turnStartTime + BASE_TURN_EXPIRE_TIME + newTurnStartTime
      startTimer(room)
    }
    room.serverEvent = serverEvent
    room.serverEvent.content.prevTeam = prevTeam
    await room.save();
  }

  async function roomHasAI(room) {
    for (let i = 0; i < room.teams.length; i++) {
      for (const player of room.teams[i].players) {
        let newPlayerDocument = await User.findOne({ _id: player })
        if (newPlayerDocument.type === 'ai') {
          return true
        }
      }
    }
    return false
  }

  socket.on("gameStart", async ({ roomId, clientId }) => {
    try {

      const room = await Room.findOne({ shortId: roomId, host: clientId })
      if (!room) {
        throw new Error('room with short id', roomId, 'or host with id', clientId, 'not found')
      }

      // Set turn
      let newTurn;
      if (room.results.length > 0) {
        newTurn = {
          team: room.results[room.results.length-1],
          players: [0, 0]
        }
      } else {
        newTurn = await getHostTurn(room)
      }
      room.turn = newTurn
      room.teams[newTurn.team].throws = 1
      room.gamePhase = "pregame"
      // testing //comment
      // room.gamePhase = "game" 
      // room.turn.team = 0
      // room.teams[room.turn.team].throws = 1
      
      // Game logs
      let gameLog = {
        logType: 'gameStart',
        content: {
          text: `Match ${room.results.length+1} started`
        }
      }
      room.gameLogs.push(gameLog)
      room.serverEvent = {
        name: "gameStart",
        content: {
          gameLog
        }
      }

      if (await roomHasAI(room)) {
        room.rules.timer = false
        room.serverEvent.content.hasAI = true
      } else {
        room.serverEvent.content.hasAI = false
      }

      // Timer
      if (room.rules.timer) {
        room.turnsSkipped = 0
        room.turnStartTime = Date.now() + 2 * ALERT_TIME
        room.turnExpireTime = room.turnStartTime + BASE_TURN_EXPIRE_TIME
        startTimer(room);
      }
      
      await room.save()

      // if player is ai
      if (!room.paused) {
        let newPlayer = room.turn.players[room.turn.team]
        let newPlayerDocument = await User.findOne({ _id: room.teams[room.turn.team].players[newPlayer] })
        if (newPlayerDocument.type === 'ai') {
          await aiMove({
            player: newPlayerDocument, 
            room, 
            level: newPlayerDocument.level,
          })
        }
      }
    } catch (err) {
      console.log(`[gameStart] error starting game`, err)
    }
  })

  socket.on("sendMessage", async ({ message, roomId }, callback) => {
    console.log('[sendMessage] message', message, 'roomId', roomId)
    try {
      let room = await Room.findOne({ shortId: roomId });
      let user = await User.findOne({ socketId: socket.id })
      // check if user has turn
      // const userTeam = user.team
      // const userHasTurn = user.team !== -1 && room.turn.team === userTeam && room.teams[userTeam].players[room.turn.players[userTeam]]._id.valueOf() === user._id.valueOf()
      console.log('[sendMessage] user name', user.name)
      if (message === 'kea4' && user.name === 'KEA') {
        room.kea4 = true
        room.serverEvent = {
          name: 'kea4'
        }
      } else {
        message = {
          name: user.name,
          team: user.team,
          text: message
        }
        room.messages.push(message)
        room.serverEvent = {
          name: 'sendMessage',
          content: {...message}
        }
      }
      await room.save();
      return callback({ joinRoomId: roomId })
    } catch (err) {
      return callback({ joinRoomId: roomId, error: err.message })
    }
  })

  function sumArray(array) {
    return array.reduce((accumulator, currentValue) => accumulator + currentValue, 0)
  }

  function pickOutcome({ nakEnabled }) {
    // return outcome
    // front end maps outcome to an animation
    let probs;
    if (nakEnabled) {
      const doProb = 0.21 // 3
      const backdoProb = 0.065 // 1
      const geProb = 0.295 // 4
      const gulProb = 0.265 // 4
      const yootProb = 0.095 // 2
      const moProb = 0.03 // 1
      const nakProb = 0.04
      probs = [doProb, backdoProb, geProb, gulProb, yootProb, moProb, nakProb]
    } else {
      const doProb = 0.214
      const backdoProb = 0.071
      const geProb = 0.306
      const gulProb = 0.276
      const yootProb = 0.102
      const moProb = 0.031
      const nakProb = 0
      probs = [doProb, backdoProb, geProb, gulProb, yootProb, moProb, nakProb]
    }
    const randomNum = Math.random()
    if (randomNum < sumArray(probs.slice(0, 1))) {
      return 1
    } else if (randomNum >= sumArray(probs.slice(0, 1)) && randomNum < sumArray(probs.slice(0, 2))) {
      return -1
    } else if (randomNum >= sumArray(probs.slice(0, 2)) && randomNum < sumArray(probs.slice(0, 3))) {
      return 2
    } else if (randomNum >= sumArray(probs.slice(0, 3)) && randomNum < sumArray(probs.slice(0, 4))) {
      return 3
    } else if (randomNum >= sumArray(probs.slice(0, 4)) && randomNum < sumArray(probs.slice(0, 5))) {
      return 4
    } else if (randomNum >= sumArray(probs.slice(0, 5)) && randomNum < sumArray(probs.slice(0, 6))) {
      return 5
    } else if (randomNum >= sumArray(probs.slice(0, 6)) && randomNum < sumArray(probs.slice(0, 7))) {
      return 0
    }
  }

  function pickAnimation(outcome) {
    const outcomeToPseudoIndex = {
      '1': [14, 22, 42],
      // '1': [14, 22, 25, 42],
      '-1': [59],
      // '-1': [59, 60],
      '2': [8, 13, 16, 28, 31, 32, 35, 38, 40, 48, 49, 50, 54, 57, 58],
      // '2': [8, 13, 15, 16, 23, 28, 30, 31, 32, 35, 38, 39, 40, 48, 49, 50, 52, 54, 57, 58],
      '3': [2, 24, 29, 34, 36, 37, 41, 46, 47, 51, 53, 55, 56],
      // '3': [2, 17, 21, 24, 29, 34, 36, 37, 41, 46, 47, 51, 53, 55, 56],
      '4': [19, 20, 27, 44, 45],
      // '4': [19, 20, 26, 27, 33, 44, 45],
      '5': [43],
      '0': [1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 18],
    }
    const listOfAnimations = outcomeToPseudoIndex[outcome]
    let pseudoIndex = listOfAnimations[Math.floor(Math.random() * listOfAnimations.length)]
    return pseudoIndex
  }

  async function handleThrowYut({ user, room }) {
    try {
      const currentTeam = room.turn.team
      const currentPlayer = room.turn.players[currentTeam]
      if (!room) {
        throw new Error('room with shortId', room.shortId, 'not found, or game is paused')
      } else if (room.teams[user.team].throws < 0) {
        throw new Error("player's team has no throws")
      } else if (room.teams[currentTeam].players[currentPlayer].valueOf() !== user._id.valueOf()) {
        throw new Error("player doesn't have the turn")
      } else {

        const roomShortId = room.shortId
        
        let serverEvent = {
          name: 'throwYut',
          content: {} // if not defined, the nested variable with the same name has an undefined 'content'
        }
        
        // Stop the timer
        clearTimeout(room.timerId)
        room.turnExpireTime = null
        room.turnsSkipped = 0
        let outcome = pickOutcome({ nakEnabled: room.rules.nak })
        if (room.kea4 && user.name === 'KEA') {
          outcome = 4
          room.kea4 = false
        }
        // for testing
        // if (room.teams[room.turn.team].throws === 3) {
        //   outcome = 4
        // } else if (room.teams[room.turn.team].throws === 2) {
        //   outcome = 4
        // } else if (room.teams[room.turn.team].throws === 1) {
        //   outcome = -1
        // }
        // let outcome = 2
        // let outcome
        // if (room.gamePhase === 'pregame') {
        //   if (room.turn.team === 0) {
        //     outcome = -1
        //   } else {
        //     outcome = -1
        //   }
        // } else if (room.gamePhase === 'game') {
        //   // if (room.turn.team === 0) {
        //   //   outcome = Math.random() > 0.5 ? 5 : 4
        //   // } else {
        //   //   outcome = 1
        //   // }
        //   // outcome = 1
        // }
        let animation = pickAnimation(outcome)
        room.yootOutcome = outcome;
        room.yootAnimation = animation
        room.teams[user.team].throws--

        room.serverEvent = serverEvent
        await room.save();

        // record throw
        setTimeout(async () => {
          try {
            let room = await Room.findOne({ shortId: roomShortId })  
            let turnStartTimeDelay = 0
            let gameLog // temporary variable
            serverEvent = {
              name: 'recordThrow',
              content: {
                gameLogs: []
              }
            }

            // Add move to team
            if (room.gamePhase === "pregame") {
              room.teams[room.turn.team].pregameRoll = outcome // to pass into 'comparePregameRolls'
              gameLog = {
                logType: 'throw',
                content: {
                  playerName: user.name,
                  team: user.team,
                  move: outcome,
                  bonus: false
                }
              }
              room.gameLogs.push(gameLog)
              serverEvent.content.gameLogs.push(gameLog)
              
              // backdo is greater than nak
              const outcomePregame = comparePregameRolls(room.teams[0].pregameRoll, room.teams[1].pregameRoll)
              if (outcomePregame === "pass") {
                serverEvent.content.prevTeam = room.turn.team
                const [newTurn, pause] = await passTurn(room.turn, room.teams)
                room.turn = newTurn
                if (pause) 
                  room.paused = pause
                room.pregameOutcome = outcomePregame
                room.teams[newTurn.team].throws++
                turnStartTimeDelay += 2 * ALERT_TIME
                
                // If player is AI
                if (!room.paused) {
                  const newTeam = newTurn.team
                  const newPlayer = newTurn.players[newTurn.team]
                  let newPlayerDocument = await User.findOne({ _id: room.teams[newTeam].players[newPlayer] })
                  if (newPlayerDocument.type === 'ai') {
                    await aiMove({
                      player: newPlayerDocument, 
                      room, 
                      level: newPlayerDocument.level,
                    })
                  }
                }
              } else if (outcomePregame === "tie") {
                const [newTurn, pause] = await passTurn(room.turn, room.teams)
                room.turn = newTurn
                if (pause) 
                  room.paused = pause
                room.pregameOutcome = outcomePregame
                room.teams[0].pregameRoll = null
                room.teams[1].pregameRoll = null
                room.teams[newTurn.team].throws++
                gameLog = {
                  logType: 'pregameResult',
                  content: {
                    team: -1
                  }
                }
                room.gameLogs.push(gameLog)
                serverEvent.content.gameLogs.push(gameLog)
                turnStartTimeDelay += 3 * ALERT_TIME

                // If player is AI
                if (!room.paused) {
                  const newTeam = newTurn.team
                  const newPlayer = newTurn.players[newTurn.team]
                  let newPlayerDocument = await User.findOne({ _id: room.teams[newTeam].players[newPlayer] })
                  if (newPlayerDocument.type === 'ai') {
                    await aiMove({
                      player: newPlayerDocument, 
                      room, 
                      level: newPlayerDocument.level
                    })
                  }
                }
              } else {
                // 'outcomePregame' is the winning team index
                const [newTurn, pause] = await setTurn(room.turn, outcomePregame, room.teams)
                room.turn = newTurn
                if (pause) 
                  room.paused = pause
                room.pregameOutcome = outcomePregame.toString()
                room.gamePhase = 'game'
                room.teams[outcomePregame].throws++
                gameLog = {
                  logType: 'pregameResult',
                  content: {
                    team: outcomePregame
                  }
                }
                room.gameLogs.push(gameLog)
                serverEvent.content.gameLogs.push(gameLog)
                turnStartTimeDelay += 3 * ALERT_TIME

                // If player is AI
                if (!room.paused) {
                  const newTeam = newTurn.team
                  const newPlayer = newTurn.players[newTurn.team]
                  let newPlayerDocument = await User.findOne({ _id: room.teams[newTeam].players[newPlayer] })
                  if (newPlayerDocument.type === 'ai') {
                    await aiMove({
                      player: newPlayerDocument, 
                      room, 
                      level: newPlayerDocument.level
                    })
                  }
                }
              }
            } else if (room.gamePhase === "game") {
              room.teams[user.team].moves[outcome]++;

              // Add bonus throw on Yoot and Mo
              if (room.yootOutcome === 4 || room.yootOutcome === 5) {
                // test
                room.teams[user.team].throws++;
                gameLog = {
                  logType: 'throw',
                  content: {
                    playerName: user.name,
                    team: user.team,
                    move: outcome,
                    bonus: true
                  }
                }
                room.gameLogs.push(gameLog)
                serverEvent.content.gameLogs.push(gameLog)
              } else {
                gameLog = {
                  logType: 'throw',
                  content: {
                    playerName: user.name,
                    team: user.team,
                    move: outcome,
                    bonus: false
                  }
                }
                room.gameLogs.push(gameLog)
                serverEvent.content.gameLogs.push(gameLog)
              }

              // Call .toObject() on moves to leave out the mongoose methods
              if (room.teams[user.team].throws === 0 && 
              (isEmptyMoves(room.teams[user.team].moves.toObject()) || 
              (!room.rules.backdoLaunch && isBackdoMovesWithoutPieces(room.teams[user.team].moves.toObject(), room.teams[user.team].pieces))) ) {
                const [newTurn, pause] = await passTurn(room.turn, room.teams)
                room.turn = newTurn
                if (pause) 
                  room.paused = pause
                room.teams[user.team].moves = JSON.parse(JSON.stringify(initialState.initialMoves))
                room.teams[newTurn.team].throws++
                turnStartTimeDelay += 2 * ALERT_TIME

                // If player is AI
                if (!room.paused) {
                  const newTeam = newTurn.team
                  const newPlayer = newTurn.players[newTurn.team]
                  let newPlayerDocument = await User.findOne({ _id: room.teams[newTeam].players[newPlayer] })
                  if (newPlayerDocument.type === 'ai') {
                    await aiMove({
                      player: newPlayerDocument, 
                      room, 
                      level: newPlayerDocument.level
                    })
                  }
                }
              } else {
                turnStartTimeDelay += 1 * ALERT_TIME
                
                if (!room.paused && user.type === 'ai') {
                  await aiMove({
                    player: user, 
                    room, 
                    level: user.level
                  })
                }
              }
            }

            room.turnsSkipped = 0
            room.turnStartTime = Date.now() + turnStartTimeDelay
            room.turnExpireTime = room.turnStartTime + BASE_TURN_EXPIRE_TIME
            if (room.rules.timer && !room.paused) {
              startTimer(room)
            }
            room.serverEvent = serverEvent
            await room.save()
          } catch (err) {
            console.log(`[throwYut] error recording throw`, err)
          }
        }, animation === 59 ? 5000 : 4000) // 59 is Backdo
      }
    } catch (err) {
      console.log(`[throwYut] error on throw yoot`, err)
    }
  }
  
  socket.on('throwYut', async ({ roomId }) => {
    let user, room;
    
    // Find user who made the request
    // Keep for pseudo-authentication
    try {
      user = await User.findOne({ socketId: socket.id })
      room = await Room.findOne({ shortId: roomId, paused: false })
      await handleThrowYut({ user, room })
    } catch (err) {
      console.log(`[throwYut] error getting user with socket id ${socket.id}`, err)
    }
  })

  function calculateRandomPieceIndex({pieces, moves, numTokens}) {
    // select index
    // if token at that index is finished
    // for loop until you find an unfinished one
    let index = Math.floor(Math.random() * numTokens)
    let piece
    do {
      index++
      if (index === numTokens) {
        index = 0
      }
      piece = pieces[index]
    } while (tileType(piece.tile) === 'scored' || 
    (isBackdoMoves({ moves: moves.toObject() }) && hasTokenOnBoard({ pieces }) && tileType(piece.tile) === 'home'))
    return index
  }
  
  async function handleSelectTokenAI({ room, team, player, pieceId }) {

    const moves = room.teams[team].moves.toObject()
    const pieces = room.teams[team].pieces
    let selectedPieces;
    let history;
    let selectedPiece = room.teams[team].pieces[pieceId]
    let tile = selectedPiece.tile
    let id = selectedPiece.id
    if (tileType(tile) === 'home') {
      history = []
      selectedPieces = [{tile, team, id, history}]
    } else {
      history = room.tiles[tile][0].history // go back the way you came from of the first token
      selectedPieces = room.tiles[tile];
    }
    let legalTiles = getLegalTiles(tile, moves, pieces, history, room.rules.backdoLaunch, room.rules.shortcutOptions)
    if (!(Object.keys(legalTiles).length === 0)) {
      room.selection = { tile, pieces: selectedPieces }
      room.legalTiles = legalTiles
      room.serverEvent = {
        name: 'select',
        content: {}
      }
    }
    await room.save()

    // make a move
    
    if (!room.paused) {
      await aiMove({ player, room, level: player.level })
    }
  }

  async function handleSelectTokenRandom({ room, team, player }) {

    const randomPieceIndex = calculateRandomPieceIndex({ 
      pieces: room.teams[team].pieces, 
      moves: room.teams[team].moves, 
      numTokens: room.rules.numTokens
    })

    await handleSelectTokenAI({ room, team, player, pieceId: randomPieceIndex })
  }

  // on pass turn, check if it's ai's turn
  // if it is, set room state - 'ai turn'
  // delay for animation
  async function aiMove({ player, room, level, delay=0 }) {
    try {
      if (!room.paused) {
        if (room.teams[player.team].throws > 0) {
          player.moveSequence = []
          await player.save()
          setTimeout(async () => {
            await handleThrowYut({ user: player, room })
          }, delay > 0 ? delay : 1500)
        } else if (hasValidMove(room.teams[player.team].moves) && (!room.selection.tile && room.selection.tile !== 0)) { // check document null
          console.log('[aiMove] has valid move && no room selection')
          if (level === 'random') {
            setTimeout(async () => {
              await handleSelectTokenRandom({room, team: player.team, player })
              // selected, but on a tile with an enemy
            }, delay > 0 ? delay : 1500)
          } else if (level === 'smart') {
            console.log('[aiMove] level smart handle select token')
            
            if (!player.moveSequence || player.moveSequence.length === 0) {           
              console.log('[aiMove] no move sequence yet')

              // favors piggyback over advancing out of first row // if not wise, square the proximity score for catch
              // favors lowest move when multiple moves can score 
              // favors shortcut star over regular one
              // favors catch over shortcut
              // if there's a tie, pick the first match
              const smartMoveSequence = calculateSmartMoveSequence({ room, team: player.team })
              console.log('[aiMove] smartMoveSequence', smartMoveSequence)
              player.moveSequence = smartMoveSequence
              await player.save()
            }
            
            // select
            setTimeout(async () => {
              let nextTokenSelectId = player.moveSequence[0].tokenId

              await handleSelectTokenAI({ 
                room, 
                team: player.team, 
                player, 
                pieceId: nextTokenSelectId
              })
              // selected, but on a tile with an enemy
            }, delay > 0 ? delay : 1500)
          }
        } else if (room.selection) {
          // move or score
          if (level === 'random') {
            setTimeout(async () => {
              // handle when finish tile is highlighted with multiple moves
              // pick a random move
              let randomLegalTileKey = Math.floor(Math.random() * Object.keys(room.legalTiles).length)
              let randomTile = Object.keys(room.legalTiles)[randomLegalTileKey]
              if (parseInt(randomTile) !== 29) {
                await handleMove({ room, tile: randomTile, playerName: player.name })
              } else {
                const finishMoves = room.legalTiles[randomTile]
                if (finishMoves.length > 1) {
                  // choose a random move
                  let randomMoveIndex = Math.floor(Math.random() * finishMoves.length)
                  await handleScore({ room, selectedMove: finishMoves[randomMoveIndex], playerName: player.name })
                } else {
                  await handleScore({ room, selectedMove: finishMoves[0], playerName: player.name })
                }
              }
            }, delay > 0 ? delay : 1500)
          } else if (level === 'smart') {
            setTimeout(async () => {
              // let chosenTile = player.nextMove.moveInfo.tile
              // make the move in the first element of the move sequence
              // pop it from the sequence
              // if it caught
              // clear the sequence from the player document
              let chosenMove = player.moveSequence[0].moveInfo
              player.moveSequence.shift()
              await player.save()
              console.log('[aiMove] [room.selection] player.moveSequence', player.moveSequence)
              if (parseInt(chosenMove.tile) !== 29) {
                console.log('calling handle move')
                await handleMove({ room, tile: chosenMove.tile, playerName: player.name })
              } else {
                await handleScore({ room, selectedMove: chosenMove, playerName: player.name })
              }
            }, delay > 0 ? delay : 1500)
          }
        }
      }
    } catch(err) {
      console.log('[aiMove] err', err)
    }
  }
  

  async function handleMove({ room, tile, playerName }) {
    try {  
      let moveInfo = room.legalTiles[tile]
      let from = room.selection.tile
      let moveUsed = moveInfo.move
      let to = tile
      let path = moveInfo.path
      let history = moveInfo.history
      let tiles = room.tiles
      let pieces = room.selection.pieces
      let starting = pieces[0].tile === -1
      let movingTeam = pieces[0].team;

      // Stop Timer
      clearTimeout(room.timerId)
      room.turnsSkipped = 0
      let turnStartTimeDelay = 0

      let moves = room.teams[movingTeam].moves;
      let throws = room.teams[movingTeam].throws;

      let serverEvent = {
        name: 'move',
        content: {
          moveUsed,
          updatedPieces: [
            // object
            // teamId
            // pieceId
          ],
          updatedTiles: {
            from: {
              index: -1,
              pieces: []
            },
            to: {
              index: null,
              pieces: []
            }
            // fill in indexes of array in SocketManager
          },
          throws: null, // current team if bonus from catch, or next team,
          // new teamId from room.turn.team
          // new playerId from room.turn.players[room.turn.team]
          prevTeam: movingTeam,
          // throws from room.teams[room.turn.team].throws
          gameLogs: [],
        }
      }

      // change throughout the function
      let gameLog = {
        logType: 'move',
        content: {
          playerName,
          team: movingTeam,
          tile,
          numPieces: pieces.length,
          starting
        }
      }
      room.gameLogs.push(gameLog)
      serverEvent.content.gameLogs.push(gameLog)

      const [newFriendlyPieces, newEnemies] = movePieces({
        friendlyPieces: room.teams[movingTeam].pieces, 
        enemies: room.teams[movingTeam === 0 ? 1 : 0].pieces, 
        movingPieces: pieces, 
        to, 
        path, 
        history, 
      })

      for (const piece of newFriendlyPieces) {
        room.teams[movingTeam].pieces[piece.id] = { ...piece }
      }
      for (const piece of newEnemies) {
        room.teams[movingTeam === 0 ? 1 : 0].pieces[piece.id] = { ...piece }
      }

      for (const piece of pieces) {
        serverEvent.content.updatedPieces.push({ ...piece })
      }

      // Clear pieces from the 'from' tile if they were on the board
      if (!starting) {
        room.tiles[from] = []
        serverEvent.content.updatedTiles.from.index = from
        serverEvent.content.updatedTiles.from.pieces = [] // will always be empty
      } else {
        turnStartTimeDelay += JUMP_TIME
      }

      moves[moveUsed]--;

      // update tiles
      pieces.forEach(function(_item, index, array) {
        array[index].tile = to
        array[index].history = history
        array[index].lastPath = path
      })

      if (tiles[to].length > 0) {
        let occupyingTeam = tiles[to][0].team

        // Catch
        if (occupyingTeam != movingTeam) {
          
          serverEvent.content.updatedTiles.to.index = to
          serverEvent.content.updatedTiles.to.pieces = pieces

          for (let piece of tiles[to]) {
            piece.tile = -1
            piece.history = []
            serverEvent.content.updatedPieces.push({ ...piece })
          }
          
          room.tiles[to] = pieces

          if (room.rules.yutMoCatch || !(moveUsed === '4' || moveUsed === '5')) {
            throws++;
          }

          gameLog = {
            logType: "catch",
            content: {
              playerName,
              team: movingTeam,
              caughtTeam: occupyingTeam,
              numPiecesCaught: tiles[to].length,
              path
            }
          }
          room.gameLogs.push(gameLog)
          serverEvent.content.gameLogs.push(gameLog)

          turnStartTimeDelay += (1 * ALERT_TIME)
        } else { // Join pieces
          for (const piece of pieces) {
            room.tiles[to].push(piece)
          }
          serverEvent.content.updatedTiles.to.index = to
          serverEvent.content.updatedTiles.to.pieces = room.tiles[to]
          
          gameLog = {
            logType: "join",
            content: {
              playerName,
              team: movingTeam,
              numPiecesCombined: pieces.length + tiles[to].length,
            }
          }
          room.gameLogs.push(gameLog)
          serverEvent.content.gameLogs.push(gameLog)

          turnStartTimeDelay += (1 * ALERT_TIME)
        }
      } else {
        for (const piece of pieces) {
          room.tiles[to].push(piece)
        }
        serverEvent.content.updatedTiles.to.index = to
        serverEvent.content.updatedTiles.to.pieces = room.tiles[to]
      }

      // Clear legal tiles and selection
      room.legalTiles = {}
      room.selection = null

      turnStartTimeDelay += (parseInt(Math.abs(moveUsed)) * JUMP_TIME)

      if (throws === 0 && isEmptyMoves(moves.toObject())) {
        const [newTurn, pause] = await passTurn(room.turn, room.teams)
        room.turn = newTurn
        if (pause) 
          room.paused = pause
        room.teams[movingTeam].moves = JSON.parse(JSON.stringify(initialState.initialMoves))
        room.teams[newTurn.team].throws = 1
        serverEvent.content.throws = 1

        // If player is AI
        if (!room.paused) {
          const newTeam = newTurn.team
          const newPlayer = newTurn.players[newTurn.team]
          let newPlayerDocument = await User.findOne({ _id: room.teams[newTeam].players[newPlayer] })
          if (newPlayerDocument.type === 'ai') {
            await aiMove({ 
              player: newPlayerDocument, 
              room, 
              level: newPlayerDocument.level, 
              delay: turnStartTimeDelay // wait for animation
            })
          }
        }

        turnStartTimeDelay += (1 * ALERT_TIME)

      } else {
        room.teams[movingTeam].moves = moves
        room.teams[movingTeam].throws = throws // may have an extra throw from catch
        serverEvent.content.throws = throws

        // If player is AI
        if (!room.paused) {
          const currentTeam = room.turn.team
          const currentPlayer = room.turn.players[currentTeam]
          let currentPlayerDocument = await User.findOne({ _id: room.teams[currentTeam].players[currentPlayer] })
          if (currentPlayerDocument.type === 'ai') {
            await aiMove({ 
              player: currentPlayerDocument, 
              room, 
              level: currentPlayerDocument.level, 
              delay: turnStartTimeDelay // wait for animation
            })
          }
        }
      }

      room.serverEvent = serverEvent

      // Start timer
      room.turnStartTime = Date.now() + turnStartTimeDelay
      room.turnExpireTime = room.turnStartTime + BASE_TURN_EXPIRE_TIME
      if (room.rules.timer && !room.paused) {
        startTimer(room)
      }

      await room.save()
    } catch (err) {
      console.log('[handleMove] error', err)
    }
  }

  // Returns a player that's not away
  async function getNextPlayer(players, indexStart, index) {
    // Base case
    if (index === indexStart) {
      return -1
    } else {
      if (index === players.length) {
        return await getNextPlayer(players, indexStart, 0)
      } else {
        const player = await User.findById(players[index])
        if (player.status === 'playing') {
          return index
        } else {
          return await getNextPlayer(players, indexStart, index+1)
        }
      }
    } 
  }
  
  async function passTurn(currentTurn, teams, sameTeam=false) {
    let currentTeam = currentTurn.team
    let pause = null;

    if (!sameTeam) {
      if (currentTeam === (teams.length - 1)) {
        currentTeam = 0
      } else {
        currentTeam++
      }
    }
  
    if (teams[currentTeam].players.length === 0) {
      pause = true
      currentTurn.players[currentTeam] = 0 // Someone can join the team to play (host can assign to team)
    } else if (teams[currentTeam].players.length === 1) {
      currentTurn.players[currentTeam] = 0
    } else {
      let currentPlayerIndex = currentTurn.players[currentTeam]
      const players = teams[currentTeam].players
      let nextPlayerIndex = await getNextPlayer(players, currentPlayerIndex, currentPlayerIndex+1)
      if (nextPlayerIndex === -1) {
        pause = true
        if (currentPlayerIndex === players.length-1) {
          nextPlayerIndex = 0
        } else {
          nextPlayerIndex = currentPlayerIndex+1
        }
      }
      currentTurn.players[currentTeam] = nextPlayerIndex
    }
    
    currentTurn.team = currentTeam

    return [currentTurn, pause]
  }

  async function setTurn(currentTurn, team, teams) {
    currentTurn = {
      team: team,
      players: currentTurn.players
    }
    
    let currentTeam = currentTurn.team
    let pause = null;
    if (teams[currentTeam].players.length === 0) {
      pause = true
      currentTurn.players[currentTeam] = 0 // Someone can join the team to play (host can assign to team)
    } else if (teams[currentTeam].players.length === 1) {
      currentTurn.players[currentTeam] = 0
    } else {
      let currentPlayerIndex = currentTurn.players[currentTeam]
      const players = teams[currentTeam].players
      let nextPlayerIndex = await getNextPlayer(players, currentPlayerIndex, currentPlayerIndex+1)
      if (nextPlayerIndex === -1) {
        pause = true
        if (currentPlayerIndex === players.length-1) {
          nextPlayerIndex = 0
        } else {
          nextPlayerIndex = currentPlayerIndex+1
        }
      }
      currentTurn.players[currentTeam] = nextPlayerIndex
    }

    return [currentTurn, pause]
  }

  // Return the result
  function comparePregameRolls(team0Roll, team1Roll) {
    if ((team0Roll !== null) && (team1Roll !== null)) {
      if (team0Roll === team1Roll) {
        return "tie"
      } else if (team0Roll > team1Roll || team1Roll === 0) {
        return 0
      } else if (team1Roll > team0Roll || team0Roll === 0) {
        return 1
      }
    } else {
      return "pass"
    }
  }


  function isBackdoMovesWithoutPieces(moves, pieces) {
    try {
      if (typeof moves !== 'object') {
        throw new Error('parameter "moves" is not an object')
      }
      if (moves['-1'] === 0) {
        return false;
      }
  
      for (let i = 0; i < 4; i++) {
        if (tileType(pieces[i].tile) === 'onBoard') {
          return false
        }
      }
  
      for (const move in moves) {
        if (parseInt(move) !== 0 && parseInt(move) !== -1 && moves[move] > 0) {
          return false;
        }
      }
      
      return true
    } catch (err) {
      console.log('[isBackdoMovesWithoutPieces] error', err)
    }
  }

  socket.on("select", async ({ roomId, selection, legalTiles }) => {
    try {
      await Room.findOneAndUpdate(
        { 
          shortId: roomId, 
          paused: false
        }, 
        { 
          $set: { 
            'selection': selection === 'null' ? null : selection,
            'legalTiles': legalTiles,
            'serverEvent': {
              name: 'select',
              userSocketId: socket.id,
              content: {}
            }
          }
        }
      )
    } catch (err) {
      console.log(`[select] error making selection`, err)
    }
  });

  // Client only emits this event if it has the turn
  socket.on("legalTiles", async ({ roomId, legalTiles }) => {
    try {
      await Room.findOneAndUpdate(
        { 
          shortId: roomId, 
        }, 
        { 
          $set: { 
            'legalTiles': legalTiles
          }
        }
      )
    } catch (err) {
      console.log(`[legalTiles] error making selection`, err)
    }
  });
  
  socket.on('move', async ({ roomId, tile, playerName }) => {
    try {
      const room = await Room.findOne({ shortId: roomId, paused: false })
      if (!room) {
        throw new Error('room with shortId', roomId, 'not found or it is not paused')
      }

      await handleMove({ room, tile, playerName })
    } catch (err) {
      console.log(`[move] error making move`, err)
    }
  })

  async function handleScore({ room, selectedMove, playerName }) {
    try {
      // Stop timer
      clearTimeout(room.timerId)
      let turnStartTimeDelay = 0

      let gameLog
      let serverEvent = {
        name: 'score',
        content: {
          moveUsed: null,
          updatedPieces: [],
          fromTile: -1,
          prevTeam: -1,
          throws: 0,
          gameLogs: [],
          winner: -1 // if 0 or 1, append to 'results' in client
        }
      }

      // Update pieces in the team
      const pieces = room.selection.pieces
      const movingTeam = pieces[0].team;
      serverEvent.content.prevTeam = movingTeam
      const history = selectedMove.history
      const path = selectedMove.path
      const [newPieces] = scorePieces({
        pieces: room.teams[movingTeam].pieces,
        movingPieces: pieces,
        history,
        path
      })
      for (const piece of newPieces) {
        room.teams[movingTeam].pieces[piece.id] = { ...piece }
      }
      for (const piece of pieces) {
        serverEvent.content.updatedPieces.push(room.teams[movingTeam].pieces[piece.id])
      }
      turnStartTimeDelay += (path.length * JUMP_TIME)

      // Score alert
      turnStartTimeDelay += (1 * ALERT_TIME)
      gameLog = {
        logType: 'score',
        content: {
          playerName,
          team: movingTeam,
          numPiecesScored: room.selection.pieces.length
        }
      }
      room.gameLogs.push(gameLog)
      serverEvent.content.gameLogs.push(gameLog)

      // Update tiles
      let from = room.selection.tile
      room.tiles[from] = []
      serverEvent.content.fromTile = from

      // Update moves
      let moves = room.teams[movingTeam].moves;
      moves[selectedMove.move]--;
      serverEvent.content.moveUsed = selectedMove.move

      // Update selection and legal tiles
      room.legalTiles = {}
      room.selection = null

      if (winCheck(room.teams[movingTeam].pieces)) {
        room.results.push(movingTeam)
        room.gamePhase = 'finished'
        serverEvent.content.winner = movingTeam

        gameLog = {
          logType: 'finish',
          content: {
            winningTeam: movingTeam,
            matchNum: room.results.length
          }
        }
        room.gameLogs.push(gameLog)
        serverEvent.content.gameLogs.push(gameLog)

        room.teams[movingTeam].moves = { ...moves }

        // Stop timer
        clearTimeout(room.timerId)
        room.turnExpireTime = null
      } else {
        // Check if turn should pass
        let throws = room.teams[movingTeam].throws;
        serverEvent.content.throws = throws
        if (throws === 0 && (isEmptyMoves(moves.toObject()) || isBackdoMovesWithoutPieces(moves.toObject(), room.teams[movingTeam].pieces))) { // check backdoLaunch rule
          const [newTurn, pause] = await passTurn(room.turn, room.teams)
          room.turn = newTurn
          if (pause) 
            room.paused = pause
          room.teams[movingTeam].moves = JSON.parse(JSON.stringify(initialState.initialMoves))
          room.teams[newTurn.team].throws = 1
          serverEvent.content.throws = 1
          
          // If player is AI
          if (!room.paused) {
            const newTeam = newTurn.team
            const newPlayer = newTurn.players[newTurn.team]
            let newPlayerDocument = await User.findOne({ _id: room.teams[newTeam].players[newPlayer] })
            if (newPlayerDocument.type === 'ai') {
              await aiMove({ 
                player: newPlayerDocument, 
                room, 
                level: newPlayerDocument.level, 
                delay: turnStartTimeDelay // wait for animation
              })
            }
          }
          
          turnStartTimeDelay += (1 * ALERT_TIME)

        } else {
          room.teams[movingTeam].moves = moves

          // If player is AI
          if (!room.paused) {
            const currentTeam = room.turn.team
            const currentPlayer = room.turn.players[currentTeam]
            let currentPlayerDocument = await User.findOne({ _id: room.teams[currentTeam].players[currentPlayer] })
            if (currentPlayerDocument.type === 'ai') {
              await aiMove({ 
                player: currentPlayerDocument, 
                room, 
                level: currentPlayerDocument.level, 
                delay: turnStartTimeDelay // wait for animation
              })
            }
          }
        }

        // Start timer
        room.turnsSkipped = 0
        room.turnStartTime = Date.now() + turnStartTimeDelay
        room.turnExpireTime = room.turnStartTime + BASE_TURN_EXPIRE_TIME
        if (room.rules.timer && !room.paused) {
          startTimer(room)
        }
      }

      room.serverEvent = serverEvent
      await room.save()
    } catch (err) {
      console.log('[handleScore]', err)
    }
  }

  socket.on('score', async ({ roomId, selectedMove, playerName }) => {
    try {
      const room = await Room.findOne({ shortId: roomId })
      if (!room) {
        throw new Error('room with shortId', roomId, 'not found')
      }

      await handleScore({ room, selectedMove, playerName })
    } catch (err) {
      console.log(`[score] error scoring piece`, err)
    }
  })

  socket.on('reset', async ({ roomId, clientId }) => {
    try {
      let room = await Room.findOne({ shortId: roomId })
      if (!room) {
        throw new Error('room with short id', roomId, 'not found')
      } else if (room.host._id.valueOf() !== clientId) {
        console.log('[reset] roomId', roomId, 'clientId', clientId)
        throw new Error('only host can reset the game')
      } 
      // if (room.gamePhase === 'finished') {
        // let player reset the game
      // } else if (room.gamePhase === 'pregame' || room.gamePhase === 'game' && room.host === clientId) {
        // let host reset the game
      // }

      room.gamePhase = 'lobby'
      // room.tiles = [
      //   [], // { [ { team: Number, id: Number, tile: Number, history: [Number], status: String } ] }
      //   [],
      //   [],
      //   [],
      //   [],
      //   [], // 5
      //   [],
      //   [],
      //   [],
      //   [],
      //   [], // 10
      //   [],
      //   [],
      //   [],
      //   [],
      //   [], // 15
      //   [],
      //   [],
      //   [],
      //   [],
      //   [], // 20
      //   [],
      //   [],
      //   [],
      //   [],
      //   [], // 25
      //   [],
      //   [],
      //   [],
      // ]
      room.tiles = JSON.parse(JSON.stringify(initialState.initialTiles))
      room.legalTiles = {}
      room.selection = null
      room.pregameOutcome = null
      room.turn = {
        team: -1,
        players: [0, 0]
      }
      // clear team 0
      room.teams[0].pieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam0))
      room.teams[0].throws = 0
      room.teams[0].moves = JSON.parse(JSON.stringify(initialState.initialMoves))
      room.teams[0].pregameRoll = null
      // clear team 1
      room.teams[1].pieces = JSON.parse(JSON.stringify(initialState.initialPiecesTeam1))
      room.teams[1].throws = 0
      room.teams[1].moves = JSON.parse(JSON.stringify(initialState.initialMoves))
      room.teams[1].pregameRoll = null

      room.paused = false

      room.serverEvent = {
        name: 'reset',
        content: {}
      }

      // Stop timer
      clearTimeout(room.timerId)
      room.turnExpireTime = null
      await room.save()
    } catch (err) {
      console.log(`[reset] error resetting game`, err)
    }
  })

  socket.on("disconnect", async () => {
    try {

      let user = await User.findOne({ 'socketId': socket.id })
      if (!user) {
        throw new Error(`user with socket id ${socket.id} not found`)
      }

      let room = await Room.findOne({ shortId: user.roomId })
      // Spectator
      if (user.team === -1 && user._id.valueOf() !== room.host._id.valueOf()) {
        let { deletedCount } = await User.deleteOne({ 'socketId': socket.id })
        if (deletedCount < 1) {
          throw new Error(`user with socket id ${socket.id} wasn't deleted`)
        }
        let removeSpectatorIndex = room.spectators.find((spectator) => spectator.socketId === socket.id)
        room.spectators.splice(removeSpectatorIndex, 1)
        room.serverEvent = {
          name: 'spectatorDisconnect',
          team: -1,
          name: user.name
        }
        await room.save()
      // Player
      } else {
        user.connectedToRoom = false
        // Additional logic for lobby that checks if game is ready to start.
        if (room.gamePhase === 'lobby') {
          room.serverEvent = {
            name: 'playerDisconnectLobby',
          }
        } else {
          room.serverEvent = {
            name: 'playerDisconnect',
            content: {
              team: user.team,
              name: user.name
            }
          }
        }
        await user.save()
        await room.save()
      }
    } catch (err) {
      console.log(`[disconnect] error`, err)
    }
  });

  // doubles as 'returned' toggle
  // status: string
  // pass in client id from the client
  // check if it matches the hostId in the room
  // don't store objectId in the client
  socket.on("setAway", async ({ roomId, clientId, name, team, status }, callback) => {
    try {
      const room = await Room.findOne({ shortId: roomId })
      if (!room) {
        throw new Error('room with shortId', roomId, 'not found')
      } else if (team !== 0 && team !== 1) {
        throw new Error('cannot set away for spectator')
      }

      if (room.host._id.valueOf() !== clientId) {
        const result = await User.findOneAndUpdate({ _id: clientId, roomId }, { status })
        if (!result) {
          throw new Error('failed update to user', clientId, 'in room', roomId)
        }
      } else {
        // host edit
        const result = await User.findOneAndUpdate({ name, roomId }, { status })
        if (!result) {
          throw new Error('failed update by host to user', name, 'in room', roomId)
        }
      }

      if ((team === 0 || team === 1) && 
      room.turn.team === team && 
      room.teams[team].players.length === 1 && 
      (room.gamePhase === 'pregame' || room.gamePhase === 'game') && 
      status === 'away') {
        room.paused = true
      }
      room.serverEvent = {
        'name': 'setAway',
        'content': {
          'team': team, // 0 or 1, can only be a player
          'name': name,
          'status': status // playing, or away
        }
      }
      await room.save()
      return callback(status)
    } catch (err) {
      console.log(`[setAway] error setting away for player from host`, err)
    }
  })

  // socket.on("setAway", async ({ roomId, userId }) => {
  //   // set away for user matching socket id (not using hostId or userId)
  // })

  // teamId: -1 for spectator, 0 for rockets, 1 for ufo
  socket.on("setTeam", async ({ roomId, clientId, name, currTeamId, newTeamId }, callback) => {
    try {
      // additional call; will have to do this when I do authentication anyway
      if (!Room.findOne({ shortId: roomId, host: clientId })) {
        throw new Error('room with shortId', roomId, 'and hostId', clientId, 'not found')
      }
      else if (newTeamId !== -1 && newTeamId !== 0 && newTeamId !== 1) {
        throw new Error('unexpected teamId')
      } else if (newTeamId === -1) {
        // switching into spectator
        const user = await User.findOneAndUpdate({ name, roomId }, { 
          team: newTeamId, 
          status: 'playing' 
        }, { new: true })

        let operation = {}
        operation['$pullAll'] = { 
          [`teams.${currTeamId}.players`]: [{ _id: user._id }] 
        }
        operation['$addToSet'] = { [`spectators`]: user._id }
        operation['$set'] = { 
          'serverEvent': {
            'name': 'setTeam',
            'content': {
              user,
              prevTeam: currTeamId
            }
          }
        }
        
        await Room.findOneAndUpdate({ shortId: roomId }, operation )
        return callback('success')
      } else if (newTeamId === 0 || newTeamId === 1) {
        // switching to a team
        const user = await User.findOneAndUpdate({ name, roomId }, { team: newTeamId }, { new: true })
  
        let operation = {}
        operation['$pullAll'] = { 
          [`spectators`]: [{ _id: user._id }] 
        }
        operation['$addToSet'] = { [`teams.${newTeamId}.players`]: user._id }
        operation['$set'] = { 
          'serverEvent': {
            'name': 'setTeam',
            'content': {
              user,
              prevTeam: currTeamId
            }
          }
        }
        
        await Room.findOneAndUpdate({ shortId: roomId }, operation )
        return callback('success')
      }
    } catch (err) {
      console.log(`[setTeam] error setting away for player from host`, err)
      return callback('fail')
    }
  })

  socket.on("assignHost", async ({ roomId, clientId, userId, team, name }, callback) => {
    // check client is the host of the room // findOneAndUpdate (roomId, newValues)
    // check user is not the host of the room
    // set user as the host
      // this removes client from the host
    try {
      await Room.findOneAndUpdate({ shortId: roomId, host: clientId }, {
        '$set': {
          'host': userId,
          'serverEvent': {
            'name': 'assignHost',
            'content': {
              team,
              name
            }
          }
        }
      })
      return callback('success')
    } catch (err) {
      console.log('[assignHost] error', err)
      return callback('fail')
    }
  })

  socket.on("kick", async ({ roomId, clientId, team, name }, callback) => {
    // check if client is the host of the room // findOneAndUpdate (roomId, newValues)
    // check if user is connected to the room
    // remove player from player list (team0, team1 or spectators)
    // set player's room to null
    // set 'connectedToRoom' to 'false' on player
    try {
      // Check if client is the host of the room
      let room = await Room.findOne({ shortId: roomId, host: clientId })
      if (!room) {
        throw new Error('room with shortId', roomId, 'and hostId', hostId, 'not found')
      }
      
      room.serverEvent = {
        'name': 'kick',
        'content': {
          team,
          name,
        }
      }

      const user = await User.findOneAndDelete({ name, roomId })
      if (!user) {
        throw new Error(`user with name ${name} in room ${roomId} not found`)
      }
      room.serverEvent.content.socketId = user.socketId

      io.to(user.socketId).emit("kicked");
  
      // Remove the user from the room
      if (team === -1) {
        let spectatorIndex = room.spectators.findIndex((spectator) => {
          return spectator._id.valueOf() === user._id.valueOf()
        })
        if (spectatorIndex === -1) {
          throw new Error(`spectator not found in room ${roomId}`)
        } else {
          room.spectators.splice(spectatorIndex, 1)
        }
      } else {
        let playerIndex = room.teams[team].players.findIndex((player) => {
          return player._id.valueOf() === user._id.valueOf()
        })
        if (playerIndex === -1) {
          throw new Error(`player not found in room ${roomId} team ${team}`)
        } else {
          room.teams[team].players.splice(playerIndex, 1)
        }
      }

      if (await roomHasAI(room)) {
        room.serverEvent.content.hasAI = true
      } else {
        room.serverEvent.content.hasAI = false
      }

      // If player had turn, find the next player on the team
      if (room.gamePhase === 'pregame' || room.gamePhase === 'game') {
        const [nextTurn, pause] = await passTurn(room.turn, room.teams, true)
        room.turn = nextTurn
        if (pause) 
          room.paused = pause
      }
      
      await room.save()
      return callback('success')
    } catch (err) {
      console.log('[kick] error', err)
      return callback('fail')
    }
  })

  socket.on('pauseGame', async ({ roomId, clientId, flag }) => {
    try {
      let room = await Room.findOne({ shortId: roomId, host: clientId })
      if (!room) {
        console.log('[pauseGame] room', roomId, 'not updated')
      }

      room.paused = flag
      clearTimeout(room.timerId)
      // start the timer again
      // when you pause, record time
      if (flag) {
        // record time
        if (room.rules.timer) {
          room.pauseTime = Date.now()
          console.log('[pauseGame] cleared timeout')
        }
      } else {
        // subtract paused time from current time
        // add to start and expire time
        if (room.rules.timer) {
          const passedTime = Date.now() - room.pauseTime
          room.turnStartTime += passedTime
          room.turnExpireTime += passedTime

          room.turnsSkipped = 0
          startTimer(room)
          console.log('[pauseGame] started timer')
        }

        // if ai is playing
        // aiMove based on state
        let newPlayer = room.turn.players[room.turn.team]
        let newPlayerDocument = await User.findOne({ _id: room.teams[room.turn.team].players[newPlayer] })
        if (newPlayerDocument.type === 'ai') {
          await aiMove({
            player: newPlayerDocument, 
            room, 
            level: newPlayerDocument.level,
          })
        }
      }
      room.serverEvent = {
        'name': 'pause',
        'content': {
          flag
        }
      }
      await room.save()
    } catch (err) {
      console.log('[pauseGame]', err)
    }
  })

  // rules: 'backdo', 'timer'
  socket.on('setGameRule', async ({ roomId, clientId, rule, flag }) => {
    try {
      let room = await Room.findOne({ shortId: roomId, host: clientId })
      if (!room) 
        throw new Error(`room with short id ${roomId} and host ${clientId} not found`)
      else {
        room.rules[rule] = flag
        room.serverEvent = {
          name: 'setGameRule',
          content: {
            rule,
            flag
          }
        }
        if (rule === 'timer') {
          if (flag) {
            if (!room.paused && room.gamePhase === 'game') {
              room.paused = true
              room.pauseTime = Date.now()
              clearTimeout(room.timerId)
            }
            room.turnStartTime = Date.now()
            room.turnExpireTime = room.turnStartTime + BASE_TURN_EXPIRE_TIME
          } else {
            clearTimeout(room.timerId)
            room.turnExpireTime = null
          }
        }
        await room.save()
      }
    } catch (err) {
      console.log('[setGameRule]', err)
    }
  })
})