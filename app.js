const vgaConstraints = {
  width: { ideal: 320 },
  height: { ideal: 160 }
}

const gun = Gun({
  localStorage: false,
  peers: [
    `${ location.origin }/gun`,
    'https://gun-srv.herokuapp.com/gun',
    'https://gun-us.herokuapp.com/gun',
    'https://gun-eu.herokuapp.com/gun'
  ]
})
const user = gun.user()
const clearUsers = () => {
  const users = document.getElementById('users')
  while (users.firstChild) {
    users.removeChild(users.firstChild)
  }
}
const videoStream = document.getElementById('videoStream')

const peers = {}
let nodeId = null
let stream = null
let roomName = null

const initPeer = (peerId, remotePeer, initiator) => {
  if (peers[peerId]) {
    return
  }
  gun.get('signal').get(peerId).on(str => {
    const data = JSON.parse(str)
    if (data) {
      if (data.for && peers[data.for]) {
        if (!peers[data.for].destroyed) {
          // console.log('got signal for '+data.for);
          // console.log(data.data);
          peers[data.for].signal(data.data)
        }
      }
    }
  })
  peers[peerId] = new SimplePeer({
    initiator,
    trickle: false,
    stream
  })
  peers[peerId].on('signal', data => {
    // console.log('sending signal to '+remotePeer);
    gun.get('signal').get(remotePeer).put(JSON.stringify({ for: remotePeer, from: peerId, data: data }))
  })
  peers[peerId].on('connect', () => {
    // wait for 'connect' event before using the data channel
    // peer.send('connected '+$('#alias').val()+' sends greetings');
    console.log(`${ peerId } connected`)
    // peers[peerId].addStream(stream);
  })
  peers[peerId].on('data', data => {
    // got a data channel message
    console.log(`${ peerId }got a message ${ data }`)
  })
  peers[peerId].on('stream', stream => {
    // got remote video stream, now let's show it in a video tag
    const videos = document.getElementById('videos')
    const video = window.document.createElement('video')
    video.width = 160
    video.height = 120
    video.autoplay = true
    video.muted = false
    video.id = peerId
    videos.appendChild(video)
    if ('srcObject' in video) {
      video.srcObject = stream
    } else {
      video.src = window.URL.createObjectURL(stream) // for older browsers
    }
    video.play()
  })
  peers[peerId].on('close', () => {
    const videos = document.getElementById('videos')
    for (const video of videos.children) {
      if (video.id === peerId) {
        videos.removeChild(video)
      }
    }
  })
}

const enterRoom = async room => {
  const videos = document.getElementById('videos')
  while (videos.firstChild) {
    videos.removeChild(videos.firstChild)
  }

  await gun.get('com').get(room).on(str => {
    const mesh = JSON.parse(str)
    if (mesh && stream && nodeId) {
      const meshNodeIds = Object.keys(mesh)
      meshNodeIds.sort((a, b) => a.localeCompare(b)) // timestamps
      if (meshNodeIds.length > 1) {
        for (const mnId of meshNodeIds) {
          for (const n in mesh[mnId].remotePeers) {
            if (!mesh[mnId].remotePeers[n].initRepl && n === nodeId) {
              initPeer(mesh[mnId].remotePeers[n].id, mesh[mnId].remotePeers[n].localPeer, false)
              mesh[mnId].remotePeers[n].initRepl = true
              console.log(mesh)
              gun.get('com').get(room).put(JSON.stringify(mesh))
            }
          }
        }
      }
    }
  })

  gun.get('com').get(room).once(async str => {
    // init mesh
    let mesh = null
    try {
      mesh = JSON.parse(str)
    } catch (ex) { console.log('new mesh') }
    if (!mesh) {
      mesh = {}
    }
    nodeId = `${ Date.now() }`
    mesh[nodeId] = {
      remotePeers: {}
    }

    // init peer mesh
    const meshNodeIds = Object.keys(mesh)
    meshNodeIds.sort((a, b) => a.localeCompare(b)) // timestamps
    if (meshNodeIds.length > 1) {
      let isFirst = true
      for (const mnId of meshNodeIds) {
        if (isFirst) {
          isFirst = false
        } else {
          if (!mesh[mnId].init && mnId === nodeId) {
            let ctr = 0
            for (const m of meshNodeIds) {
              ctr++
              if (mnId !== m) {
                const l = `${ Date.now() }_${ ctr }l`
                const r = `${ Date.now() }_${ ctr }r`
                mesh[mnId].remotePeers[m] = {
                  id: r,
                  localPeer: l
                }
                initPeer(l, r, true)
              }
            }
            mesh[mnId].init = true
          }
        }
      }
    }
    console.log(mesh)
    gun.get('com').get(room).put(JSON.stringify(mesh))
  })
}

