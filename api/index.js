const path = require('path')
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const { version, validate } = require('uuid')

const PORT = process.env.PORT || 3001

const ACTIONS = {
  JOIN: 'join',
  LEAVE: 'leave',
  SHARE_ROOMS: 'share-rooms',
  ADD_PEER: 'add-peer',
  REMOVE_PEER: 'remove-peer',
  RELAY_SDP: 'relay-sdp',
  RELAY_ICE: 'relay-ice',
  ICE_CANDIDATE: 'ice-candidate',
  SESSION_DESCRIPTION: 'session-description'
}

function getClientRooms() {
  const { rooms } = io.sockets.adapter

  console.log(rooms)
  console.log('keys', [...rooms.keys()])

  return [...rooms.keys()]
}

function shareRoomsInfo() {
  io.emit(ACTIONS.SHARE_ROOMS, {
    rooms: getClientRooms()
  })
}

io.on('connection', (socket) => {
  shareRoomsInfo()

  socket.on(ACTIONS.JOIN, (config) => {
    console.log('config', config)

    const { room: roomID } = config
    const { rooms: joinedRooms } = socket

    if (Array.from(joinedRooms).includes(roomID)) {
      return console.warn(`Already joined to ${roomID}`)
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

    clients.forEach((clientID) => {
      console.log('ADDPEER', clientID)

      io.to(clientID).emit(ACTIONS.ADD_PEER, {
        peerID: socket.id,
        createOffer: false
      })

      socket.emit(ACTIONS.ADD_PEER, {
        peerID: clientID,
        createOffer: true
      })
    })

    socket.join(roomID)
    shareRoomsInfo()
  })

  function leaveRoom() {
    const { rooms } = socket

    Array.from(rooms)
      // LEAVE ONLY CLIENT CREATED ROOM
      .filter((roomID) => validate(roomID) && version(roomID) === 4)
      .forEach((roomID) => {
        const clients = Array.from(io.sockets.adapter.rooms.get(roomID) || [])

        clients.forEach((clientID) => {
          io.to(clientID).emit(ACTIONS.REMOVE_PEER, {
            peerID: socket.id
          })

          socket.emit(ACTIONS.REMOVE_PEER, {
            peerID: clientID
          })
        })

        socket.leave(roomID)
      })

    shareRoomsInfo()
  }

  socket.on(ACTIONS.LEAVE, leaveRoom)
  socket.on('disconnecting', leaveRoom)

  socket.on(ACTIONS.RELAY_SDP, ({ peerID, sessionDescription }) => {
    io.to(peerID).emit(ACTIONS.SESSION_DESCRIPTION, {
      peerID: socket.id,
      sessionDescription
    })
  })

  socket.on(ACTIONS.RELAY_ICE, ({ peerID, iceCandidate }) => {
    io.to(peerID).emit(ACTIONS.ICE_CANDIDATE, {
      peerID: socket.id,
      iceCandidate
    })
  })
})

const publicPath = path.join(__dirname, '../dist')

app.use(express.static(publicPath))

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'))
})

server.listen(PORT, () => {
  console.log('Server Started!')
})