const loggedIn = async () => {
  await gun.get('usrs').open(async pubUsers => {
    clearUsers()
    const users = document.getElementById('users')
    for (const key in pubUsers) {
      if (pubUsers[key] && pubUsers[key].alias) {
        const usr = window.document.createElement('div')
        usr.innerHTML = pubUsers[key].alias
        users.appendChild(usr)
      }
    }
  }).then()

  if (navigator.mediaDevices.getUserMedia) {
    console.log('getUserMedia supported.')
    const constraints = { video: vgaConstraints, audio: true }
    const gotMedia = async vs => {
      videoStream.srcObject = vs
      videoStream.muted = true
      stream = vs
    }
    const onError = err => {
      console.log(`The following error occurred: ${ err }`)
    }
    await navigator.mediaDevices.getUserMedia(constraints).then(gotMedia, onError).then(() => console.log('got usr media'))
  } else {
    console.log('getUserMedia not supported on your browser!')
  }
}

document.querySelector('#signed').style.display = 'none'
// $('#signed').hide()

document.getElementById('clearRoom').addEventListener('click', async e => {
  const currentRoom = document.getElementById('currentRoom')
  currentRoom.innerHTML = ''
  const videos = document.getElementById('videos')
  while (videos.firstChild) {
    videos.removeChild(videos.firstChild)
  }
  await gun.get('com').get(roomName).once(str => {
    const mesh = JSON.parse(str)
    for (const m in mesh) {
      for (const r in mesh[m].remotePeers) {
        peers[mesh[m].remotePeers[r].id] ? peers[mesh[m].remotePeers[r].id].destroy() : null
        peers[mesh[m].remotePeers[r].localPeer] ? peers[mesh[m].remotePeers[r].localPeer].destroy() : null
        delete peers[mesh[m].remotePeers[r].id]
        delete peers[mesh[m].remotePeers[r].localPeer]
      }
    }
  }).then()
  gun.get('com').get(roomName).put(null)
})

document.getElementById('enterRoom').addEventListener('click', async e => {
  const ddRoom = document.getElementById('roomName')
  roomName = ddRoom.options[ddRoom.selectedIndex].value
  const currentRoom = document.getElementById('currentRoom')
  currentRoom.innerHTML = roomName
  await enterRoom(roomName)
})

document.getElementById('leaveRoom').addEventListener('click', async e => {
  const currentRoom = document.getElementById('currentRoom')
  currentRoom.innerHTML = ''

  await gun.get('com').get(roomName).once(async str => {
    const mesh = JSON.parse(str)
    // destroy self initiated peers
    for (const r in mesh[nodeId].remotePeers) {
      peers[mesh[nodeId].remotePeers[r].id] ? peers[mesh[nodeId].remotePeers[r].id].destroy() : null
      peers[mesh[nodeId].remotePeers[r].localPeer] ? peers[mesh[nodeId].remotePeers[r].localPeer].destroy() : null
      delete peers[mesh[nodeId].remotePeers[r].id]
      delete peers[mesh[nodeId].remotePeers[r].localPeer]
    }
    // mesh[nodeId] = null;

    // destroy other initiated peers
    for (const m in mesh) {
      for (const r in mesh[m].remotePeers) {
        if (r === nodeId) {
          peers[mesh[m].remotePeers[r].id] ? peers[mesh[m].remotePeers[r].id].destroy() : null
          peers[mesh[m].remotePeers[r].localPeer] ? peers[mesh[m].remotePeers[r].localPeer].destroy() : null
          delete peers[mesh[m].remotePeers[r].id]
          delete peers[mesh[m].remotePeers[r].localPeer]
        }
      }
    }
  }).then()
})

document.getElementById('up').addEventListener('click', e => {
  const alias = document.getElementById('alias')
  const password = document.getElementById('pass')
  user.create(alias.value, password.value, async ack => {
    if (!ack.err) {
      await gun.get('usrs').set({ alias: alias.value, pub: ack.pub }).then()
      user.auth(alias.value, password.value, res => {
        if (!res.err) {
          user.get('pictures').set(null)
          user.get('stream').set(null)
        }
      })
    }
  })
})

document.getElementById('delUsr').addEventListener('click', e => {
  const alias = document.getElementById('alias')
  const password = document.getElementById('pass')

  gun.get('usrs').load(usrs => {
    for (const u in usrs) {
      if (usrs[u] && alias.value === usrs[u].alias) {
        gun.get('usrs').get(u).put(null)
      }
    }
  })

  user.delete(alias.value, password.value, ack => {
    if (!ack.err) {
      document.getElementById('sign').css('display', 'block')
    }
  })
})

// document.getElementById('logOut').addEventListener('click', e => {
//   user.leave()
//   user = gun.user()
//   document.getElementById('said').style.display = 'none'
//   document.getElementById('sign').style.display = 'block'

//   const usr = document.getElementById('currentUser')
//   usr.innerHTML = ''
// })

async function login (e) {
  const alias = document.getElementById('alias')
  const password = document.getElementById('pass')
  await user.auth(alias.value, password.value).then()
  return false // e.preventDefault()
}

document.getElementById('login').addEventListener('click', e => {
  const alias = document.getElementById('alias')
  const password = document.getElementById('pass')
  user.auth(alias.value, password.value)
})

gun.on('auth', function () {
  const alias = document.getElementById('alias')

  document.getElementById('sign').style.display = 'none'
  // document.getElementById('said').style.display = 'block'
  document.getElementById('signed').style.display = 'block'

  const usr = document.getElementById('localUser')
  usr.innerHTML = alias.value
  loggedIn()
})
